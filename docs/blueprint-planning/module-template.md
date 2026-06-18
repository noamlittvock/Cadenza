# Module Packet Template

Copy this file to `packets/<feature-tree-node-id>.md` and fill every section.
A packet is **done** when an engineer could build the module from it without
asking a product question. If a section depends on an unresolved decision, cite
the decision ID from [`decision-log.md`](decision-log.md) instead of guessing.

Node IDs are the `id` values in `features/forteTree.ts`.

---

```md
# <Module Name>  (`feature-tree-node-id`)

Status: <native | embedded | planned | gap | implemented>  ·  Priority: <p0|p1|p2>
Owner-decisions blocking this packet: <decision IDs, or "none">

## Current State (ground truth, with file refs)
- Existing UI: <component(s) + route, or "none">
- Existing schema: <Supabase table(s) from migration 000X; hybrid jsonb vs normalized>
- Existing query helpers: <exported fns in utils/blueprintQueries.ts (or other), exact names>
- Existing tests: <vitest/playwright files, or "none">
- Feature-tree declared queries: <node.deterministicQueries> — implemented? <yes/no per name>

## Users And Permissions
- Actors: <admin | super_admin | teacher | finance | guardian/public applicant | student/family>
- Read access: <who, scoped how>
- Write access: <who, scoped how>
- Public/token access: <none | scoped token | edge function> (consent rule applies)
- See embedded role matrix below.

## Workflows (the verbs)
- List/search/filter:
- Create:
- Detail:
- Edit:
- Status transitions: <enumerate states + allowed edges>
- Archive/delete: <soft vs hard; linked-record visibility>
- Import/export: <if applicable>
- Cross-links: <which records this opens into / is opened from>

## Data Contract
- Primary record: <type in types/blueprint.ts, table>
- Linked records: <FKs / jsonb arrays>
- Required fields:
- Derived/computed fields: <and whether persisted or on-demand>
- Audit fields: <createdBy/updatedBy/timestamps — server vs client owned>
- Conversion semantics: <what a create/approve/post actually writes, transactionally>
- Open schema decisions: <cite decision IDs>

## UX Placement (obey route-nav-policy.md)
- Home: <top-level ViewState | Manage tab | Calendar detail panel | Student detail tab | Admin Inbox | Settings | public token route>
- Navigation entry: <sidebar | command palette | contextual only>
- Mobile visibility: <visible | hidden — must be an explicit decision>
- Empty / loading / error states:
- Hebrew/RTL requirements: <labels, direction, mirrored vs semantic icons>

## Role / RLS Matrix
<paste filled grid from role-matrix-template.md>

## Acceptance Criteria
- Unit: <query helpers / conversion fns>
- Supabase mapping: <camel↔snake, jsonb preservation — if normalized table>
- RLS/security: <real-role tests, not local/e2e bypass>
- Playwright smoke: <the actual primary workflow path>
- Hebrew/RTL: <which screens>
- Mobile viewport: <390x844 primary workflow>
- Data migration/backfill: <existing local/demo data>

## Dependencies
- Blocks: <node IDs that wait on this>
- Blocked by: <node IDs + decision IDs this waits on>
```
