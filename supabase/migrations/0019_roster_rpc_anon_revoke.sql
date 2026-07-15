-- Cadenza 0019: harden the roster/program RPC against anonymous execution.
-- Supabase can retain an explicit anon grant independently of PUBLIC, so revoke
-- both and then grant only the authenticated role.

revoke all on function public.get_roster_program_view(text, text) from public;
revoke all on function public.get_roster_program_view(text, text) from anon;
grant execute on function public.get_roster_program_view(text, text) to authenticated;
