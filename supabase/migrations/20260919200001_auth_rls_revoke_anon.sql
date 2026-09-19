-- Revoke default PUBLIC/anon execute on admin SECURITY DEFINER RPCs.
revoke execute on function public.attempt_invalidation_meta_for_admin(uuid) from public;
revoke execute on function public.attempt_invalidation_meta_for_admin(uuid) from anon;
revoke execute on function public.invalidate_attempt(uuid) from public;
revoke execute on function public.invalidate_attempt(uuid) from anon;

grant execute on function public.attempt_invalidation_meta_for_admin(uuid) to authenticated;
grant execute on function public.attempt_invalidation_meta_for_admin(uuid) to service_role;
grant execute on function public.invalidate_attempt(uuid) to authenticated;
grant execute on function public.invalidate_attempt(uuid) to service_role;
