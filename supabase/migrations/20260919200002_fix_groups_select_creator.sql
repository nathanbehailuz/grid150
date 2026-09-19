-- INSERT ... RETURNING on groups checks SELECT before AFTER triggers run,
-- so the creator is not yet an active member. Allow creator to read own groups.
drop policy if exists groups_select_member_or_public on public.groups;

create policy groups_select_member_or_public
  on public.groups for select to authenticated
  using (
    visibility = 'public'
    or created_by = auth.uid()
    or app_private.is_active_member(id)
  );
