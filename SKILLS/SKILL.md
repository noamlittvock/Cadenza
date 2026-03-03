---
name: RTL Debugging & i18n String Extraction
description: Project-specific guide for RTL (Hebrew) layout debugging and hardcoded string extraction in the Alpert Music Center management app. Read before any RTL or translation work.
---

# RTL Debugging & i18n String Extraction

> **Codebase**: Alpert Music Center Management — React + Vite + Tailwind CSS  
> **Languages**: English (`en-US`) default, Hebrew (`he-IL`) RTL  
> **Translation store**: `constants.ts` (`TRANSLATIONS` object) + `translations_catalog.csv`  
> **Canonical debug history**: [`RTL_DEBUG_LOG.md`](file:///RTL_DEBUG_LOG.md)

---

## 1. RTL Debugging Protocol

### 1.1 Known Anti-Patterns (from this codebase)

These are **real bugs we shipped and fixed**. Every item links to a root cause.

| # | Anti-Pattern | Where It Bit Us | Why It Breaks |
|---|-------------|-----------------|---------------|
| 1 | `t()` declared after code that uses it | `Layout.tsx` L59 vs L96 | `const` temporal dead zone → TS2448 / runtime ReferenceError |
| 2 | `t()` inside class components | `App.tsx` `ErrorBoundary` | Class components can't use hooks; `t()` relies on `settings.language` from context |
| 3 | Template literals in `setErrorMsg()` / `window.confirm()` | `SuperAdmin.tsx` (3 confirms, 12 errors) | Bypasses translation entirely; language switch has no effect |
| 4 | "Fixing" static const arrays that are already translated at render time | `ChartBuilderModal.tsx` `VIZ_OPTIONS`, `AGG_OPTIONS`, `TIMEFRAME_OPTIONS` | Redundant work; risks breaking the existing fallback chain |
| 5 | Forgetting `title=""` attributes (tooltips) | `Layout.tsx`, `SuperAdmin.tsx` | Invisible during normal testing; only found on hover or screen reader audit |
| 6 | Hardcoded rate/currency suffixes in formatting functions | `TeacherManager.tsx` `formatRate`, `CalendarView.tsx` | Looks like "data formatting" so gets skipped in translation audits |
| 7 | Concatenating translated fragments instead of single-key + placeholder | `ManageLists.tsx` `ListEditor` | Hebrew word order differs from English; concatenation produces gibberish |
| 8 | Mixed key prefixes for the same page (`sa.*` vs `super.*`) | `SuperAdmin.tsx`, `constants.ts` | grep-based audits miss keys; convention drift across sessions |

### 1.2 Bug Emergence Order

After **every** RTL or i18n change, bugs surface in this predictable sequence. Re-check each layer after fixing the one above it.

```
1. TypeScript compile errors (TS2448, TS2304)
   └─ Run: npx tsc --noEmit | grep "error TS"
   
2. Missing translation keys
   └─ Symptom: raw key names like `sa.err_load_data` visible in UI
   └─ Check: switch to Hebrew in Settings
   
3. Broken placeholder interpolation
   └─ Symptom: literal `{placeholder}` text in rendered strings
   └─ Check: trigger every error path and confirm dialog
   
4. RTL layout regressions
   └─ Sidebar opens from wrong side
   └─ Missing `rtl:space-x-reverse` on `space-x-*` classes
   └─ `ml-*`/`mr-*` used instead of `ms-*`/`me-*`
   
5. Dark mode visibility
   └─ JSX restructuring drops `dark:` class variants
   └─ Always test both themes after structural changes
   
6. Tooltip translation misses
   └─ grep for: title=" (literal string in quotes)
   
7. Confirm/alert dialog translation
   └─ Hardest to test — requires triggering destructive actions
```

### 1.3 Safe Change Checklist

#### Before any RTL/i18n modification

- [ ] **Locate `const t = ...`** in the target file. Confirm your new `t()` calls are below it.
- [ ] **Class component check** — if the file has any class components (`class X extends React.Component`), use the module-level `t()` pattern (see §1.5).
- [ ] **Identify the key prefix** — check existing `t('prefix.xxx')` calls in the file. Use the same prefix.
- [ ] **Audit static arrays** — find `const X_OPTIONS = [...]` with hardcoded labels. Then check if the JSX already translates them inline before adding keys.
- [ ] **grep for these** in the target file:
  - `title="` — hardcoded tooltip attributes
  - `setErrorMsg("` — error state setters with raw strings
  - `window.confirm(` and `window.alert(` — native dialogs

#### After any RTL/i18n modification

- [ ] **`npx tsc --noEmit`** — zero new TS errors.
- [ ] **Verify keys exist** in both `en-US` and `he-IL` sections of `constants.ts`.
- [ ] **Append to `translations_catalog.csv`** — format: `key,auto,"English","Hebrew",...`
- [ ] **Test in English** — no raw key names visible.
- [ ] **Test in Hebrew** — all new strings render correctly.
- [ ] **Test dark mode** — text visible on dark backgrounds for any restructured JSX.
- [ ] **Test RTL layout** (if you touched `Layout.tsx`, sidebar, or directional CSS):
  - Sidebar position, margins, padding directions
  - Chevron/arrow icon directions (`ChevronLeft` ↔ `ChevronRight` swap)
  - `space-x-*` has `rtl:space-x-reverse` counterpart
- [ ] **Commit message** includes count of replacements and new keys.

### 1.4 Handling Mixed LTR/RTL Content

This was our biggest pain point. The app is Hebrew-primary (RTL) but contains:

- **English proper nouns** (teacher names, room names, instrument names if stored in English)
- **Numbers and currency** (`₪100`, `45 min`, timestamps)
- **Code-like strings** (org slugs, email addresses)

**Rules:**

1. **Use `dir="auto"` on individual elements** that may contain mixed-direction text. The browser's Unicode BiDi algorithm handles inline direction switching.

2. **Never split a translated sentence across elements with different `dir` attributes.** Use a single `<span dir="auto">` wrapping the entire translated string.

3. **Numbers and currency are LTR-neutral** in Unicode. `₪100/hr` renders correctly inside RTL flow — but the `/hr` suffix must be translated (`t('fin.per_hr')`), because Hebrew puts the unit differently.

4. **Parenthetical English inside Hebrew**: Wrap in `<bdi>` (bidirectional isolate) to prevent the parentheses from flipping:
   ```tsx
   // Inside an RTL context, English in parens
   <span>{t('some.label')} (<bdi>{englishName}</bdi>)</span>
   ```

5. **`textAlign` vs `flexDirection`**:
   - `textAlign: 'start'` / `textAlign: 'end'` — use CSS logical properties. These automatically flip in RTL. Never use `textAlign: 'left'`/`'right'` for translatable content.
   - Tailwind equivalents: use `text-start` / `text-end` instead of `text-left` / `text-right`.
   - `flexDirection: 'row'` does **not** auto-flip in CSS. Use `dir="rtl"` on the container **or** conditionally set `flexDirection: isRtl ? 'row-reverse' : 'row'`.
   - In this codebase, the root `<div>` in `Layout.tsx` sets `dir={isRtl ? 'rtl' : 'ltr'}`, which makes `space-x-*` + `rtl:space-x-reverse` the standard pattern for horizontal spacing.

6. **`I18nManager` (React Native only)**: This codebase is a web app, so `I18nManager` is irrelevant here. If porting to React Native:
   - Call `I18nManager.forceRTL(true)` at app startup (before any render) when `settings.language === 'he-IL'`.
   - Set `I18nManager.allowRTL(true)` first.
   - Requires app restart — cannot hot-switch RTL in React Native.
   - React Native's `writingDirection` style prop is the equivalent of CSS `direction`. Use `writingDirection: 'rtl'` on `TextInput` and `Text` components for mixed-content scenarios.

### 1.5 Translation Pattern Reference

**Standard component-level `t()`** (used in all functional components):

```tsx
const t = (key: string) =>
  TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
```

**Module-level `t()`** (for class components like `ErrorBoundary`, or top-level code in `App.tsx`):

```tsx
import { TRANSLATIONS } from '../constants';
const t = (key: string) => {
  const lang = localStorage.getItem('language') || 'en-US';
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS['en-US'][key] || key;
};
```

> **⚠ Warning: Failed fix** — We tried using hook-based `t()` inside `ErrorBoundary` (class component). It failed because `useContext` cannot be called in class components. The module-level pattern above is the only working solution. The tradeoff: language changes won't trigger re-renders on these strings. Acceptable because `ErrorBoundary` and the 404 fallback are rarely seen.

**Dynamic interpolation:**

```tsx
t('key.with_placeholder').replace('{count}', String(count))
t('key.multi').replace('{old}', oldVal).replace('{new}', newVal)
```

> **⚠ Warning: Failed fix** — Replacing template-literal confirms with `t()` embedded *inside* the template literal also fails. Always use `t('key').replace('{var}', value)`, never `` `${t('part1')} ${variable} ${t('part2')}` ``.

### 1.6 Key Prefix Registry

| Prefix | Scope | Files |
|--------|-------|-------|
| `sa.*` | Super Admin | `SuperAdmin.tsx` |
| `builder.*` | Chart Builder | `ChartBuilderModal.tsx` |
| `event.*` | Event Modal | `CalendarView.tsx` |
| `recurrence.*` | Recurrence | `CalendarView.tsx` |
| `cal.*` | Calendar | `CalendarView.tsx` |
| `teach.*` | Teacher Manager | `TeacherManager.tsx` |
| `room.*` | Room Manager | `RoomManager.tsx` |
| `lists.*` | Manage Lists | `ManageLists.tsx` |
| `gantt.*` | Gantt Manager | `GanttManager.tsx` |
| `layout.*` | Sidebar/Layout | `Layout.tsx` |
| `fin.*` | Financial | `FinancialAnalysis.tsx`, `FinancialDashboard.tsx` |
| `settings.*` | Settings Page | `Settings.tsx` |
| `app.*` | App Shell | `App.tsx` |

> Do **not** use `super.*` — that was a historical accident. Use `sa.*` for SuperAdmin.

---

## 2. String Extraction Workflow

### 2.1 Scanning for Hardcoded Strings

**File-by-file process** (do not skip steps):

1. **Pick a component file** from `components/*.tsx` or root `App.tsx`.
2. **Run these greps** against the file to find candidates:
   ```bash
   # Literal strings in JSX (between > and <)
   grep -nE '>[A-Za-z][A-Za-z ]+<' components/TARGET.tsx
   
   # String props with English text
   grep -nE '(placeholder|title|label|aria-label)="[A-Za-z]' components/TARGET.tsx
   
   # setErrorMsg with hardcoded strings
   grep -n 'setErrorMsg("' components/TARGET.tsx
   grep -n "setErrorMsg('" components/TARGET.tsx
   
   # window.confirm / window.alert
   grep -n 'window\.confirm(' components/TARGET.tsx
   grep -n 'window\.alert(' components/TARGET.tsx
   
   # Template literals that contain English words
   grep -nE '`[^`]*[A-Za-z]{3,}[^`]*`' components/TARGET.tsx
   ```
3. **Mark each match** as UI-facing or internal (see §2.2).
4. **Move to next file.** Process all 17 component files + `App.tsx` + `index.tsx`.

### 2.2 UI-Facing vs Internal Strings

| Category | Translate? | Examples |
|----------|-----------|----------|
| **JSX text content** | ✅ Yes | `<h2>Teachers</h2>`, `<span>Loading...</span>` |
| **Button/label text** | ✅ Yes | `<button>Save</button>`, `<option>Select...</option>` |
| **Placeholder text** | ✅ Yes | `placeholder="Search..."` |
| **Tooltip text** | ✅ Yes | `title="Delete teacher"` |
| **Error messages shown to user** | ✅ Yes | `setErrorMsg("Failed to load")` |
| **Confirm/alert dialogs** | ✅ Yes | `window.confirm("Are you sure?")` |
| **aria-label** | ✅ Yes | `aria-label="Close modal"` |
| **Console.log messages** | ❌ No | `console.error("Auth failed")` |
| **Object keys / enum values** | ❌ No | `type: 'weekly'`, `status: 'active'` |
| **CSS class names** | ❌ No | `className="flex items-center"` |
| **Firebase path strings** | ❌ No | `doc(db, 'organizations', id)` |
| **Import paths** | ❌ No | `from '../constants'` |
| **Dev-only labels** | ❌ No | `console.log('render count:', n)` |
| **Formatting suffixes** | ✅ Yes | `/hr`, `/mo`, `min`, `hrs` — these are visible |

### 2.3 Wrapping Strings with `t()`

**Step-by-step per string:**

1. **Choose a key name**: `{prefix}.{descriptive_name}`
   - Use the file's existing prefix (see §1.6).
   - Use snake_case, descriptive: `sa.confirm_delete_org`, not `sa.cd` or `sa.string_47`.

2. **Replace the hardcoded string**:
   ```tsx
   // Before
   <h2>Teacher Management</h2>
   
   // After
   <h2>{t('teach.title')}</h2>
   ```

3. **For strings with dynamic values**, use `.replace()`:
   ```tsx
   // Before
   setErrorMsg(`Cannot find organization "${name}".`);
   
   // After  
   setErrorMsg(t('sa.err_org_not_found').replace('{name}', name));
   ```

4. **For child components that compose text from props**, translate in the parent:
   ```tsx
   // Parent passes fully translated string
   <ListEditor addPlaceholder={t('lists.add_placeholder').replace('{title}', title)} />
   ```

5. **Add the key to `constants.ts`** in **both** `en-US` and `he-IL` sections:
   ```ts
   'en-US': {
     // ... existing keys ...
     'teach.title': 'Teacher Management',
   },
   'he-IL': {
     // ... existing keys ...
     'teach.title': 'ניהול מורים',
   },
   ```

6. **Append to `translations_catalog.csv`**:
   ```
   teach.title,auto,"Teacher Management","ניהול מורים"
   ```

### 2.4 Output Format

After extraction, produce two deliverables:

**A. JSON translation map** — all new keys with English and Hebrew values:

```json
{
  "teach.title": {
    "en-US": "Teacher Management",
    "he-IL": "ניהול מורים"
  },
  "teach.btn_add": {
    "en-US": "Add Teacher",
    "he-IL": "הוסף מורה"
  }
}
```

**B. Annotated diff** — showing every insertion point:

```diff
 // components/TeacherManager.tsx
-<h2>Teacher Management</h2>
+<h2>{t('teach.title')}</h2>

-<button>Add Teacher</button>
+<button>{t('teach.btn_add')}</button>

 // constants.ts (en-US section)
+'teach.title': 'Teacher Management',
+'teach.btn_add': 'Add Teacher',

 // constants.ts (he-IL section)  
+'teach.title': 'ניהול מורים',
+'teach.btn_add': 'הוסף מורה',
```

### 2.5 Edge Cases: Mixed-Direction Strings

| Scenario | Example | How to Handle |
|----------|---------|---------------|
| English name inside Hebrew sentence | `"השם {name} כבר קיים"` | Single key with `{name}` placeholder; browser BiDi handles inline LTR |
| Number + Hebrew unit | `"45 דקות"` | Keep number in the translation string; numbers are BiDi-neutral |
| Currency + amount | `"₪2,000"` | Currency symbol placement stays in the translation: Hebrew `"₪{amount}"`, same as English in this case |
| Parenthesized English | `"מורה (Piano)"` | Wrap English in `<bdi>` tag to isolate BiDi: `<bdi>{instrument}</bdi>` |
| Punctuation at sentence boundaries | `"!שגיאה"` vs `"שגיאה!"` | Hebrew punctuation goes at logical end; put `!` at the end of the Hebrew value in `constants.ts`: `"שגיאה!"` |
| Mixed slash-separated | `₪100/hr` → `₪100/שעה` | Never concatenate — use `t('fin.per_hr')` as a separate translated suffix |
| Email addresses | `user@example.com` | Never translate; pass as `{email}` placeholder; wrap in `<bdi>` if inline with Hebrew |
| Dates | `"Feb 26, 2026"` | Use `Intl.DateTimeFormat` with the current locale, never hardcode format |

---

## Before You Start

> **Every future session must verify these 5 points before touching any RTL or i18n code:**
>
> 1. **Read `RTL_DEBUG_LOG.md`** — it's the canonical bug history. This skill file summarizes it, but the log has full code examples and line numbers.
>
> 2. **Check where `t()` is declared** in the file you're editing. In most files it's near the top of the component. In `Layout.tsx` it was buried 37 lines below where it was first needed — that's how Bug #1 happened.
>
> 3. **Confirm the key prefix** for your target file by checking existing `t()` calls. Don't invent a new prefix. See the registry in §1.6.
>
> 4. **Run `npx tsc --noEmit` before AND after** your changes. Translation work frequently introduces TS2448 (temporal dead zone) or TS2304 (missing import) errors.
>
> 5. **Test in both languages AND both themes.** Switch to Hebrew in Settings, then toggle dark mode. RTL + dark mode is where most regressions hide. Specifically check sidebar position, spacing directions, and text visibility.
