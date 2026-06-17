module.exports = {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './types/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  safelist: [
    {
      pattern: /^(bg|text|border)-(blue|green|purple|amber|slate)-(50|100|200|300|400|500|600|700|800|900)(\/(10|20|30|40|50))?$/,
      variants: ['hover', 'dark', 'dark:hover'],
    },
  ],
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            // Unified font system: DM Sans (Latin) + Heebo (Hebrew). One typographic
            // voice across body, headings, buttons. Weight is the only hierarchy lever.
            // `serif` and `display` keys alias to the same sans stack so any consumer
            // referencing them stays in the unified family — no Georgia, no TNR fallback.
            sans:    ['"DM Sans"', '"Heebo"', '"Avenir Next"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
            serif:   ['"DM Sans"', '"Heebo"', '"Avenir Next"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
            display: ['"DM Sans"', '"Heebo"', '"Avenir Next"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
          },
          colors: {
            // Slate ramp remapped to a warm "paper -> ink" scale.
            // Light end = paper/cream surfaces; dark end = coffee/ink for dark mode and inverted chrome (e.g. sidebar).
            slate: {
              50:  '#F4EFE6', // paper (page bg, lightest)
              100: '#EDE5D6', // paper-2 (subtle elevated / hover)
              200: '#DED2BB', // line (default border on light bg)
              300: '#C8BBA2', // also "light text on dark bg" — sidebar secondary text
              400: '#A89A82', // muted text (works on both light cards and dark coffee)
              500: '#8B7C66', // strong muted (legible in both modes)
              600: '#5A4A38', // ink-mid (body dim)
              700: '#3D3225', // ink-line (dark dividers, dark border)
              800: '#2A2218', // very dark surface (cards in dark mode)
              900: '#1E1812', // ink-deep (page bg in dark)
              950: '#100C08', // espresso (deepest backdrop)
            },
            // Blue ramp = "interactive chrome" (links, active states, info pills, focus rings).
            // Deliberately NOT red — a muted navy/slate-ink that reads as "actionable" against
            // the warm paper neutrals without competing with bordeaux brand or red errors.
            blue: {
              50:  '#F0F3F8',
              100: '#DCE3EE',
              200: '#B7C4D8',
              300: '#8DA1BD',
              400: '#67809E',
              500: '#4D6582',
              600: '#3C5170', // primary navy-ink (was bordeaux; was indigo before that)
              700: '#2E3F58',
              800: '#212E42',
              900: '#161E2C',
              950: '#0B1018',
            },
            // Cadenza = the bordeaux brand identity. Full ramp so brand can carry
            // tinted surfaces (50/100), borders (200/300), and ink (700/800/900) —
            // not only the saturated 500/600 action stops.
            // OKLCH hue 25 throughout; chroma reduced at extremes to avoid garishness.
            cadenza: {
              50:   '#F5E6E2',
              100:  '#EBCFC8',
              200:  '#D9A8A0',
              300:  '#C07871',
              400:  '#9A4D45',
              500:  '#7A2723',
              600:  '#6E1A1A', // canonical primary bordeaux (= legacy cadenza.light)
              700:  '#5E1717', // = legacy cadenza.dark vicinity
              800:  '#481414',
              900:  '#330E0E',
              light: '#6E1A1A', // legacy alias — keep for existing consumers
              dark:  '#561414', // legacy alias — keep for existing consumers
            },

            // ---- Warm semantic ramps (override stock Tailwind cold defaults) ----
            // OKLCH-authored. Each hue is selected to harmonize with bone & bordeaux
            // (warm umber neutrals, hue ~70). No cool cobalt blues, no brassy yellows,
            // no hot-pink reds. Status colors are siblings of bordeaux, not strangers.

            // Sage (success / paid / restored / translated) — hue 145, low chroma
            sage: {
              50:  '#EBF2E5', 100: '#D6E5CC', 200: '#B6CFA8', 300: '#94BB85',
              400: '#78A468', 500: '#5F8B4F', 600: '#4F7843', 700: '#406135',
              800: '#324B29', 900: '#23371D',
            },
            // Override Tailwind's stock emerald + green so existing className usages
            // pick up warm sage automatically across every component.
            emerald: {
              50:  '#EBF2E5', 100: '#D6E5CC', 200: '#B6CFA8', 300: '#94BB85',
              400: '#78A468', 500: '#5F8B4F', 600: '#4F7843', 700: '#406135',
              800: '#324B29', 900: '#23371D',
            },
            green: {
              50:  '#EBF2E5', 100: '#D6E5CC', 200: '#B6CFA8', 300: '#94BB85',
              400: '#78A468', 500: '#5F8B4F', 600: '#4F7843', 700: '#406135',
              800: '#324B29', 900: '#23371D',
            },
            // Semantic alias — new code should reach for `ok` first
            ok: {
              50:  '#EBF2E5', 100: '#D6E5CC', 200: '#B6CFA8', 300: '#94BB85',
              400: '#78A468', 500: '#5F8B4F', 600: '#4F7843', 700: '#406135',
              800: '#324B29', 900: '#23371D',
            },

            // Warm amber (warn / pending / archived / GCal sync notice) — hue 75
            // Deliberately less brassy than stock Tailwind amber (hue ~85, higher chroma).
            amber: {
              50:  '#F8EFD8', 100: '#EFDDB1', 200: '#DEC07F', 300: '#C9A458',
              400: '#B98C36', 500: '#A37820', 600: '#85601A', 700: '#6A4C18',
              800: '#4F3815', 900: '#3B2A11',
            },
            // Warm orange (blackout / less-urgent attention) — hue 55, leans toward amber
            orange: {
              50:  '#F9EBD3', 100: '#F1D5A8', 200: '#E2B26C', 300: '#CF8F3F',
              400: '#BB7421', 500: '#A06014', 600: '#834D11', 700: '#653C0F',
              800: '#4A2C0D', 900: '#34200A',
            },
            // Semantic alias
            warn: {
              50:  '#F8EFD8', 100: '#EFDDB1', 200: '#DEC07F', 300: '#C9A458',
              400: '#B98C36', 500: '#A37820', 600: '#85601A', 700: '#6A4C18',
              800: '#4F3815', 900: '#3B2A11',
            },

            // Warm vermillion (error / danger / destructive) — hue 28, high chroma so
            // it still reads as alarm but warmer than stock Tailwind red. Sits clearly
            // apart from bordeaux brand (which is darker, less chromatic, hue 25).
            red: {
              50:  '#FAEBE3', 100: '#F4D2C2', 200: '#EBA983', 300: '#DD8453',
              400: '#CC6534', 500: '#B85020', 600: '#9A3E18', 700: '#7B2F14',
              800: '#5C2410', 900: '#3F190B',
            },
            // Warm berry (subtle danger-light / accent garnet) — hue 12
            rose: {
              50:  '#F8E9E9', 100: '#EFCFD0', 200: '#DEA5A8', 300: '#C97D82',
              400: '#B25A60', 500: '#984348', 600: '#7C3739', 700: '#612C2D',
              800: '#492222', 900: '#321818',
            },
            berry: {
              50:  '#F8E9E9', 100: '#EFCFD0', 200: '#DEA5A8', 300: '#C97D82',
              400: '#B25A60', 500: '#984348', 600: '#7C3739', 700: '#612C2D',
              800: '#492222', 900: '#321818',
            },
            danger: {
              50:  '#FAEBE3', 100: '#F4D2C2', 200: '#EBA983', 300: '#DD8453',
              400: '#CC6534', 500: '#B85020', 600: '#9A3E18', 700: '#7B2F14',
              800: '#5C2410', 900: '#3F190B',
            },

            // Cool steel-blue (info chrome only — not the brand-action navy above)
            // Hue 230, low chroma. Used for "info" semantics (notices, links inside
            // info banners, walkthrough hints). Distinct from `blue` (navy chrome).
            info: {
              50:  '#E6EBEF', 100: '#D2DAE2', 200: '#AFBEC9', 300: '#8A9DAC',
              400: '#6B7F90', 500: '#56697B', 600: '#465664', 700: '#3A4654',
              800: '#2D3743', 900: '#212833',
            },
          },
          backgroundImage: {
            'cadenza-gradient': 'radial-gradient(circle at 65% 25%, #8B2424 0%, #561414 100%)',
          },
          transitionTimingFunction: {
            'cadenza': 'cubic-bezier(0.33, 1, 0.68, 1)',
          },
          transitionDuration: {
            'cadenza': '160ms',
          },
          boxShadow: {
            'cadenza-soft':    '0 4px 20px -2px rgba(58, 46, 34, 0.10)',
            'cadenza-deep':    '0 18px 42px -10px rgba(58, 46, 34, 0.18)',
            'cadenza-pressed': 'inset 0 4px 6px -1px rgba(58, 46, 34, 0.10), inset 0 2px 4px -2px rgba(58, 46, 34, 0.08)',
          }
        }
      }
    }
