create function private.require_current_profile(p_accepted boolean default true)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile_id bigint;
begin
  select p.id into profile_id
  from public.profiles as p
  where p.auth_user_id = (select auth.uid())
    and p.deleted_at is null
    and (not p_accepted or p.status = 'accepted');
  if profile_id is null then raise exception 'active profile required'; end if;
  return profile_id;
end;
$$;

create function private.require_app_admin()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare profile_id bigint := private.require_current_profile(true);
begin
  if not exists (select 1 from public.profiles where id = profile_id and role = 'admin') then
    raise exception 'app admin required';
  end if;
  return profile_id;
end;
$$;

create function private.display_author_name(p_author_id bigint, p_is_anonymous boolean)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_is_anonymous then coalesce(p.anonymous_username, '익명 ' || p.id::text)
    else p.name
  end
  from public.profiles as p
  where p.id = p_author_id
$$;

create function public.create_space(
  p_type public.space_type,
  p_name text,
  p_description text,
  p_join_policy public.space_join_policy
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id bigint := private.require_current_profile(true); space_id bigint;
begin
  if p_type = 'group' then perform private.require_app_admin(); end if;
  insert into public.spaces (type, name, description, join_policy, created_by)
  values (p_type, btrim(p_name), p_description, p_join_policy, caller_id)
  returning id into space_id;
  insert into public.space_members (space_id, user_id, role) values (space_id, caller_id, 'owner');
  return space_id;
end;
$$;

create function public.update_space(
  p_space_id bigint,
  p_name text,
  p_description text,
  p_join_policy public.space_join_policy,
  p_type public.space_type default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = caller_id
      and role in ('owner', 'admin') and banned_at is null
  ) then raise exception 'space owner or admin required'; end if;
  if p_type is not null and p_type is distinct from (select type from public.spaces where id = p_space_id) then
    perform private.require_app_admin();
  end if;
  update public.spaces set name = btrim(p_name), description = p_description,
    join_policy = p_join_policy, type = coalesce(p_type, type)
  where id = p_space_id and deleted_at is null;
  if not found then raise exception 'active space not found'; end if;
end;
$$;

create function public.join_space(p_space_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists (select 1 from public.spaces where id = p_space_id and deleted_at is null and join_policy = 'auto_join') then
    raise exception 'space does not allow automatic joining';
  end if;
  if exists (select 1 from public.space_members where space_id = p_space_id and user_id = caller_id) then
    raise exception 'membership already exists';
  end if;
  insert into public.space_members (space_id, user_id) values (p_space_id, caller_id);
end;
$$;

create function public.add_space_member(p_space_id bigint, p_user_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists (select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and role in ('owner','admin') and banned_at is null)
    then raise exception 'space owner or admin required'; end if;
  if not exists (select 1 from public.profiles where id=p_user_id and status='accepted' and deleted_at is null)
    then raise exception 'accepted target required'; end if;
  insert into public.space_members (space_id,user_id) values (p_space_id,p_user_id);
end;
$$;

create function public.leave_space(p_space_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if exists (select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and role='owner')
    then raise exception 'owner must transfer ownership first'; end if;
  delete from public.space_members where space_id=p_space_id and user_id=caller_id;
  if not found then raise exception 'membership not found'; end if;
end;
$$;

create function public.set_space_member_role(p_space_id bigint, p_user_id bigint, p_role public.member_role)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if p_role = 'owner' then raise exception 'use transfer_space_owner'; end if;
  if not exists (select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and role='owner' and banned_at is null)
    then raise exception 'space owner required'; end if;
  update public.space_members set role=p_role where space_id=p_space_id and user_id=p_user_id and role <> 'owner';
  if not found then raise exception 'eligible membership not found'; end if;
end;
$$;

create function public.transfer_space_owner(p_space_id bigint, p_new_owner_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  perform 1 from public.space_members where space_id=p_space_id for update;
  if not exists (select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and role='owner' and banned_at is null)
    then raise exception 'space owner required'; end if;
  if not exists (
    select 1 from public.space_members sm join public.profiles p on p.id=sm.user_id
    where sm.space_id=p_space_id and sm.user_id=p_new_owner_id and sm.banned_at is null
      and p.status='accepted' and p.deleted_at is null
  ) then raise exception 'eligible new owner required'; end if;
  update public.space_members set role='admin' where space_id=p_space_id and user_id=caller_id;
  update public.space_members set role='owner' where space_id=p_space_id and user_id=p_new_owner_id;
end;
$$;

create function public.set_space_member_ban(p_space_id bigint, p_user_id bigint, p_banned boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); caller_role public.member_role; target_role public.member_role;
begin
  select role into caller_role from public.space_members where space_id=p_space_id and user_id=caller_id and banned_at is null;
  select role into target_role from public.space_members where space_id=p_space_id and user_id=p_user_id;
  if caller_id=p_user_id or caller_role not in ('owner','admin') or target_role is null or target_role='owner'
    or (caller_role='admin' and target_role in ('owner','admin')) then raise exception 'cannot change target ban'; end if;
  update public.space_members set banned_at=case when p_banned then now() else null end,
    banned_by=case when p_banned then caller_id else null end,
    ban_reason=case when p_banned then p_reason else null end
  where space_id=p_space_id and user_id=p_user_id;
end;
$$;

create function public.create_direct_chat(p_other_user_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); first_id bigint; second_id bigint; room_id bigint;
begin
  if caller_id=p_other_user_id or not exists (select 1 from public.profiles where id=p_other_user_id and status='accepted' and deleted_at is null)
    then raise exception 'accepted different target required'; end if;
  first_id:=least(caller_id,p_other_user_id); second_id:=greatest(caller_id,p_other_user_id);
  perform pg_advisory_xact_lock(hashtextextended(first_id::text||':'||second_id::text,0));
  select dcp.room_id into room_id from public.direct_chat_pairs dcp where dcp.user1_id=first_id and dcp.user2_id=second_id;
  if room_id is not null then return room_id; end if;
  insert into public.chat_rooms (is_group,created_by) values (false,caller_id) returning id into room_id;
  insert into public.direct_chat_pairs (room_id,user1_id,user2_id) values (room_id,first_id,second_id);
  insert into public.chat_room_members (room_id,user_id) values (room_id,first_id),(room_id,second_id);
  return room_id;
end;
$$;

create function public.create_group_chat(p_name text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); room_id bigint;
begin
  insert into public.chat_rooms(name,is_group,created_by) values(btrim(p_name),true,caller_id) returning id into room_id;
  insert into public.chat_room_members(room_id,user_id) values(room_id,caller_id);
  return room_id;
end;
$$;

create function public.add_group_member(p_room_id bigint,p_user_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.chat_rooms r join public.chat_room_members m on m.room_id=r.id where r.id=p_room_id and r.is_group and m.user_id=caller_id)
    or not exists(select 1 from public.profiles where id=p_user_id and status='accepted' and deleted_at is null)
    then raise exception 'eligible group member required'; end if;
  insert into public.chat_room_members(room_id,user_id) values(p_room_id,p_user_id);
end;
$$;

create function public.remove_group_member(p_room_id bigint,p_user_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.chat_rooms where id=p_room_id and is_group) then raise exception 'group room required'; end if;
  if caller_id<>p_user_id
    and not exists(select 1 from public.chat_rooms where id=p_room_id and created_by=caller_id)
    and not exists(select 1 from public.profiles where id=caller_id and role='admin')
    then raise exception 'not allowed to remove member'; end if;
  delete from public.chat_room_read_states where room_id=p_room_id and user_id=p_user_id;
  delete from public.message_reads mr using public.messages m where mr.message_id=m.id and m.room_id=p_room_id and mr.user_id=p_user_id;
  delete from public.chat_room_members where room_id=p_room_id and user_id=p_user_id;
end;
$$;

create function public.set_post_pin(p_post_id bigint,p_is_pinned boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.posts p join public.space_members sm on sm.space_id=p.space_id where p.id=p_post_id and p.deleted_at is null and sm.user_id=caller_id and sm.role in ('owner','admin','manager') and sm.banned_at is null)
    then raise exception 'space manager required'; end if;
  update public.posts set is_pinned=p_is_pinned,pinned_at=case when p_is_pinned then now() else null end,pinned_by=case when p_is_pinned then caller_id else null end where id=p_post_id;
end;
$$;

create function public.submit_onboarding(p_name text,p_type public.profile_type,p_student_number char(6),p_class_no int2,p_cohort int2,p_gender public.profile_gender,p_phone_number text,p_birthday date,p_description text,p_dorm_room int2)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.profiles set name=btrim(p_name),type=p_type,student_number=p_student_number,class_no=p_class_no,cohort=p_cohort,gender=p_gender,phone_number=p_phone_number,birthday=p_birthday,description=p_description,dorm_room=p_dorm_room,onboarding_completed_at=now(),status='pending',status_updated_at=now(),status_updated_by=null
  where id=caller_id and status in ('none','rejected');
  if not found then raise exception 'onboarding not allowed'; end if;
end;
$$;

create function public.review_profile(p_profile_id bigint,p_status public.profile_status)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_app_admin();
begin
  if p_status not in ('accepted','rejected') then raise exception 'invalid review status'; end if;
  update public.profiles set status=p_status,status_updated_at=now(),status_updated_by=caller_id where id=p_profile_id and status='pending';
  if not found then raise exception 'pending profile not found'; end if;
end;
$$;

create function public.set_anonymous_username(p_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.profiles set anonymous_username=case when p_value is null then null else btrim(p_value) end
  where id=caller_id and status<>'withdrawn';
  if not found then raise exception 'withdrawn profile cannot change anonymous username'; end if;
end;
$$;

create function public.soft_delete_space(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); target_type public.space_type;
begin
  select type into target_type from public.spaces where id=p_id and deleted_at is null for update;
  if target_type is null then return; end if;
  if target_type='group' then perform private.require_app_admin();
  elsif not exists(select 1 from public.space_members where space_id=p_id and user_id=caller_id and role in ('owner','admin') and banned_at is null) then raise exception 'space manager required'; end if;
  update public.spaces set deleted_at=now(),deleted_by=caller_id where id=p_id;
end;
$$;

create function public.soft_delete_post(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); target_author_id bigint; target_space_id bigint;
begin
  select author_id,space_id into target_author_id,target_space_id from public.posts where id=p_id and deleted_at is null for update;
  if target_author_id is null then return; end if;
  if target_author_id<>caller_id and not exists(select 1 from public.space_members where space_id=target_space_id and user_id=caller_id and role in ('owner','admin') and banned_at is null)
    then raise exception 'post author or space manager required'; end if;
  update public.posts set deleted_at=now(),deleted_by=caller_id where id=p_id;
end;
$$;

create function public.soft_delete_comment(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); target_author_id bigint; target_space_id bigint;
begin
  select c.author_id,p.space_id into target_author_id,target_space_id from public.comments c join public.posts p on p.id=c.post_id where c.id=p_id and c.deleted_at is null for update of c;
  if target_author_id is null then return; end if;
  if target_author_id<>caller_id and not exists(select 1 from public.space_members where space_id=target_space_id and user_id=caller_id and role in ('owner','admin') and banned_at is null)
    then raise exception 'comment author or space manager required'; end if;
  update public.comments set content='삭제된 댓글입니다.',deleted_at=now(),deleted_by=caller_id where id=p_id;
end;
$$;

create function public.soft_delete_message(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); target_sender_id bigint;
begin
  select sender_id into target_sender_id from public.messages where id=p_id and deleted_at is null for update;
  if target_sender_id is null then return; end if;
  if target_sender_id<>caller_id then raise exception 'message sender required'; end if;
  update public.messages set deleted_at=now(),deleted_by=caller_id where id=p_id;
end;
$$;

create function public.withdraw_profile()
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  perform 1 from public.profiles where id=caller_id for update;
  if exists(select 1 from public.profiles where id=caller_id and role='admin') or exists(select 1 from public.space_members sm join public.spaces s on s.id=sm.space_id where sm.user_id=caller_id and sm.role='owner' and s.deleted_at is null)
    then raise exception 'transfer owner/admin responsibilities first'; end if;
  update public.profiles set name='탈퇴한 사용자',anonymous_username=null,role='user',student_number=null,class_no=null,cohort=null,gender=null,phone_number=null,avatar_url=null,birthday=null,description=null,status='withdrawn',dorm_room=null,status_updated_at=now(),status_updated_by=null,deleted_at=now() where id=caller_id;
end;
$$;

create function public.search_posts(p_query text,p_space_type public.space_type default null,p_space_id bigint default null)
returns table(post_id bigint,title text,content_snippet text,author_name text,space_name text,created_at timestamptz,match_type text)
language plpgsql security invoker set search_path = '' as $$
declare normalized_query text := regexp_replace(lower(btrim(p_query)), '\s+', '', 'g');
begin
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or normalized_query='' then raise exception 'query must contain 1 to 200 characters'; end if;
  return query
  select chosen.post_id,chosen.title,chosen.content_snippet,chosen.author_name,chosen.space_name,chosen.created_at,chosen.match_type
  from (
    select distinct on (p.id) p.id as post_id,p.title,
      case when regexp_replace(lower(p.title),'\s+','','g') ilike '%'||normalized_query||'%' then p.title
           when regexp_replace(lower(p.content),'\s+','','g') ilike '%'||normalized_query||'%' then left(p.content,300)
           else left(c.content,300) end as content_snippet,
      private.display_author_name(p.author_id,p.is_anonymous) as author_name,s.name as space_name,p.created_at,
      case when regexp_replace(lower(p.title),'\s+','','g') ilike '%'||normalized_query||'%' then 'post_title'
           when regexp_replace(lower(p.content),'\s+','','g') ilike '%'||normalized_query||'%' then 'post_content'
           else 'comment_content' end as match_type
    from public.posts p join public.spaces s on s.id=p.space_id
    left join public.comments c on c.post_id=p.id and c.deleted_at is null
    where p.deleted_at is null and s.deleted_at is null
      and (p_space_type is null or p.space_type=p_space_type) and (p_space_id is null or p.space_id=p_space_id)
      and (regexp_replace(lower(p.title),'\s+','','g') ilike '%'||normalized_query||'%'
        or regexp_replace(lower(p.content),'\s+','','g') ilike '%'||normalized_query||'%'
        or regexp_replace(lower(c.content),'\s+','','g') ilike '%'||normalized_query||'%')
    order by p.id,
      case when regexp_replace(lower(p.title),'\s+','','g') ilike '%'||normalized_query||'%' then 1 when regexp_replace(lower(p.content),'\s+','','g') ilike '%'||normalized_query||'%' then 2 else 3 end
  ) as chosen
  order by chosen.created_at desc,chosen.post_id desc
  limit 50;
end;
$$;

create function public.search_messages(p_query text,p_room_id bigint)
returns table(message_id bigint,content_snippet text,sender_name text,created_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare normalized_query text := regexp_replace(lower(btrim(p_query)), '\s+', '', 'g');
begin
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or normalized_query='' then raise exception 'query must contain 1 to 200 characters'; end if;
  return query select m.id,left(m.content,300),p.name,m.created_at
  from public.messages m join public.profiles p on p.id=m.sender_id
  where m.room_id=p_room_id and m.deleted_at is null
    and regexp_replace(lower(m.content),'\s+','','g') ilike '%'||normalized_query||'%'
  order by m.created_at desc,m.id desc limit 50;
end;
$$;

revoke execute on all functions in schema public from public, anon, authenticated, service_role;
revoke execute on function private.require_current_profile(boolean) from public, anon, authenticated, service_role;
revoke execute on function private.require_app_admin() from public, anon, authenticated, service_role;
revoke execute on function private.display_author_name(bigint,boolean) from public, anon, authenticated, service_role;

grant execute on function public.create_space(public.space_type,text,text,public.space_join_policy) to authenticated;
grant execute on function public.update_space(bigint,text,text,public.space_join_policy,public.space_type) to authenticated;
grant execute on function public.join_space(bigint), public.add_space_member(bigint,bigint), public.leave_space(bigint) to authenticated;
grant execute on function public.set_space_member_role(bigint,bigint,public.member_role), public.transfer_space_owner(bigint,bigint), public.set_space_member_ban(bigint,bigint,boolean,text) to authenticated;
grant execute on function public.create_direct_chat(bigint), public.create_group_chat(text), public.add_group_member(bigint,bigint), public.remove_group_member(bigint,bigint) to authenticated;
grant execute on function public.set_post_pin(bigint,boolean), public.submit_onboarding(text,public.profile_type,char,int2,int2,public.profile_gender,text,date,text,int2), public.review_profile(bigint,public.profile_status), public.set_anonymous_username(text) to authenticated;
grant execute on function public.soft_delete_space(bigint), public.soft_delete_post(bigint), public.soft_delete_comment(bigint), public.soft_delete_message(bigint), public.withdraw_profile() to authenticated;
grant execute on function public.search_posts(text,public.space_type,bigint), public.search_messages(text,bigint) to authenticated;

create function public.update_verified_profile_identity(p_profile_id bigint,p_type public.profile_type,p_student_number char(6),p_class_no int2,p_cohort int2,p_dorm_room int2)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_app_admin();
  update public.profiles set type=p_type,student_number=p_student_number,class_no=p_class_no,cohort=p_cohort,dorm_room=p_dorm_room where id=p_profile_id and status<>'withdrawn';
  if not found then raise exception 'active profile not found'; end if;
end $$;

create function public.change_profile_status(p_profile_id bigint,p_status public.profile_status)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_app_admin();
begin
  if p_status='withdrawn' then raise exception 'use withdrawal lifecycle for withdrawn status'; end if;
  if p_status<>'accepted' and (exists(select 1 from public.profiles where id=p_profile_id and role='admin') or exists(select 1 from public.space_members sm join public.spaces s on s.id=sm.space_id where sm.user_id=p_profile_id and sm.role='owner' and s.deleted_at is null))
    then raise exception 'transfer owner/admin responsibilities first'; end if;
  update public.profiles set status=p_status,status_updated_at=now(),status_updated_by=caller_id where id=p_profile_id;
  if not found then raise exception 'profile not found'; end if;
end $$;

create function public.change_app_role(p_profile_id bigint,p_role public.app_role)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_app_admin();
  perform pg_advisory_xact_lock(hashtextextended('public.app_admin_set',0));
  perform 1 from public.profiles where id=p_profile_id for update;
  if p_role='user' and (select count(*) from public.profiles where role='admin' and status='accepted' and deleted_at is null)<=1 and exists(select 1 from public.profiles where id=p_profile_id and role='admin' and status='accepted' and deleted_at is null)
    then raise exception 'at least one accepted app admin required'; end if;
  update public.profiles set role=p_role
  where id=p_profile_id and status<>'withdrawn'
    and (p_role='user' or (status='accepted' and deleted_at is null));
  if not found then raise exception 'eligible profile not found'; end if;
end $$;

create function public.grant_user_permission(p_user_id bigint,p_permission_key text)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_app_admin();
begin insert into public.user_permissions(user_id,permission_key,granted_by) values(p_user_id,p_permission_key,caller_id) on conflict(user_id,permission_key) do update set granted_at=now(),granted_by=excluded.granted_by; end $$;
create function public.revoke_user_permission(p_user_id bigint,p_permission_key text)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_app_admin(); delete from public.user_permissions where user_id=p_user_id and permission_key=p_permission_key; end $$;
create function public.upsert_permission(p_key text,p_name text,p_description text)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_app_admin(); insert into public.permissions(key,name,description) values(btrim(p_key),btrim(p_name),p_description) on conflict(key) do update set name=excluded.name,description=excluded.description; end $$;
create function public.upsert_reaction_type(p_id bigint,p_key text,p_name text,p_icon text,p_sort_order int4)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_app_admin();
  if p_id is null then
    insert into public.reaction_types(key,name,icon,sort_order)
    values(btrim(p_key),btrim(p_name),p_icon,p_sort_order::int2);
  else
    insert into public.reaction_types(id,key,name,icon,sort_order)
    values(p_id,btrim(p_key),btrim(p_name),p_icon,p_sort_order::int2)
    on conflict(id) do update set key=excluded.key,name=excluded.name,icon=excluded.icon,sort_order=excluded.sort_order;
    perform setval('public.reaction_types_id_seq',greatest((select max(id) from public.reaction_types),1),true);
  end if;
end $$;

create function public.create_club(p_name text,p_description text,p_type public.club_type)
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint; begin perform private.require_app_admin(); insert into public.clubs(name,description,type) values(btrim(p_name),p_description,p_type) returning id into result; return result; end $$;
create function public.update_club(p_club_id bigint,p_name text,p_description text,p_type public.club_type)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_app_admin(); update public.clubs set name=btrim(p_name),description=p_description,type=p_type where id=p_club_id; if not found then raise exception 'club not found'; end if; end $$;
create function public.delete_club(p_club_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_app_admin(); delete from public.clubs where id=p_club_id; if not found then raise exception 'club not found'; end if; end $$;
create function public.create_club_apply_round(p_name text,p_starts_at timestamptz,p_ends_at timestamptz)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_app_admin(); result bigint; begin insert into public.club_apply_rounds(name,starts_at,ends_at,created_by) values(btrim(p_name),p_starts_at,p_ends_at,caller_id) returning id into result; return result; end $$;
create function public.update_club_apply_round(p_round_id bigint,p_name text,p_starts_at timestamptz,p_ends_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_app_admin(); update public.club_apply_rounds set name=btrim(p_name),starts_at=p_starts_at,ends_at=p_ends_at where id=p_round_id; if not found then raise exception 'round not found'; end if; end $$;
create function public.delete_club_apply_round(p_round_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_app_admin(); delete from public.club_apply_rounds where id=p_round_id; if not found then raise exception 'round not found'; end if; end $$;

create function private.require_service_role()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    and coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'role','')<>'service_role'
    and session_user not in ('service_role','postgres')
  then raise exception 'service role required'; end if;
end $$;

create function public.bootstrap_first_app_admin(p_profile_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_service_role(); perform pg_advisory_xact_lock(hashtextextended('public.app_admin_set',0)); if exists(select 1 from public.profiles where role='admin') then raise exception 'app admin already exists'; end if; update public.profiles set role='admin' where id=p_profile_id and status='accepted' and deleted_at is null; if not found then raise exception 'accepted profile required'; end if; end $$;
create function public.cleanup_notifications()
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint; begin perform private.require_service_role(); delete from public.notifications where read_at is not null and created_at<now()-interval '30 days'; get diagnostics result=row_count; return result; end $$;
create function public.purge_deleted_content(p_entity_type text,p_entity_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  case p_entity_type
    when 'comment' then
      perform 1 from public.comments where id=p_entity_id and deleted_at is not null for update;
      if not found then return; end if;
      if exists(select 1 from public.comments where parent_id=p_entity_id and deleted_at is null) then raise exception 'active comment reply blocks purge'; end if;
      delete from public.comment_reactions where comment_id in (select id from public.comments where id=p_entity_id or parent_id=p_entity_id);
      delete from public.comments where parent_id=p_entity_id and deleted_at is not null;
      delete from public.comments where id=p_entity_id and deleted_at is not null;
    when 'message' then
      perform 1 from public.messages where id=p_entity_id and deleted_at is not null for update;
      if not found then return; end if;
      if exists(select 1 from public.messages where parent_id=p_entity_id and deleted_at is null) then raise exception 'active message reply blocks purge'; end if;
      if exists(select 1 from public.message_attachments where message_id in (select id from public.messages where id=p_entity_id or parent_id=p_entity_id)) then raise exception 'message attachments must be removed before purge'; end if;
      delete from public.chat_room_read_states where last_read_message_id in (select id from public.messages where id=p_entity_id or parent_id=p_entity_id);
      delete from public.message_reads where message_id in (select id from public.messages where id=p_entity_id or parent_id=p_entity_id);
      delete from public.message_reactions where message_id in (select id from public.messages where id=p_entity_id or parent_id=p_entity_id);
      delete from public.messages where parent_id=p_entity_id and deleted_at is not null;
      delete from public.messages where id=p_entity_id and deleted_at is not null;
    when 'post' then
      perform 1 from public.posts where id=p_entity_id and deleted_at is not null for update;
      if not found then return; end if;
      if exists(select 1 from public.post_attachments where post_id=p_entity_id) then raise exception 'post attachments must be removed before purge'; end if;
      update public.posts p set
        comment_count=(select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null),
        reaction_count=(select count(*) from public.post_reactions r where r.post_id=p.id)
      where p.id=p_entity_id and p.deleted_at is not null;
      delete from public.comment_reactions where comment_id in (select id from public.comments where post_id=p_entity_id);
      delete from public.comments where post_id=p_entity_id and parent_id is not null;
      delete from public.comments where post_id=p_entity_id;
      delete from public.post_reactions where post_id=p_entity_id;
      delete from public.posts where id=p_entity_id and deleted_at is not null;
    when 'space' then
      perform 1 from public.spaces where id=p_entity_id and deleted_at is not null for update;
      if not found then return; end if;
      if exists(select 1 from public.post_attachments a join public.posts p on p.id=a.post_id where p.space_id=p_entity_id) then raise exception 'space post attachments must be removed before purge'; end if;
      update public.posts p set
        comment_count=(select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null),
        reaction_count=(select count(*) from public.post_reactions r where r.post_id=p.id)
      where p.space_id=p_entity_id;
      delete from public.comment_reactions where comment_id in (select c.id from public.comments c join public.posts p on p.id=c.post_id where p.space_id=p_entity_id);
      delete from public.comments where post_id in (select id from public.posts where space_id=p_entity_id) and parent_id is not null;
      delete from public.comments where post_id in (select id from public.posts where space_id=p_entity_id);
      delete from public.post_reactions where post_id in (select id from public.posts where space_id=p_entity_id);
      delete from public.posts where space_id=p_entity_id;
      delete from public.space_members where space_id=p_entity_id;
      delete from public.spaces where id=p_entity_id and deleted_at is not null;
    else raise exception 'invalid entity type';
  end case;
end $$;

create function public.create_notification(p_recipient_id bigint,p_title text,p_body text,p_actor_id bigint default null,p_space_id bigint default null,p_post_id bigint default null,p_comment_id bigint default null,p_message_id bigint default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint; derived_space_id bigint; derived_post_id bigint; target_room_id bigint;
begin
  perform private.require_service_role();
  if not exists(select 1 from public.profiles where id=p_recipient_id and status='accepted' and deleted_at is null) then raise exception 'accepted recipient required'; end if;
  if p_actor_id is not null and not exists(select 1 from public.profiles where id=p_actor_id and status='accepted' and deleted_at is null) then raise exception 'active actor required'; end if;
  if p_message_id is not null then
    if p_space_id is not null or p_post_id is not null or p_comment_id is not null then raise exception 'message target cannot mix with content targets'; end if;
    select room_id into target_room_id from public.messages where id=p_message_id and deleted_at is null;
    if target_room_id is null or not exists(select 1 from public.chat_room_members where room_id=target_room_id and user_id=p_recipient_id) then raise exception 'recipient cannot access message target'; end if;
  elsif p_comment_id is not null then
    select c.post_id,p.space_id into derived_post_id,derived_space_id from public.comments c join public.posts p on p.id=c.post_id join public.spaces s on s.id=p.space_id where c.id=p_comment_id and c.deleted_at is null and p.deleted_at is null and s.deleted_at is null;
    if derived_post_id is null or (p_post_id is not null and p_post_id<>derived_post_id) or (p_space_id is not null and p_space_id<>derived_space_id) then raise exception 'invalid comment target relationship'; end if;
  elsif p_post_id is not null then
    select p.space_id into derived_space_id from public.posts p join public.spaces s on s.id=p.space_id where p.id=p_post_id and p.deleted_at is null and s.deleted_at is null;
    derived_post_id:=p_post_id;
    if derived_space_id is null or (p_space_id is not null and p_space_id<>derived_space_id) then raise exception 'invalid post target relationship'; end if;
  elsif p_space_id is not null then
    select id into derived_space_id from public.spaces where id=p_space_id and deleted_at is null;
    if derived_space_id is null then raise exception 'active space target required'; end if;
  end if;
  if derived_post_id is not null and not exists(
    select 1 from public.space_members sm join public.profiles p on p.id=sm.user_id
    where sm.space_id=derived_space_id and sm.user_id=p_recipient_id and sm.banned_at is null and p.status='accepted' and p.deleted_at is null
  ) then
    raise exception 'recipient cannot access content target';
  end if;
  insert into public.notifications(recipient_id,actor_id,title,body,space_id,post_id,comment_id,message_id)
  values(p_recipient_id,p_actor_id,p_title,p_body,derived_space_id,derived_post_id,p_comment_id,p_message_id) returning id into result;
  return result;
end $$;

revoke execute on function private.require_service_role() from public,anon,authenticated,service_role;
grant execute on function public.update_verified_profile_identity(bigint,public.profile_type,character,int2,int2,int2),public.change_profile_status(bigint,public.profile_status),public.change_app_role(bigint,public.app_role),public.grant_user_permission(bigint,text),public.revoke_user_permission(bigint,text),public.upsert_permission(text,text,text),public.upsert_reaction_type(bigint,text,text,text,int4),public.create_club(text,text,public.club_type),public.update_club(bigint,text,text,public.club_type),public.delete_club(bigint),public.create_club_apply_round(text,timestamptz,timestamptz),public.update_club_apply_round(bigint,text,timestamptz,timestamptz),public.delete_club_apply_round(bigint) to authenticated;
revoke execute on function public.update_verified_profile_identity(bigint,public.profile_type,character,int2,int2,int2),public.change_profile_status(bigint,public.profile_status),public.change_app_role(bigint,public.app_role),public.grant_user_permission(bigint,text),public.revoke_user_permission(bigint,text),public.upsert_permission(text,text,text),public.upsert_reaction_type(bigint,text,text,text,int4),public.create_club(text,text,public.club_type),public.update_club(bigint,text,text,public.club_type),public.delete_club(bigint),public.create_club_apply_round(text,timestamptz,timestamptz),public.update_club_apply_round(bigint,text,timestamptz,timestamptz),public.delete_club_apply_round(bigint) from public,anon,service_role;
grant execute on function public.bootstrap_first_app_admin(bigint),public.cleanup_notifications(),public.purge_deleted_content(text,bigint),public.create_notification(bigint,text,text,bigint,bigint,bigint,bigint,bigint) to service_role;
revoke execute on function public.bootstrap_first_app_admin(bigint),public.cleanup_notifications(),public.purge_deleted_content(text,bigint),public.create_notification(bigint,text,text,bigint,bigint,bigint,bigint,bigint) from public,anon,authenticated;
