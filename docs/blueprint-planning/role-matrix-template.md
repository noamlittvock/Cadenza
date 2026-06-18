# Role / RLS Matrix Template

Every packet embeds a filled copy of this grid. It forces an explicit access
decision per actor per operation **before** UI is written, and maps each cell to
the concrete RLS mechanism that enforces it.

## RLS reality (current)

From `0002_blueprint_schema.sql`, every Blueprint table started with a uniform
policy pair:

- **SELECT:** `public.app_is_org_member(org_id)` — any org member reads.
- **INSERT/UPDATE/DELETE:** `public.app_is_org_admin(org_id)` — only org admins write.

`0004_blueprint_rls_foundation.sql` then adds the accepted Phase B refinements:

- `app_is_staff_self(org_id, staff_member_id)` for teacher self-write on
  `lesson_records` and DRAFT/SUBMITTED `hours_entries` (D-06).
- `member_capabilities` + `app_has_capability(org_id, 'finance')` for finance
  ledger access, and finance read access to `hours_entries` (D-08).
- `public_endpoints` as an inert/admin-only token registry; it still creates no
  anon/public write path by itself (D-07/D-14).

Roles live in `org_members.role`: `SUPER_ADMIN`, admin, member. `finance` is an
explicit capability, not a role string. `teacher` is represented by a member with
`org_members.staff_member_id` matching the row. Any matrix cell that needs finer
scoping than the current table policy is a **required RLS refinement** — flag it.

## Actors

| Actor | Identity source | Notes |
|---|---|---|
| super_admin | `org_members.role = SUPER_ADMIN` | escape hatch; cross-org support |
| admin | `org_members.role` admin | org operator |
| member (staff) | `org_members` non-admin | general staff/member baseline; teacher self-scope uses `staff_member_id` |
| teacher (self) | member acting on own records | row-scoped in `0004` for lesson/hours rows; other tables still need explicit refinement |
| finance | `member_capabilities.capability = 'finance'` | capability implemented in `0004`; scope is table-specific |
| guardian / public applicant | unauthenticated | needs token/edge path (D-07/D-14); no broad anon insert |

## Grid (fill per module)

| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | | | | | | | `app_is_org_member` (default) |
| Read detail | | | | | | | |
| Create | | | | | | | `app_is_org_admin` (default) |
| Edit | | | | | | | |
| Status transition (non-financial) | | | | | | | |
| Status transition (payroll/finance-affecting) | | | | | | | gate per D-06 / D-08 |
| Archive/delete | | | | | | | |
| Export | | | | | | | |
| Public submit/sign | | | | | | | per D-07 / D-14 (edge/token) |

Cell values: `✓` allowed · `—` denied · `own` row-scoped to own records ·
`⚠` needs RLS refinement (name it in the mechanism column).

## Output of filling this grid

1. The packet's allowed-access summary.
2. A list of **RLS refinements** this module requires beyond the uniform default
   — these roll up into Pass 2 (Security/Data/Conversion) as migration deltas.
3. RLS acceptance tests to write with **real authenticated roles**, not the
   local/e2e bypass.
