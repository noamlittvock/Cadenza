# Design

## Visual Theme

**Bone & lacquer.** Warm bone-paper neutrals tinted with the faintest umber, paired with a single deep lacquer-red accent — Japanese sumi-ink / Stradivari varnish, saturated and jewel-like. Reads as printed ledger meets operator console. Default light theme; dark theme is warm graphite, never blue-slate.

The grain texture survives — relocated. No more on hero gradients. Now: a low-opacity paper-fiber overlay on chrome surfaces only (sidebar, modals, slide-overs, banners). Calendar grid and data tables stay clean.

## Color Strategy

**Restrained.** One committed accent. Tinted neutrals carry 90%+ of every surface. Accent only for: primary actions, active selection, in-focus events, conflict signal. Status semantics are categorical (success / warn / danger / info), each a single OKLCH role, never decorative.

## Color Palette

OKLCH. Chroma reduced at extremes. Every neutral tinted toward umber (the brand hue, hue 60–70).

### Light theme — bone

| Token | Value | Use |
|---|---|---|
| `--bone-50`  | `oklch(98.5% 0.005 70)` | Page background |
| `--bone-100` | `oklch(96.8% 0.007 70)` | Surface |
| `--bone-200` | `oklch(93%   0.009 70)` | Hover surface, subtle border |
| `--bone-300` | `oklch(86%   0.012 70)` | Divider |
| `--bone-400` | `oklch(70%   0.014 70)` | Muted text |
| `--bone-500` | `oklch(54%   0.015 70)` | Secondary text |
| `--bone-700` | `oklch(34%   0.018 70)` | Body text |
| `--bone-900` | `oklch(18%   0.020 70)` | Strongest ink, headings |

### Dark theme — graphite

| Token | Value | Use |
|---|---|---|
| `--graphite-950` | `oklch(15% 0.012 60)` | Page bg |
| `--graphite-900` | `oklch(19% 0.014 60)` | Surface |
| `--graphite-800` | `oklch(24% 0.016 60)` | Elevated |
| `--graphite-700` | `oklch(32% 0.018 60)` | Border |
| `--graphite-500` | `oklch(58% 0.014 60)` | Muted text |
| `--graphite-300` | `oklch(78% 0.010 60)` | Body text |
| `--graphite-100` | `oklch(94% 0.006 60)` | Strongest ink |

### Accent — lacquer

| Token | Value | Use |
|---|---|---|
| `--lacquer-500` | `oklch(52% 0.18 25)` | Primary action, default |
| `--lacquer-600` | `oklch(46% 0.19 25)` | Hover / pressed |
| `--lacquer-400` | `oklch(60% 0.16 25)` | Dark-theme primary |
| `--lacquer-100` | `oklch(94% 0.04 25)` | Accent-tinted surface (rare) |

### Status (categorical)

| Token | Value | Use |
|---|---|---|
| `--ok-500`     | `oklch(58% 0.14 145)` | Success |
| `--warn-500`   | `oklch(72% 0.15 75)`  | Warning — amber, not yellow |
| `--danger-500` | `oklch(54% 0.20 28)`  | Alert — close to lacquer; differentiate via icon and pattern |
| `--info-500`   | `oklch(60% 0.10 240)` | Info — cool, used sparingly |

Never `#000` or `#fff`. Bone-50 is not white; graphite-950 is not black.

## Typography

### Stack

- **Display** (headings, module titles): **Inter Display** (fallback: Inter with `font-stretch: 75%; letter-spacing: -0.02em`)
- **Body** (UI, paragraphs, forms): **Inter** with `font-feature-settings: "ss01", "cv11", "tnum"` (tabular numbers always on in numeric columns)
- **Hebrew**: **Heebo**, weights matched to Inter
- **Mono** (event IDs, DevTools): **JetBrains Mono**

### Scale — 1.25 ratio, no flat scales

| Step | Size / Line | Use |
|---|---|---|
| `text-xs`   | 12 / 16 | Chips, captions |
| `text-sm`   | 14 / 20 | Table cells, dense forms |
| `text-base` | 15 / 24 | Body default |
| `text-lg`   | 18 / 26 | Subheads |
| `text-xl`   | 22 / 30 | Module H2 |
| `text-2xl`  | 28 / 36 | Page H1 |
| `text-3xl`  | 36 / 44 | Empty-state hero |
| `text-4xl`  | 48 / 56 | Onboarding only |

