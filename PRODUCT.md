# Product

## Register

product

## Users

Conservatory admin or small admin team (Super Admin + Admin). Long, dense sessions on 24–27" displays. Daily-bilingual Hebrew (RTL) and English (LTR). Scanning week-grids of 50–200 events, reconciling room conflicts, payroll inputs, and student histories that all derive from the calendar. They are precise operators, not casual users. Single source of truth: the calendar. No event = no pay.

## Product Purpose

Operate a conservatory the way an instrument is played — with precision, density, and unflinching reliability. Every surface should feel like reading a printed ledger and acting on it without ceremony. Cadenza is for people who manage real schools, not for screenshots.

## Brand Personality

Confident, calm, instrument-precise. The voice of a senior librarian who also runs the books. Warm in tone, exacting in measure. Three words: **precise, considered, unhurried**.

## Anti-references

- Generic Tailwind SaaS: gradient hero-metric cards, identical icon-card grids, indigo accents on everything, "Get started" empty states with cute illustrations.
- "School software" cliché: rounded mascots, kindergarten-bright primaries, illustrated students/teachers as decoration.
- Cold enterprise gray: Salesforce-tier neutrality, dense-without-warmth, ribbon toolbars.
- Indigo / violet accents in 2024–2026 admin tools — the AI-training-set reflex. Cadenza was indigo; Cadenza is no longer indigo.
- Music-school category reflexes: piano-key ivory/black, staff-line motifs, treble-clef icons, sepia-and-burgundy "concert hall" palettes.
- The absolute bans hold: glassmorphism-by-default, gradient text, side-stripe borders >1px, hero-metric templates, identical card grids, modal-as-first-thought.

## Design Principles

1. **The calendar is the score.** Every other screen is a reduction of it. Spacing, density, and rhythm flow from week-grid logic, not from card-grid SaaS logic.
2. **Reference printed ledgers, not screens.** Bone paper, ink marks, ruled lines. Operator-tool gravitas, not SaaS levity.
3. **Color carries meaning, not decoration.** One saturated accent for action and signal — never as flavor. Status is encoded categorically, never by mood.
4. **Bilingual parity is non-negotiable.** Hebrew RTL is a first-class layout, not a flipped English layout. Hebrew typography is selected, not inherited.
5. **Density without noise.** Information scales with the user's attention. The interface earns its space — empty rows are violence.

## Accessibility & Inclusion

- WCAG AA contrast on all text and stateful elements. AAA on body text in long-session views (Calendar, Staff, Financial).
- Full RTL + LTR parity. Heebo for Hebrew, Inter for Latin, weights matched. Directional icons (chevrons) mirror in RTL; semantic icons (check, x) do not.
- Dark mode parity. Light is default; dark is sibling, not afterthought.
- `prefers-reduced-motion` respected — every cadenza animation has a no-motion fallback (opacity-only).
- Hebrew calendar (@hebcal/core) renders alongside Gregorian without one feeling secondary.
- Color blindness: status never encoded by hue alone. Canceled, conflict, blackout always carry an icon or pattern in addition to color.
