$ErrorActionPreference = "Stop"

# Exercises all four storage-maintenance paths in one shot: a queued blob, a post tombstone,
# a read notification, and a space soft-deleted past their cutoffs. It also asserts a LIVE
# space survives -- without that, "delete everything" would pass too.
#
# ASCII only, on purpose: Windows PowerShell 5.1 reads .ps1 as ANSI, so UTF-8 Korean comments
# come back mojibake and the parser dies on them. Every other test file in this repo is Korean.
#
# Unlike the .sql tests this does NOT roll back -- the point is that the edge function reaches a
# really-committed DB over HTTP. Run `npx supabase db reset` afterwards.

$status = npx supabase status -o json | ConvertFrom-Json
$user = [guid]::NewGuid().ToString()
$suffix = [guid]::NewGuid().ToString("N")

$seedSql = @"
insert into auth.users (id, email) values ('$user', 'maintenance-check-$suffix@example.com');
update public.profiles set type='teacher', status='accepted' where auth_user_id='$user';

do `$`$
declare p bigint; live_space bigint; doomed_space bigint;
begin
  select id into p from public.profiles where auth_user_id='$user';
  perform set_config('request.jwt.claim.sub','$user',true);

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path)
  values ('avatars','maintenance-check/$suffix');

  live_space := public.create_space('community','live $suffix');
  insert into public.notifications (recipient_id,type,space_id,read_at)
  values (p,'space_invited',live_space,now()-interval '61 days');
  insert into public.posts (space_id,author_id,title,content,deleted_at)
  values (live_space,p,'tombstone','body', now()-interval '8 days');

  doomed_space := public.create_space('community','doomed $suffix');
  insert into public.posts (space_id,author_id,title,content) values (doomed_space,p,'post','body');
  perform public.soft_delete_space(doomed_space);
  update public.spaces set deleted_at = now()-interval '8 days' where id=doomed_space;
end `$`$;
"@

$seedSql | docker exec -i supabase_db_NEW-KMLA-ONLINE psql -U postgres -d postgres -q -v ON_ERROR_STOP=1

$secretHeaders = @{ apikey = $status.SECRET_KEY; "Content-Type" = "application/json" }
$maintenance = Invoke-RestMethod -Method Post -Uri "$($status.FUNCTIONS_URL)/storage-maintenance" -Headers $secretHeaders -Body "{}"

# Every term must be zero. The last one inverts: the live space MUST still be there.
$checkSql = @"
select
  (select count(*) from private.attachment_cleanup_queue
   where storage_path='maintenance-check/$suffix' and processed_at is null)
  + (select count(*) from public.posts where deleted_at < now()-interval '7 days')
  + (select count(*) from public.notifications where recipient_id = (select id from public.profiles where auth_user_id='$user') and read_at < now()-interval '60 days')
  + (select count(*) from public.spaces where deleted_at < now()-interval '7 days')
  + (select count(*) from public.spaces where name='doomed $suffix')
  + (1 - (select count(*) from public.spaces where name='live $suffix'));
"@

$leftover = ($checkSql | docker exec -i supabase_db_NEW-KMLA-ONLINE psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 | Select-Object -Last 1)
if ($leftover -ne "0") {
  throw "storage maintenance left $leftover item(s) unhandled: $($maintenance | ConvertTo-Json -Compress)"
}

Write-Output "storage maintenance=$($maintenance | ConvertTo-Json -Compress)"
Write-Output "queued blob, post tombstone, read notification and due space all cleaned; live space kept"
