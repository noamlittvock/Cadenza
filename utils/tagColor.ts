// Deterministic auto-coloring for freeform event tags.
// Same input string always returns the same palette entry across the app.

export interface TagColor {
  /** Tailwind classes for chip background, text, and border (light + dark variants). */
  classes: string;
  /** Sortable palette index for debug / future inspection. */
  index: number;
}

const PALETTE: string[] = [
  'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700',
  'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700',
  'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700',
  'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-700',
  'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-700',
  'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-200 dark:border-cyan-700',
  'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700',
  'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300 dark:bg-fuchsia-900/40 dark:text-fuchsia-200 dark:border-fuchsia-700',
];

/** djb2 hash, normalized to a positive 31-bit integer. */
function hash(str: string): number {
  let h = 5381;
  const s = str.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return h & 0x7fffffff;
}

export function tagColor(tag: string): TagColor {
  if (!tag) return { classes: PALETTE[0], index: 0 };
  const index = hash(tag) % PALETTE.length;
  return { classes: PALETTE[index], index };
}

/** Normalize a tag for storage: trim + collapse whitespace. Preserves case. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}
