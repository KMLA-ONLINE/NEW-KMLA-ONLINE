-- 스토리지: 첨부 정리 큐, 그리고 버킷 allowlist가 DB의 MIME 레지스트리와 어긋나지 않는지.
-- supabase/schemas/09-storage.sql
--
-- 정리 큐는 service_role의 것이라 auth 픽스처가 필요 없다.

begin;

do $$
declare
  queue1 bigint;
begin
  insert into private.attachment_cleanup_queue (storage_bucket, storage_path)
  values ('avatars', '11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555')
  returning id into queue1;

  if not exists (select 1 from public.claim_storage_cleanup(1) where id = queue1) then
    raise exception 'storage cleanup claim failed';
  end if;

  perform public.fail_storage_cleanup(queue1, 'runtime check');
  if not exists (
    select 1 from private.attachment_cleanup_queue
    where id = queue1 and attempts = 1 and last_error = 'runtime check' and processed_at is null
  ) then
    raise exception 'storage cleanup retry failed';
  end if;

  perform public.complete_storage_cleanup(queue1);
  if not exists (select 1 from private.attachment_cleanup_queue where id = queue1 and processed_at is not null) then
    raise exception 'storage cleanup completion failed';
  end if;

  perform public.enqueue_due_storage_cleanup();

  if has_function_privilege('authenticated', 'public.enqueue_due_storage_cleanup()', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.enqueue_due_storage_cleanup()', 'EXECUTE')
    or has_table_privilege('authenticated', 'private.attachment_cleanup_queue', 'SELECT')
    or not has_table_privilege('service_role', 'private.attachment_cleanup_queue', 'SELECT')
  then
    raise exception 'service role grant contract failed';
  end if;

  -- -------------------------------------------------------------------------
  -- 버킷 allowlist는 파생값이지 두 번째 손사본이 아니다
  -- -------------------------------------------------------------------------

  if (
    select count(*)
    from storage.buckets
    where id in ('post-files', 'message-files')
      and allowed_mime_types @> array[
        'text/markdown',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.hancom.hwpx'
      ]::text[]
  ) <> 2 then
    raise exception 'document attachment MIME allowlist contract failed';
  end if;

  -- public.message_attachment_mime_types가 "메시지에 무엇을 붙일 수 있는가"의 유일한 출처다.
  -- 버킷의 allowlist는 거기서 생성되므로, 둘이 어긋나는 것이 여기서 잡는 실패다.
  if (
    select b.allowed_mime_types from storage.buckets b where b.id = 'message-files'
  ) is distinct from (
    select array_agg(content_type order by content_type) from public.message_attachment_mime_types
  ) then
    raise exception 'message-files bucket allowlist has drifted from message_attachment_mime_types';
  end if;

  if (
    select b.file_size_limit from storage.buckets b where b.id = 'message-files'
  ) is distinct from (select max(max_bytes) from public.message_attachment_mime_types) then
    raise exception 'message-files bucket file_size_limit has drifted from message_attachment_mime_types';
  end if;

  -- 암호화된 첨부는 storage 입장에서 전부 octet-stream이다. 그걸 message-files에 허용하면
  -- 위의 화이트리스트 계약이 -- image/svg+xml 차단을 포함해 -- 통째로 무의미해진다. 버킷을
  -- 가른 이유의 전부가 이것이고, 두 allowlist가 섞이지 않는 것이 그 분리의 전부다.
  if (
    select b.allowed_mime_types from storage.buckets b where b.id = 'message-files-encrypted'
  ) is distinct from array['application/octet-stream']::text[] then
    raise exception 'the encrypted attachment bucket must accept opaque bytes and nothing else';
  end if;
  if exists (
    select 1 from storage.buckets
    where id = 'message-files' and 'application/octet-stream' = any (allowed_mime_types)
  ) then
    raise exception 'message-files must not accept opaque bytes: that is what the encrypted bucket is for';
  end if;

  -- 암호문은 평문보다 nonce(12) + GCM 태그(16)만큼 크다. 상한이 그걸 감당하지 못하면
  -- 최대 크기 파일이 storage에서 거부된다.
  if (
    select b.file_size_limit from storage.buckets b where b.id = 'message-files-encrypted'
  ) < (select max(max_bytes) + 28 from public.message_attachment_mime_types) then
    raise exception 'the encrypted bucket must have room for the AEAD overhead';
  end if;

  -- 메시지는 미디어를 받고 SVG는 계속 거부한다. kind는 보편값이라 public.mime_types에 살고,
  -- "이 표면이 무엇을 얼마나 받는가"는 표면별 결정이다.
  if not exists (
      select 1 from public.message_attachment_mime_types allowed
      join public.mime_types mime on mime.content_type = allowed.content_type
      where mime.kind = 'audio'
    )
    or not exists (
      select 1 from public.message_attachment_mime_types allowed
      join public.mime_types mime on mime.content_type = allowed.content_type
      where mime.kind = 'video'
    )
    or exists (select 1 from public.message_attachment_mime_types where content_type = 'image/svg+xml')
  then
    raise exception 'message attachment MIME registry contract failed';
  end if;

  -- 받아들이는 모든 타입은 분류되어 있다. FK가 보장하지만, 분류 테이블을 잊은 미래의 표면이
  -- 조용히 통과하지 않도록 여기서도 크게 실패시킨다.
  if exists (
    select 1 from public.message_attachment_mime_types allowed
    where not exists (select 1 from public.mime_types mime where mime.content_type = allowed.content_type)
  ) then
    raise exception 'message attachment MIME registry has unclassified types';
  end if;
end
$$;

rollback;
