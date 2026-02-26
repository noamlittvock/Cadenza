# RTL & i18n Debug Log

> **Purpose**: Institutional memory for anyone working on RTL (Hebrew) support or translation (i18n) in this codebase.  
> **Created**: 2026-02-26 from a multi-session translation audit.  
> **Scope**: Covers bugs found, fixes applied, failed approaches, and safe-change patterns.

---

## Bug History

### 1. TS2448 — `t()` used before declaration in `Layout.tsx`

- **Symptom**: TypeScript error `TS2448: Block-scoped variable 't' used before its declaration` after translating the `'Loading...'` fallback string in `displayOrgName`.
- **Root cause**: `displayOrgName` was computed at line 59, but the `t()` function was declared at line 96. Both were `const` declarations inside the same component body. JavaScript's temporal dead zone for `const`/`let` means you cannot reference a block-scoped variable before its declaration, even within the same scope.
- **File**: `components/Layout.tsx`
- **Fix**: Moved the `t()` and `isRtl` declarations from line 96 up to line 57 (immediately after the `useAuth()` destructure and before `displayOrgName`). This maintained the same scope but ensured `t` was available when `displayOrgName` was computed.
- **Lesson**: Always check where `t()` is declared relative to where you plan to use it. In most components, `t()` is one of the first declarations, but `Layout.tsx` had it buried after several `useEffect` hooks.

### 2. Module-level `t()` needed in `App.tsx`

- **Symptom**: `t()` calls inside the `ErrorBoundary` class component (L51) and `AppContent` functional component (L174) produced runtime errors because `t` was not defined in their scopes.
- **Root cause**: `App.tsx` contains both a class component (`ErrorBoundary`) and a functional component (`AppContent`). Neither had `t()` defined. React hooks like `useContext` (which could provide language settings) cannot be used in class components.
- **File**: `App.tsx`
- **Fix**: Added a module-level `t()` function at the top of `App.tsx` that reads from `TRANSLATIONS` directly. This works because the class component `ErrorBoundary` cannot use hooks, and a module-level function avoids hook dependency. The tradeoff is that language changes won't trigger a re-render of strings using the module-level `t()` — acceptable here because `ErrorBoundary` and the 404 fallback are rarely seen.
- **Lesson**: Class components in this codebase **cannot** use the standard `t()` pattern (which relies on `settings.language` from props/context). A module-level `t()` is the only option for them.

### 3. Hardcoded English in static option arrays (`ChartBuilderModal.tsx`)

- **Symptom**: `VIZ_OPTIONS`, `AGG_OPTIONS`, and `TIMEFRAME_OPTIONS` arrays (lines 28–75) contained hardcoded English labels like `'Bar'`, `'Sum'`, `'Today'`.
- **Root cause**: These arrays were defined as static `const` arrays outside the component, so they couldn't access `t()`.
- **File**: `components/ChartBuilderModal.tsx`
- **Fix**: The rendering code already used inline `t()` key maps at render time (e.g., mapping `'bar'` → `t('builder.viz_bar')`), so the hardcoded labels only served as fallbacks. The existing inline translation pattern was correct and complete. No change was needed for the static arrays themselves — only for strings that appeared directly in JSX without a `t()` wrapper.
- **Lesson**: Before "fixing" static arrays, check how they're consumed in the JSX. If the rendering code already translates via inline maps, the array labels are dead code from a translation perspective.

### 4. `window.confirm()` and `window.alert()` with template literals in `SuperAdmin.tsx`

- **Symptom**: Confirm dialogs like `Are you sure you want to delete the entire organization "${name}"?` were untranslated and contained dynamic interpolation via template literals.
- **Root cause**: JavaScript's `window.confirm()` only accepts plain strings, not JSX. Template literals with `${variable}` were used for dynamic content. These needed to be converted to `t('key').replace('{placeholder}', value)`.
- **Files**: `components/SuperAdmin.tsx` (3 confirm dialogs, 12 `setErrorMsg` calls)
- **Fix**: Created translation keys with `{placeholder}` markers (e.g., `sa.confirm_delete_org` with `{name}`, `sa.confirm_migrate` with `{old}` and `{new}`), then used `.replace('{placeholder}', value)` chains at the call site.
- **Lesson**: For `window.confirm`/`window.alert` with dynamic values, always use `t('key').replace('{var}', value)` — never template literals with `t()` calls embedded inside.

