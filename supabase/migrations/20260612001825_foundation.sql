alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;

create schema private;

revoke all on schema private from public, anon, authenticated, service_role;

create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;

create type public.app_role as enum ('user', 'admin');
create type public.profile_gender as enum ('male', 'female');
create type public.profile_type as enum ('student', 'teacher', 'alumni');
create type public.profile_status as enum ('none', 'pending', 'accepted', 'rejected', 'withdrawn');
create type public.member_role as enum ('owner', 'admin', 'manager', 'member');
create type public.notification_setting as enum ('none', 'mentions', 'all');
create type public.space_join_policy as enum ('auto_join', 'invite_only');
create type public.gongang_location as enum ('floor_b1', 'floor_2', 'floor_4', 'floor_10');
create type public.space_type as enum ('group', 'community');
create type public.club_type as enum ('major', 'general');
