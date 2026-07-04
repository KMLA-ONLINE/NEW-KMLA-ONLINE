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
  update public.spaces s set member_count = (select count(*) from public.space_members sm where sm.space_id = s.id) where s.id = space_id;
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
  update public.spaces s set member_count = (select count(*) from public.space_members sm where sm.space_id = s.id) where s.id = p_space_id;
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
  update public.spaces s set member_count = (select count(*) from public.space_members sm where sm.space_id = s.id) where s.id = p_space_id;
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
  update public.spaces s set member_count = (select count(*) from public.space_members sm where sm.space_id = s.id) where s.id = p_space_id;
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
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.room_id=p_room_id and mr.user_id=p_user_id;
  delete from public.chat_room_members where room_id=p_room_id and user_id=p_user_id;
end;
$$;

create function public.create_group_chat_with_members(p_name text,p_member_ids bigint[] default array[]::bigint[])
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); room_id bigint; normalized_member_ids bigint[];
begin
  select array_agg(distinct member_id) into normalized_member_ids
  from unnest(coalesce(p_member_ids,array[]::bigint[])) as member_ids(member_id)
  where member_id is not null and member_id <> caller_id;

  if exists (
    select 1
    from unnest(coalesce(normalized_member_ids,array[]::bigint[])) as member_ids(member_id)
    where not exists (
      select 1 from public.profiles p
      where p.id=member_id and p.status='accepted' and p.deleted_at is null
    )
  ) then raise exception 'all group members must be accepted active profiles'; end if;

  insert into public.chat_rooms(name,is_group,created_by) values(btrim(p_name),true,caller_id) returning id into room_id;
  insert into public.chat_room_members(room_id,user_id)
  select room_id, member_id
  from unnest(array_prepend(caller_id,coalesce(normalized_member_ids,array[]::bigint[]))) as member_ids(member_id);
  return room_id;
end;
$$;

create function public.send_message(p_room_id bigint,p_content text default null,p_parent_id bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); message_id bigint; normalized_content text;
begin
  if not exists(select 1 from public.chat_room_members where room_id=p_room_id and user_id=caller_id) then
    raise exception 'room membership required';
  end if;
  if p_parent_id is not null and not exists(select 1 from public.messages where id=p_parent_id and room_id=p_room_id and deleted_at is null) then
    raise exception 'active parent message in room required';
  end if;

  normalized_content := nullif(btrim(p_content), '');
  if normalized_content is null then
    raise exception 'message content required';
  end if;
  if char_length(normalized_content) > 10000 then
    raise exception 'message content must be 1 to 10000 characters';
  end if;

  insert into public.messages(room_id,sender_id,parent_id,content)
  values(p_room_id,caller_id,p_parent_id,normalized_content)
  returning id into message_id;

  insert into public.message_reads(message_id,user_id,read_at)
  values(message_id,caller_id,now())
  on conflict(message_id,user_id) do nothing;

  insert into public.chat_room_read_states(room_id,user_id,last_read_message_id)
  values(p_room_id,caller_id,message_id)
  on conflict(room_id,user_id) do update
  set last_read_message_id=excluded.last_read_message_id
  where public.chat_room_read_states.last_read_message_id is null
     or public.chat_room_read_states.last_read_message_id < excluded.last_read_message_id;

  return message_id;
end;
$$;

create function public.update_message(p_message_id bigint,p_content text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); normalized_content text;
begin
  normalized_content := nullif(btrim(p_content), '');
  if normalized_content is null then
    raise exception 'message content required';
  end if;
  if char_length(normalized_content) > 10000 then
    raise exception 'message content must be 1 to 10000 characters';
  end if;

  update public.messages m
  set content = normalized_content
  where m.id = p_message_id
    and m.deleted_at is null
    and m.sender_id = caller_id
    and m.created_at >= now() - interval '15 minutes'
    and exists (
      select 1
      from public.chat_room_members crm
      where crm.room_id = m.room_id
        and crm.user_id = caller_id
    );

  if not found then
    raise exception 'editable active message not found';
  end if;
end;
$$;

