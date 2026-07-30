// Play orientation — the creator's compulsory choice in the Forge, and the one fact that decides
// how a game is both generated and displayed.
//
// A game is written AND sandbox-verified for exactly one viewport (390x844 or 844x390), so this
// cannot be changed after the fact; that is why it is a deliberate pick rather than a default the
// creator can slide past. The web had no picker at all, which meant every game made on the website
// was silently built portrait.
//
// Mirrors gametok-backend/src/ai-engine/orientation.js and gametok/src/constants/orientation.ts —
// keep the three in step.

export type Orientation = 'portrait' | 'landscape';

export const DEFAULT_ORIENTATION: Orientation = 'portrait';

export function normalizeOrientation(value: unknown): Orientation {
  return String(value || '').trim().toLowerCase() === 'landscape' ? 'landscape' : DEFAULT_ORIENTATION;
}

export function isLandscape(value: unknown): boolean {
  return normalizeOrientation(value) === 'landscape';
}

/** Pixel viewport a game of this shape is built and verified against. */
export function viewportFor(orientation: unknown): { width: number; height: number } {
  return isLandscape(orientation) ? { width: 844, height: 390 } : { width: 390, height: 844 };
}

/** Copy for the Forge picker. Deliberately terse — the illustration carries the meaning. */
export const ORIENTATION_OPTIONS: Array<{
  key: Orientation;
  label: string;
  sub: string;
}> = [
  { key: 'portrait', label: 'Portrait', sub: 'Tall screen' },
  { key: 'landscape', label: 'Landscape', sub: 'Wide screen' },
];