### 5. `setErrorMsg()` calls with raw English strings across `SuperAdmin.tsx`

- **Symptom**: Error messages like `"Failed to create organization."` appeared in English regardless of language setting.
- **Root cause**: All `setErrorMsg()` calls used hardcoded English strings. Since these are stored in state and rendered later, the translation must happen at the call site (not at render time), because `t()` at render time would need the original key, not the English text.
- **File**: `components/SuperAdmin.tsx` (12 instances)
- **Fix**: Replaced every `setErrorMsg("English text")` with `setErrorMsg(t('sa.err_xxx'))`. The translated string is stored in state and displayed as-is.
- **Lesson**: When error messages are stored in state via `setErrorMsg`, translate at assignment time, not at display time. The error banner component just renders `{errorMsg}` directly.

### 6. Rate suffixes `/hr` and `/mo` in `TeacherManager.tsx`

- **Symptom**: Rate values displayed as `₪100/hr` or `₪2,000/mo` with English suffixes.
- **Root cause**: The `formatRate` helper function concatenated hardcoded `/hr` and `/mo` strings.
- **File**: `components/TeacherManager.tsx` (L491-492)
- **Fix**: Replaced with `t('fin.per_hr')` and `t('fin.per_mo')`.
- **Lesson**: Rate formatting functions are easy to miss in translation audits because they look like "data formatting" rather than "UI text."

### 7. Dynamic placeholder in `ManageLists.tsx` `ListEditor`

- **Symptom**: Input placeholder text `Add {title}...` was hardcoded English.
- **Root cause**: The `ListEditor` component received a `title` prop but composed the placeholder string inline.
- **File**: `components/ManageLists.tsx` (L53)
- **Fix**: Added a new `addPlaceholder` prop to `ListEditor` so the parent could pass `t('lists.add_placeholder').replace('{title}', title)`.
- **Lesson**: When a child component composes UI text from props, the translation must happen in the parent and be passed down as a fully-translated string prop.

### 8. Inconsistent translation key prefixes (`super.` vs `sa.`)

- **Symptom**: Some keys used `super.` prefix (e.g., `super.switch_bulk`, `super.role_viewer`), others used `sa.` (e.g., `sa.access_denied`, `sa.console_title`).
- **Root cause**: Different audit sessions used different naming conventions. The initial SuperAdmin keys used `sa.`, but some were added with `super.` prefix during an earlier pass.
- **Files**: `constants.ts`, `SuperAdmin.tsx`
- **Fix**: Both prefixes were left in place since they all resolve correctly. Future keys for SuperAdmin should use `sa.` for consistency.
- **Lesson**: Agree on key prefix conventions before starting. The codebase uses: `sa.*` (super admin), `builder.*` (chart builder), `event.*` (event modal), `recurrence.*` (recurrence), `cal.*` (calendar), `teach.*` (teacher), `room.*` (room), `lists.*` (manage lists), `gantt.*` (gantt manager), `layout.*` (sidebar/layout), `fin.*` (financial), `settings.*` (settings).

---

## Failed Fixes & Regressions

### 1. Translating `displayOrgName` without moving `t()` declaration

- **What was attempted**: Replaced `'Loading...'` with `t('layout.loading')` at line 59 of `Layout.tsx`.
- **Why it failed**: `t()` was defined 37 lines later at line 96. TypeScript caught this as TS2448 at compile time, but it would have been a runtime `ReferenceError` in JavaScript.
- **What we learned**: Always verify the declaration order of `t()` relative to where you're inserting a call. In most files, `t()` is near the top of the component. `Layout.tsx` was the exception — it had `t()` buried after two `useEffect` hooks and a redirect guard.

### 2. Trying to use `t()` inside `ErrorBoundary` class component

- **What was attempted**: Assumed `t()` would be available in the class component's `render()` method.
- **Why it failed**: `t()` depends on `settings.language` which comes from props/context. Class components can't use `useContext` or other hooks. Even if `settings` were passed as a prop to `ErrorBoundary`, it would complicate the component tree since `ErrorBoundary` wraps everything.
- **What we learned**: The module-level `t()` pattern (reading `TRANSLATIONS` directly with a default language) is the pragmatic solution for class components that rarely change language dynamically.

### 3. Static array label translation attempt in `ChartBuilderModal.tsx`