create function public.mark_chat_read(p_room_id bigint,p_last_read_message_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); previous_last_read_message_id bigint;
begin
  if not exists(select 1 from public.chat_room_members where room_id=p_room_id and user_id=caller_id) then
    raise exception 'room membership required';
  end if;
  if not exists(select 1 from public.messages where id=p_last_read_message_id and room_id=p_room_id and deleted_at is null) then
    raise exception 'active message in room required';
  end if;

  select rs.last_read_message_id into previous_last_read_message_id
  from public.chat_room_read_states rs
  where rs.room_id=p_room_id and rs.user_id=caller_id
  for update;

  insert into public.message_reads(message_id,user_id,read_at)
  select m.id,caller_id,now()
  from public.messages m
  where m.room_id=p_room_id
    and m.deleted_at is null
    and m.id<=p_last_read_message_id
    and (previous_last_read_message_id is null or m.id>previous_last_read_message_id)
  on conflict(message_id,user_id) do nothing;

  insert into public.chat_room_read_states(room_id,user_id,last_read_message_id)
  values(p_room_id,caller_id,p_last_read_message_id)
  on conflict(room_id,user_id) do update
  set last_read_message_id=excluded.last_read_message_id
  where public.chat_room_read_states.last_read_message_id is null
     or public.chat_room_read_states.last_read_message_id < excluded.last_read_message_id;
end;
$$;