### Weights

400 body, 500 UI labels, 600 headings, 700 hero. Never 800 / 900 — reads SaaS.

### Body line length

65–75ch max. Hard cap.

## Spacing & Rhythm

8px macro grid. **2px micro-grid** for calendar density (events stack at 2 / 4px gaps, not 8).

- Macro (page chrome, sections): 16, 24, 32, 48, 64, 96
- Meso (cards, controls): 8, 12, 16
- Micro (calendar internals, dense tables): 2, 4, 6

Vary spacing for rhythm. Same padding everywhere is monotony.

## Elevation

Shadows are warm, not black. All shadow values composed in `oklch(20% 0.02 60 / α)`.

| Token | Value |
|---|---|
| `--shadow-low`     | `0 1px 2px oklch(20% 0.02 60 / 0.06)` |
| `--shadow-mid`     | `0 4px 12px oklch(20% 0.02 60 / 0.08), 0 1px 3px oklch(20% 0.02 60 / 0.06)` |
| `--shadow-high`    | `0 12px 32px oklch(20% 0.02 60 / 0.12), 0 4px 8px oklch(20% 0.02 60 / 0.06)` |
| `--shadow-pressed` | `inset 0 2px 4px oklch(20% 0.02 60 / 0.10)` |

## Borders & Radii

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px  | Chips, badges |
| `--radius-md` | 6px  | Buttons, inputs |
| `--radius-lg` | 10px | Cards, modals, slide-overs |
| `--radius-xl` | 16px | Rare — dashboard hero panels |

No 24–32px "pillows." We're an admin tool, not a fintech onboarding.

Borders default to `1px solid var(--bone-200)` (light) / `var(--graphite-700)` (dark). Hairline `0.5px` in calendar grid only.

## Texture

`texture-paper`: ~4% opacity SVG fractal-noise overlay on chrome surfaces — sidebar, modals, slide-overs, banners. Never on calendar grid or data tables.

Old `texture-cadenza` (15% on violet gradient) is removed.

## Motion

- Ease: `cubic-bezier(0.33, 1, 0.68, 1)` — `--ease-cadenza`. Pure ease-out. No bounce, no elastic.
- Durations: 120ms (state hover), 180ms (button), 240ms (modal / slide-over), 360ms (page-arrive).
- `cadenza-arrive` keyframe stays.
- `cadenza-pulse` (glow ring) is removed — reads as indie-SaaS.
- `prefers-reduced-motion`: durations collapse to 0 except for opacity.

## Components (canonical)

- **Button**: lacquer primary, bone-700 text secondary, bone-200 ghost tertiary. All have `:active` press (`shadow-pressed`, scale 0.98).
- **Modal**: max-w by purpose (sm 480 / md 640 / lg 960 / xl 1280); `texture-paper` on chrome.
- **SlideOver**: 384px on `inline-end`; `texture-paper`, `--shadow-high`.
- **Sidebar**: 80px collapsed / 256px expanded (was 25vw — too elastic for dense screens). Lacquer accent only on active item, not all icons.
- **Calendar event chip**: 2px gap, `--lacquer-100` background when selected, diagonal stripe pattern (not solid color) for canceled. Never hue-only encoding.
- **Filter pill**: bone-100 default; bone-900 text + lacquer-100 surface when active. Single accent — no rainbow filters.

## Layout

- App shell: sidebar + main. No nested cards.
- Calendar uses true CSS Grid (lines), not stacked divs.
- Forms: 12-col grid at md+, single col mobile. Labels left of input on lg+ (operator-form pattern), top on smaller.
- Containers (`max-w-3xl`–`max-w-5xl`) only on Settings, SuperAdmin, OnboardingChecklist. Calendar, Staff, Students, ManageHub, Financial run full-bleed.

## Dark Mode

- Triggered by `class="dark"` on `<html>` (existing mechanism).
- Bone → warm graphite (NOT blue-slate). Lacquer accent stays — desaturate to `--lacquer-400`.
- `texture-paper` opacity drops to ~2.5%.
- Status colors lift one OKLCH lightness step.
