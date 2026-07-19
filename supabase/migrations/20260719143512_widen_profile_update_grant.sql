-- 본인이 고칠 수 있는 profile 칸을 넓힌다. 진급·전과·부서 이동으로 실제로 바뀌는 값들이라
-- 매번 관리자를 거치게 할 이유가 없다.
--
-- student_number는 계속 빠진다: 심사에서 신원을 대조한 값이고 unique 제약이 걸려 있어, 열어두면
-- 남의 학번을 선점하거나 심사받은 신원과 다른 사람이 될 수 있다.
--
-- 손으로 쓴 마이그레이션이다. `supabase db diff`는 grant를 한 줄도 내보내지 않아서 이 변경에
-- 대해 "No schema changes found"를 보고한다 -- 스키마 파일만 고치고 넘어가면 로컬에만 반영되고
-- 프로덕션에는 영영 닿지 않는다.
grant update (cohort, class_no, track, department, dorm_room)
on table public.profiles
to authenticated;
