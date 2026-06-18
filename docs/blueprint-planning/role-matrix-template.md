# Role / RLS Matrix Template

Every packet embeds a filled copy of this grid. It forces an explicit access
decision per actor per operation **before** UI is written, and maps each cell to
the concrete RLS mechanism that enforces it.

## RLS reality (current)

From `0002_blueprint_schema.sql`, every Blueprint table has a uniform policy pair:

- **SELECT:** `public.app_is_org_member(org_id)` — any org member reads.
- **INSERT/UPDATE/DELETE:** `public.app_is_org_admin(org_id)` — only org admins write.

Roles live in `org_members.role`: `SUPER_ADMIN`, admin, member. There is **no**
`teacher`, `finance`, or `public` role enforced at the DB layer yet, and **no**
anon/public write path. Any matrix cell that needs finer scoping than
member-read / admin-write is a **required RLS refinement** — flag it.

## Actors

| Actor | Identity source | Notes |
|---|---|---|
| super_admin | `org_members.role = SUPER_ADMIN` | escape hatch; cross-org support |
| admin | `org_members.role` admin | org operator |
| member (staff) | `org_members` non-admin | currently = teacher; no DB sub-role |
| teacher (self) | member acting on own records | needs row-scoped refinement (D-06) |
| finance | capability, not yet a role | needs new role/capability (D-08) |
| guardian / public applicant | unauthenticated | needs token/edge path (D-07/D-14) |

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