- **What was attempted**: Initially planned to make `VIZ_OPTIONS`, `AGG_OPTIONS`, and `TIMEFRAME_OPTIONS` dynamic by converting them to functions that accept `t`.
- **Why it was abandoned**: Discovered that the rendering code already had complete inline translation maps (e.g., each `TIMEFRAME_OPTIONS` value was mapped to a `t()` key in the JSX). Changing the static arrays would have been redundant work and risked breaking the fallback chain.
- **What we learned**: Always trace how static arrays are consumed before deciding to translate them. The rendering layer may already handle translation independently.

---

## Anti-Patterns (Never Do This)

### 1. ❌ Declaring `t()` after code that uses it

```tsx
// BAD — Layout.tsx original pattern
const displayOrgName = currentOrg?.name || t('layout.loading'); // Line 59
// ... 37 lines of useEffect hooks ...
const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || ...; // Line 96
```

`const` declarations have a temporal dead zone. Always declare `t()` immediately after destructuring `settings`/`useAuth()`.

### 2. ❌ Using template literals in `setErrorMsg()` or `window.confirm()`

```tsx
// BAD
setErrorMsg(`Cannot change ID to ${newSlug} because that organization already exists.`);
window.confirm(`Delete "${name}"? This cannot be undone.`);

// GOOD
setErrorMsg(t('sa.err_org_exists').replace('{slug}', newSlug));
window.confirm(t('sa.confirm_delete_org').replace('{name}', name));
```

### 3. ❌ Translating static `const` arrays when the render code already handles it

```tsx
// The static array has English labels...
const TIMEFRAME_OPTIONS = [{ value: 'today', label: 'Today' }, ...];

// ...but the JSX already translates them:
{TIMEFRAME_OPTIONS.map(o => (
  <option key={o.value} value={o.value}>
    {t(`builder.tf_${o.value}`) || o.label}  // ← Already handled
  </option>
))}
```

Don't "fix" the array — it's a fallback. Focus on the JSX instead.

### 4. ❌ Assuming `t()` works in class components

```tsx
// BAD — class components can't use hooks
class ErrorBoundary extends React.Component {
  render() {
    return <h1>{t('app.something_wrong')}</h1>; // Where does t come from?
  }
}
```

Use a module-level `t()` for class components, or refactor to a functional component with hooks.

### 5. ❌ Forgetting to translate `title` attributes (tooltips)

These are invisible in normal UI testing but appear on hover and are read by screen readers:

```tsx
// EASY TO MISS
<button title="Expand Sidebar">     // ← Hardcoded
<button title={t('layout.expand_sidebar')}>  // ← Correct
```

Files where this pattern was found: `Layout.tsx` (expand/collapse sidebar, dark mode toggle, mobile access), `SuperAdmin.tsx` (edit org, upload logo, delete org, save changes, cancel, revoke access).

### 6. ❌ Hardcoding rate/currency suffixes in formatting functions

```tsx
// BAD — easy to miss because it looks like "data formatting"
const formatRate = (rate) => `${settings.currency}${rate}/hr`;

// GOOD
const formatRate = (rate) => `${settings.currency}${rate}${t('fin.per_hr')}`;
```

Found in: `TeacherManager.tsx` (`formatRate` function), `CalendarView.tsx` (position rate display).

### 7. ❌ Composing translated strings from multiple parts

```tsx
// BAD — word order differs between languages
<span>Found {count} new unique items.</span>

// GOOD — single key with placeholder
<span>{t('lists.found_items').replace('{count}', String(count))}</span>
```

Hebrew word order often differs from English. Never concatenate translated fragments.

### 8. ❌ Using `t()` keys with different prefixes for the same page

The SuperAdmin page ended up with both `sa.*` and `super.*` prefixes. While functional, it makes grep-based audits unreliable. Use one prefix per page/component.

---

## Bug Emergence Order

When making RTL or translation changes, bugs tend to surface in this sequence:

1. **TypeScript compile errors** (TS2448, TS2304) — Surface immediately when `t()` is used before declaration or when `TRANSLATIONS` import is missing. Always run `npx tsc --noEmit` after changes.

2. **Missing translation keys** — The `t()` function falls back to the key string itself (e.g., `sa.err_load_data`), so missing keys show raw key names in the UI. These are visible on first render but easy to miss if you don't switch to Hebrew.

3. **Broken template interpolation** — If a translation key contains `{placeholder}` but the `.replace()` call uses a different placeholder name, the literal `{placeholder}` text appears in the UI. Only visible when the error/confirm actually triggers.

