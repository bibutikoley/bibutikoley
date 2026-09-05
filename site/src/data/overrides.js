// Shared with scripts/generate_stats.py: curated blurbs, pin order, hidden repos.
import projects from '@data/projects.json';

const lower = (s) => String(s || '').toLowerCase();

export const excluded = new Set((projects.exclude || []).map(lower));
export const featured = (projects.featured || []).map(lower);
export const descriptions = Object.fromEntries(
  Object.entries(projects.descriptions || {}).map(([k, v]) => [lower(k), v]),
);

export function describe(name, fallback) {
  return descriptions[lower(name)] || (fallback || '').trim();
}

export function isFeatured(name) {
  return featured.includes(lower(name));
}

export function featuredRank(name) {
  const i = featured.indexOf(lower(name));
  return i === -1 ? Infinity : i;
}
