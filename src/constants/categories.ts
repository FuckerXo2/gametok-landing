// Discovery categories — mirrors gametok-backend/src/categories.js. Keep the two in step.
//
// Multi-label: a game can be Action AND Adventure. "Home" is the nav's all-games tab, not a
// category a game can be filed under, which is why it isn't in CATEGORIES.
//
// Sub-navigation inside a category is New and Trending only. There are no sub-genres.

export type Category = {
  slug: string;
  label: string;
};

export const CATEGORIES: Category[] = [
  { slug: 'action', label: 'Action' },
  { slug: 'adventure', label: 'Adventure' },
  { slug: 'arcade', label: 'Arcade' },
  { slug: 'sports', label: 'Sports' },
  { slug: 'rpg', label: 'RPG' },
  { slug: 'visual-novel', label: 'Visual Novel' },
  { slug: 'horror', label: 'Horror' },
  { slug: 'racing', label: 'Racing' },
  { slug: 'puzzle', label: 'Puzzles' },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function categoryLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label || slug;
}

export function isValidCategory(slug: string | undefined | null): boolean {
  return Boolean(slug && BY_SLUG.has(slug));
}
