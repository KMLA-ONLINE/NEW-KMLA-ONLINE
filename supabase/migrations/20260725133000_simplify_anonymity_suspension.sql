-- Expired rows no longer carry strike history, and an old escalated suspension
-- must not outlive the new fixed seven-day policy. Avoid notifying users again
-- while shortening existing deadlines.
alter table public.space_anonymity_suspensions disable trigger trg_notify_on_anonymity_suspended;

delete from public.space_anonymity_suspensions
where suspended_until <= now();

update public.space_anonymity_suspensions
set suspended_until = least(suspended_until, now() + interval '7 days')
where suspended_until > now();

alter table public.space_anonymity_suspensions enable trigger trg_notify_on_anonymity_suspended;

alter table public.space_anonymity_suspensions drop column if exists strike_count;

drop function public.suspend_comment_author_anonymity(bigint);
drop function public.suspend_post_author_anonymity(bigint);
drop function private.suspend_anonymity(bigint,bigint);

create function private.suspend_anonymity(p_space_id bigint, p_author_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  insert into public.space_anonymity_suspensions(space_id,user_id,suspended_until,suspended_by)
  values (p_space_id, p_author_id, now() + interval '7 days', caller_id)
  on conflict (space_id,user_id) do update
  set suspended_until=excluded.suspended_until,
      suspended_by=excluded.suspended_by,
      created_at=excluded.created_at
  where public.space_anonymity_suspensions.suspended_until <= now();
end;
$$;

revoke execute on function private.suspend_anonymity(bigint,bigint)
from public, anon, authenticated, service_role;

create function public.suspend_post_author_anonymity(p_post_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare target record;
begin
  select * into target from private.require_anonymous_post_author(p_post_id);
  perform private.suspend_anonymity(target.space_id, target.author_id);
end;
$$;

create function public.suspend_comment_author_anonymity(p_comment_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare target record;
begin
  select * into target from private.require_anonymous_comment_author(p_comment_id);
  perform private.suspend_anonymity(target.space_id, target.author_id);
end;
$$;

create or replace function private.undo_anonymity_suspension(p_space_id bigint, p_author_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  delete from public.space_anonymity_suspensions
  where space_id=p_space_id and user_id=p_author_id;
end;
$$;

revoke execute on function private.undo_anonymity_suspension(bigint,bigint)
from public, anon, authenticated, service_role;
revoke execute on function public.suspend_post_author_anonymity(bigint), public.suspend_comment_author_anonymity(bigint)
from public, anon, authenticated, service_role;
grant execute on function public.suspend_post_author_anonymity(bigint), public.suspend_comment_author_anonymity(bigint)
to authenticated;