create function public.set_message_reaction(p_message_id bigint,p_reaction_type_id bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(
    select 1
    from public.messages m
    join public.chat_room_members crm on crm.room_id=m.room_id and crm.user_id=caller_id
    where m.id=p_message_id and m.deleted_at is null
  ) then raise exception 'active message access required'; end if;

  if p_reaction_type_id is null then
    delete from public.message_reactions where message_id=p_message_id and user_id=caller_id;
    return;
  end if;

  if not exists(select 1 from public.reaction_types where id=p_reaction_type_id) then raise exception 'reaction type not found'; end if;
  insert into public.message_reactions(message_id,user_id,reaction_type_id)
  values(p_message_id,caller_id,p_reaction_type_id)
  on conflict(message_id,user_id) do update
  set reaction_type_id=excluded.reaction_type_id, updated_at=now();
end;
$$;

create function public.list_chat_rooms()
returns table(
  room_id bigint,
  is_group boolean,
  name text,
  display_name text,
  display_initials text,
  avatar_url text,
  last_message_id bigint,
  last_message_content text,
  last_message_has_attachment boolean,
  last_message_sender_id bigint,
  last_message_sender_name text,
  last_message_created_at timestamptz,
  unread_count bigint,
  member_count bigint,
  created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  return query
  select
    r.id as room_id,
    r.is_group,
    r.name,
    coalesce(case when r.is_group then r.name else peer.name end,'채팅방') as display_name,
    upper(left(regexp_replace(coalesce(case when r.is_group then r.name else peer.name end,'?'),'\s+','','g'),2)) as display_initials,
    case when r.is_group then null else peer.avatar_url end as avatar_url,
    last_message.id as last_message_id,
    last_message.content as last_message_content,
    coalesce(last_message.has_attachment,false) as last_message_has_attachment,
    last_message.sender_id as last_message_sender_id,
    last_sender.name as last_message_sender_name,
    last_message.created_at as last_message_created_at,
    coalesce(unread.unread_count,0) as unread_count,
    member_counts.member_count,
    r.created_at
  from public.chat_room_members own_membership
  join public.chat_rooms r on r.id=own_membership.room_id
  left join public.direct_chat_pairs dcp on dcp.room_id=r.id
  left join public.profiles peer on peer.id=case when dcp.user1_id=caller_id then dcp.user2_id when dcp.user2_id=caller_id then dcp.user1_id else null end
  left join lateral (
    select m.id,m.sender_id,m.content,m.created_at,
      exists(select 1 from public.message_attachments a where a.message_id=m.id) as has_attachment
    from public.messages m
    where m.room_id=r.id and m.deleted_at is null
    order by m.id desc
    limit 1
  ) last_message on true
  left join public.profiles last_sender on last_sender.id=last_message.sender_id
  left join public.chat_room_read_states read_state on read_state.room_id=r.id and read_state.user_id=caller_id
  left join lateral (
    select count(*)::bigint as unread_count
    from public.messages m
    where m.room_id=r.id and m.deleted_at is null and m.sender_id<>caller_id
      and (read_state.last_read_message_id is null or m.id>read_state.last_read_message_id)
  ) unread on true
  join lateral (
    select count(*)::bigint as member_count from public.chat_room_members m where m.room_id=r.id
  ) member_counts on true
  where own_membership.user_id=caller_id
  order by last_message.id desc nulls last,r.created_at desc,r.id desc;
end;
$$;

create function public.get_chat_messages(p_room_id bigint,p_before_id bigint default null,p_limit int4 default 50)
returns table(
  message_id bigint,
  room_id bigint,
  sender_id bigint,
  sender jsonb,
  parent_message jsonb,
  content text,
  is_edited boolean,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz,
  attachments jsonb,
  reactions jsonb,
  reads jsonb
) language plpgsql stable security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if not exists(select 1 from public.chat_room_members crm where crm.room_id=p_room_id and crm.user_id=caller_id) then raise exception 'room membership required'; end if;

  return query
  with page as (
    select m.*
    from public.messages m
    where m.room_id=p_room_id
      and (m.deleted_at is null or exists(select 1 from public.messages child where child.parent_id=m.id and child.deleted_at is null))
      and (p_before_id is null or m.id<p_before_id)
    order by m.id desc
    limit p_limit
  )
  select
    page.id as message_id,
    page.room_id,
    page.sender_id,
    jsonb_build_object('id',sender.id,'name',sender.name,'avatar_url',sender.avatar_url) as sender,
    case when parent.id is null then null else jsonb_build_object('id',parent.id,'sender_id',parent.sender_id,'sender_name',parent_sender.name,'content',parent.content,'created_at',parent.created_at) end as parent_message,
    page.content,
    page.is_edited,
    page.edited_at,
    page.deleted_at,
    page.created_at,
    coalesce(attachments.items,'[]'::jsonb) as attachments,
    coalesce(reactions.items,'[]'::jsonb) as reactions,
    coalesce(reads.items,'[]'::jsonb) as reads
  from page
  join public.profiles sender on sender.id=page.sender_id
  left join public.messages parent on parent.id=page.parent_id
  left join public.profiles parent_sender on parent_sender.id=parent.sender_id
  left join lateral (
    select jsonb_agg(jsonb_build_object('id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,'content_type',a.content_type,'size_bytes',a.size_bytes,'sort_order',a.sort_order,'width',a.width,'height',a.height,'created_at',a.created_at) order by a.sort_order,a.id) as items
    from public.message_attachments a where a.message_id=page.id
  ) attachments on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id',mr.id,'user_id',mr.user_id,'user_name',rp.name,'reaction_type_id',rt.id,'reaction_key',rt.key,'reaction_name',rt.name,'reaction_icon',rt.icon,'created_at',mr.created_at,'updated_at',mr.updated_at) order by mr.created_at,mr.id) as items
    from public.message_reactions mr join public.reaction_types rt on rt.id=mr.reaction_type_id join public.profiles rp on rp.id=mr.user_id
    where mr.message_id=page.id
  ) reactions on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('user_id',mr.user_id,'user_name',reader.name,'read_at',mr.read_at) order by mr.read_at,mr.user_id) as items
    from public.message_reads mr join public.profiles reader on reader.id=mr.user_id
    where mr.message_id=page.id
  ) reads on true
  order by page.id asc;
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
  update public.messages
  set content='삭제된 메시지입니다.',deleted_at=now(),deleted_by=caller_id
  where id=p_id;
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
      and (p_space_type is null or s.type=p_space_type) and (p_space_id is null or p.space_id=p_space_id)
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
    and m.content is not null
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
grant execute on function public.create_direct_chat(bigint), public.create_group_chat(text), public.add_group_member(bigint,bigint), public.remove_group_member(bigint,bigint), public.create_group_chat_with_members(text,bigint[]), public.send_message(bigint,text,bigint), public.update_message(bigint,text), public.mark_chat_read(bigint,bigint), public.set_message_reaction(bigint,bigint), public.list_chat_rooms(), public.get_chat_messages(bigint,bigint,int4) to authenticated;
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
create function public.cleanup_direct_chat_room(p_room_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  if exists(select 1 from public.chat_rooms where id=p_room_id and is_group) then
    raise exception 'only direct chat rooms can be cleaned up';
  end if;
  if exists(select 1 from public.message_attachments a join public.messages m on m.id=a.message_id where m.room_id=p_room_id) then
    raise exception 'message attachments must be removed before purging room';
  end if;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.room_id=p_room_id;
  delete from public.message_reads mr using public.messages m where mr.message_id=m.id and m.room_id=p_room_id;
  delete from public.chat_room_read_states where room_id=p_room_id;
  delete from public.messages where room_id=p_room_id and parent_id is not null;
  delete from public.messages where room_id=p_room_id;
  delete from public.chat_room_members where room_id=p_room_id;
  delete from public.chat_rooms where id=p_room_id;
end $$;
create function public.cleanup_notifications()
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint; begin perform private.require_service_role(); delete from public.notifications where read_at is not null and created_at<now()-interval '30 days'; get diagnostics result=row_count; return result; end $$;
create function public.purge_deleted_content(p_entity_type text,p_entity_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare affected_read_state record; replacement_message_id bigint;
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
      delete from public.message_reads where message_id in (select id from public.messages where id=p_entity_id or parent_id=p_entity_id);
      for affected_read_state in
        select rs.room_id,rs.user_id
        from public.chat_room_read_states rs
        where rs.last_read_message_id in (select id from public.messages where id=p_entity_id or parent_id=p_entity_id)
      loop
        select max(mr.message_id) into replacement_message_id
        from public.message_reads mr
        join public.messages remaining_message on remaining_message.id=mr.message_id
        where mr.user_id=affected_read_state.user_id
          and remaining_message.room_id=affected_read_state.room_id
          and remaining_message.deleted_at is null;

        delete from public.chat_room_read_states
        where room_id=affected_read_state.room_id and user_id=affected_read_state.user_id;

        if replacement_message_id is not null then
          insert into public.chat_room_read_states(room_id,user_id,last_read_message_id,last_read_at)
          values(affected_read_state.room_id,affected_read_state.user_id,replacement_message_id,now());
        end if;
      end loop;
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

create function public.create_notification(p_recipient_id bigint,p_title text,p_body text,p_actor_id bigint default null,p_space_id bigint default null,p_post_id bigint default null,p_comment_id bigint default null,p_message_id bigint default null,p_level public.notification_level default 'all')
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint; derived_space_id bigint; derived_post_id bigint; target_room_id bigint; recipient_setting public.notification_setting;
begin
  perform private.require_service_role();
  if p_level is null then raise exception 'notification level required'; end if;
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
  if derived_space_id is not null then
    select sm.notification_setting into recipient_setting
    from public.space_members sm join public.profiles p on p.id=sm.user_id
    where sm.space_id=derived_space_id and sm.user_id=p_recipient_id and sm.banned_at is null and p.status='accepted' and p.deleted_at is null;
    if recipient_setting is null then raise exception 'recipient cannot access space target'; end if;
    if recipient_setting='off' or (recipient_setting='mentions' and p_level='all') then return null; end if;
  end if;
  insert into public.notifications(recipient_id,actor_id,title,body,space_id,post_id,comment_id,message_id)
  values(p_recipient_id,p_actor_id,p_title,p_body,derived_space_id,derived_post_id,p_comment_id,p_message_id) returning id into result;
  return result;
end $$;

revoke execute on function private.require_service_role() from public,anon,authenticated,service_role;
grant execute on function public.update_verified_profile_identity(bigint,public.profile_type,character,int2,int2,int2),public.change_profile_status(bigint,public.profile_status),public.change_app_role(bigint,public.app_role),public.grant_user_permission(bigint,text),public.revoke_user_permission(bigint,text),public.upsert_permission(text,text,text),public.upsert_reaction_type(bigint,text,text,text,int4),public.create_club(text,text,public.club_type),public.update_club(bigint,text,text,public.club_type),public.delete_club(bigint),public.create_club_apply_round(text,timestamptz,timestamptz),public.update_club_apply_round(bigint,text,timestamptz,timestamptz),public.delete_club_apply_round(bigint) to authenticated;
revoke execute on function public.update_verified_profile_identity(bigint,public.profile_type,character,int2,int2,int2),public.change_profile_status(bigint,public.profile_status),public.change_app_role(bigint,public.app_role),public.grant_user_permission(bigint,text),public.revoke_user_permission(bigint,text),public.upsert_permission(text,text,text),public.upsert_reaction_type(bigint,text,text,text,int4),public.create_club(text,text,public.club_type),public.update_club(bigint,text,text,public.club_type),public.delete_club(bigint),public.create_club_apply_round(text,timestamptz,timestamptz),public.update_club_apply_round(bigint,text,timestamptz,timestamptz),public.delete_club_apply_round(bigint) from public,anon,service_role;
grant execute on function public.bootstrap_first_app_admin(bigint),public.cleanup_direct_chat_room(bigint),public.cleanup_notifications(),public.purge_deleted_content(text,bigint),public.create_notification(bigint,text,text,bigint,bigint,bigint,bigint,bigint,public.notification_level) to service_role;
revoke execute on function public.bootstrap_first_app_admin(bigint),public.cleanup_direct_chat_room(bigint),public.cleanup_notifications(),public.purge_deleted_content(text,bigint),public.create_notification(bigint,text,text,bigint,bigint,bigint,bigint,bigint,public.notification_level) from public,anon,authenticated;
