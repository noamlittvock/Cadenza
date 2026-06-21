import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import type { ViewState } from './types';
import { ROUTED_VIEWS, VIEW_ALIASES, isPaletteVisible } from './routing';

// Canonical list of every ViewState (mirrors the `ViewState` union in types.ts).
// If a value is added/removed there, this list must change too — and the
// "covers every ViewState" test below fails loudly until it does.
const ALL_VIEWS: ViewState[] = [
  'CALENDAR',
  'MANAGE',
  'SETTINGS',
  'SUPER_ADMIN',
  'STAFF_MEMBERS',
  'ADMIN_INBOX',
  'BLUEPRINT',
  'STUDENTS',
  'BILLING',
  'ACADEMICS',
  'INVENTORY',
  'PAYROLL',
  'ANALYTICS',
  'SCENARIOS',
  'SANDBOX',
];

// Views deliberately NOT routed today (fall through to `app.not_found`). INVENTORY
// is unrouted as a top-level view but reachable via the Manage?tab=inventory alias.
const UNROUTED_HIDDEN: ViewState[] = ['ACADEMICS'];

/**
 * Derive the set of views `App.tsx` actually routes, straight from its source:
 * the inline `currentView === 'CALENDAR'` branch plus every `case 'X':` label in
 * the render switch. This is the anti-drift mechanism — add a route to App.tsx
 * without updating ROUTED_VIEWS (or vice-versa) and this test fails.
 */
function routedViewsFromAppSource(): Set<ViewState> {
  const src = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  const routed = new Set<ViewState>();
  // Inline CALENDAR branch (not a switch case).
  if (/currentView\s*===\s*'CALENDAR'/.test(src)) routed.add('CALENDAR');
  // Switch cases — only count labels that are real ViewState values.
  for (const m of src.matchAll(/case\s+'([A-Z_]+)'\s*:/g)) {
    const label = m[1] as ViewState;
    if ((ALL_VIEWS as string[]).includes(label)) routed.add(label);
  }
  return routed;
}

describe('routing: routed-views allowlist', () => {
  it('ROUTED_VIEWS exactly matches the views App.tsx renders (no drift)', () => {
    const fromSource = routedViewsFromAppSource();
    expect([...ROUTED_VIEWS].sort()).toEqual([...fromSource].sort());
  });

  it('does not list any unrouted view as routed', () => {
    for (const v of UNROUTED_HIDDEN) {
      expect(ROUTED_VIEWS.has(v)).toBe(false);
    }
    // INVENTORY is intentionally not a top-level route either.
    expect(ROUTED_VIEWS.has('INVENTORY')).toBe(false);
  });

  it('routes STUDENTS as a real top-level destination', () => {
    expect(ROUTED_VIEWS.has('STUDENTS')).toBe(true);
    expect(isPaletteVisible('STUDENTS')).toBe(true);
  });

  it('routes PAYROLL as the authenticated teacher self-report destination', () => {
    expect(ROUTED_VIEWS.has('PAYROLL')).toBe(true);
    expect(isPaletteVisible('PAYROLL')).toBe(true);
  });

  it('routes BILLING as the top-level Finance destination', () => {
    expect(ROUTED_VIEWS.has('BILLING')).toBe(true);
    expect(isPaletteVisible('BILLING')).toBe(true);
  });

  it('routes ANALYTICS as the Reports workspace destination', () => {
    expect(ROUTED_VIEWS.has('ANALYTICS')).toBe(true);
    expect(isPaletteVisible('ANALYTICS')).toBe(true);
  });

  it('routes scenario planning and sandbox surfaces', () => {
    expect(ROUTED_VIEWS.has('SCENARIOS')).toBe(true);
    expect(ROUTED_VIEWS.has('SANDBOX')).toBe(true);
    expect(isPaletteVisible('SCENARIOS')).toBe(true);
    expect(isPaletteVisible('SANDBOX')).toBe(true);
  });
});

describe('routing: palette visibility (D-02)', () => {
  it('a view is palette-visible iff it is routed or aliased', () => {
    const expectedVisible = new Set<ViewState>([
      ...ROUTED_VIEWS,
      ...(Object.keys(VIEW_ALIASES) as ViewState[]),
    ]);
    for (const v of ALL_VIEWS) {
      expect(isPaletteVisible(v)).toBe(expectedVisible.has(v));
    }
  });

  it('hides the remaining dead-end views from the palette', () => {
    for (const v of UNROUTED_HIDDEN) {
      expect(isPaletteVisible(v)).toBe(false);
    }
  });

  it('keeps INVENTORY visible via its Manage?tab=inventory alias', () => {
    expect(isPaletteVisible('INVENTORY')).toBe(true);
    expect(VIEW_ALIASES.INVENTORY).toEqual({ view: 'MANAGE', manageTab: 'inventory' });
  });

  it('every alias target is itself a routed view', () => {
    for (const alias of Object.values(VIEW_ALIASES)) {
      expect(alias && ROUTED_VIEWS.has(alias.view)).toBe(true);
    }
  });
});
