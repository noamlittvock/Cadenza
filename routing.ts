import type { ViewState } from './types';

/**
 * Single source of truth for which `ViewState`s `App.tsx` actually routes to a
 * real surface. Resolves D-02 (route-nav-policy.md): the command palette derives
 * its visible nav entries from this set, so the palette and `App.tsx` routing can
 * never drift into the "false coverage" problem where a palette command lands on
 * Not Found.
 *
 * Invariant (enforced by `routing.test.ts`): a `ViewState` belongs here IFF
 * `App.tsx` renders a real surface for it (the inline CALENDAR branch or a
 * non-default `switch` case). When a module ships its top-level route, add its
 * `ViewState` here in the SAME change that adds the `App.tsx` case.
 *
 * Currently unrouted (deliberately absent — they fall through to `app.not_found`):
 * `ACADEMICS`. `INVENTORY` is also unrouted as a top-level view but is surfaced
 * via `VIEW_ALIASES` below.
 */
export const ROUTED_VIEWS: ReadonlySet<ViewState> = new Set<ViewState>([
  'CALENDAR',
  'MANAGE',
  'STAFF_MEMBERS',
  'ADMIN_INBOX',
  'BLUEPRINT',
  'STUDENTS',
  'BILLING',
  'PAYROLL',
  'ANALYTICS',
  'SUPER_ADMIN',
  'SETTINGS',
]);

/**
 * A palette alias is a `ViewState` that is NOT itself a routed top-level surface
 * but should still be reachable from the palette by navigating to a routed
 * surface (plus any side effects) instead of rendering Not Found.
 *
 * Per D-02, `INVENTORY` aliases to `Manage?tab=inventory`: Inventory is a Manage
 * tab, not a standalone route, and stays one even after the module ships.
 */
export interface ViewAlias {
  /** The routed view to navigate to. */
  view: ViewState;
  /** Optional Manage tab to select via the `?tab=` URL param. */
  manageTab?: 'staff' | 'rooms' | 'activities' | 'subscriptions' | 'inventory';
}

export const VIEW_ALIASES: Partial<Record<ViewState, ViewAlias>> = {
  INVENTORY: { view: 'MANAGE', manageTab: 'inventory' },
};

/**
 * A view should appear in the command palette IFF it routes to a real surface or
 * is an alias onto one. This is the single predicate that kills dead-end palette
 * entries at the source.
 */
export const isPaletteVisible = (view: ViewState): boolean =>
  ROUTED_VIEWS.has(view) || view in VIEW_ALIASES;