4. **RTL layout regressions** — After any change to `Layout.tsx` or sidebar components, verify:
   - Sidebar opens from the correct side (right in RTL)
   - Collapse/expand button position is correct
   - `space-x-*` classes have `rtl:space-x-reverse` counterparts
   - `ms-*`/`me-*` (logical properties) are used instead of `ml-*`/`mr-*`

5. **Dark mode visibility** — Translation changes sometimes involve restructuring JSX, which can inadvertently drop `dark:` class variants. Always check both light and dark mode after structural JSX changes.

6. **Tooltip translation misses** — `title` attributes are tested last because they require hovering. After any component audit, grep for `title="` (with a literal string) to catch remaining hardcoded tooltips.

7. **Confirm dialog / alert translation** — These only fire on destructive actions (delete, migrate, revoke). They're the hardest to test because you need to trigger each action path.

---

## Safe Change Checklist

### Before Making Changes

- [ ] **Verify `t()` location**: Find where `const t = ...` is declared in the file. Ensure your new `t()` calls are below it.
- [ ] **Check for class components**: If the file contains any class components, plan for module-level `t()` or prop-based translation.
- [ ] **Identify key prefix**: Check existing `t('prefix.xxx')` calls in the file to maintain consistent prefixes.
- [ ] **Review static arrays**: Check if any static const arrays have hardcoded labels. Then check if the rendering code already translates them inline before adding keys for the arrays.
- [ ] **Search for `title="`**: Grep the file for hardcoded tooltip attributes.
- [ ] **Search for `setErrorMsg("`**: Find all error state setters with hardcoded strings.
- [ ] **Search for `window.confirm(` and `window.alert(`**: Find all native dialog calls.

### After Making Changes

- [ ] **Run `npx tsc --noEmit`**: Filter results with `grep "error TS"`. Zero new errors required.
- [ ] **Verify keys exist in `constants.ts`**: Every `t('key')` call must have a matching entry in both `en-US` and `he-IL` sections.
- [ ] **Append to `translations_catalog.csv`**: New keys should be appended with format: `key,auto,"English","Hebrew",...`
- [ ] **Test in English**: Verify no raw key names appear (e.g., `sa.err_load_data` showing as literal text means the key is missing from `constants.ts`).
- [ ] **Test in Hebrew**: Switch language in Settings and verify all new strings render in Hebrew.
- [ ] **Test in dark mode**: Verify text visibility for any restructured JSX.
- [ ] **Test RTL layout**: If you touched `Layout.tsx`, sidebar, or any component with directional CSS:
  - Switch to Hebrew (which enables RTL)
  - Verify sidebar position, margins, padding directions
  - Verify chevron/arrow icon directions are correct
- [ ] **Commit with descriptive message**: Include count of replacements and new keys for traceability.

---

## Files Audited (Cumulative)

| File | Session | Strings Fixed | Keys Added |
|------|---------|--------------|------------|
| `App.tsx` | Session 1 | 3 | 3 |
| `GanttManager.tsx` | Session 1 | 10 | ~10 |
| `CalendarView.tsx` (event modal) | Session 1 | ~40 | ~40 |
| `RoomManager.tsx` | Session 1 | 3 | 3 |
| `ManageLists.tsx` | Session 1 | 5 | 5 |
| `TeacherManager.tsx` | Session 1 | 4 | 4 |
| `ChartBuilderModal.tsx` | Session 2 | 9 | 7 |
| `SuperAdmin.tsx` | Session 2 | 29 | 28 |
| `Layout.tsx` | Session 2 | 6 | 9 |

**Translation infrastructure files**: `constants.ts` (en-US + he-IL sections), `translations_catalog.csv`.

---

## Translation Pattern Reference

### Standard component-level `t()`:
```tsx
const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
```

### Module-level `t()` (for class components or top-level code):
```tsx
import { TRANSLATIONS } from '../constants';
const t = (key: string) => {
  const lang = localStorage.getItem('language') || 'en-US';
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS['en-US'][key] || key;
};
```

### Dynamic interpolation:
```tsx
t('key.with_placeholder').replace('{count}', String(count))
t('key.multi').replace('{old}', oldVal).replace('{new}', newVal)
```

### Adding keys to `constants.ts`:
Keys must be added to **both** the `'en-US': { ... }` and `'he-IL': { ... }` sections. The fix scripts in this project automate this by finding the closing `}` of each section and inserting before it.
