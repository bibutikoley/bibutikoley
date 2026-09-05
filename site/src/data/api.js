// Snapshot-first data loading with a live overlay from GitHub's public REST API.
//
// Order of trust: the bundled snapshot (always there) -> a freshly deployed
// snapshot from /data/profile.json -> a short-lived localStorage cache ->
// two unauthenticated REST calls. Nothing here can leave the page blank.
import snapshot from '../../public/data/profile.json';
import { normalizeEvents, deriveNow } from './events.js';
import { describe, isFeatured, excluded } from './overrides.js';
import { languageColor } from './colors.js';

const API = 'https://api.github.com';
const CACHE_KEY = 'bk:live:v1';
const COOLDOWN_KEY = 'bk:cooldown:v1';
const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 6000;
const SNAPSHOT_TIMEOUT_MS = 3000;

export const baseline = snapshot;

function storage(action, key, value) {
  try {
    if (action === 'get') return JSON.parse(localStorage.getItem(key) || 'null');
    if (action === 'set') localStorage.setItem(key, JSON.stringify(value));
    if (action === 'del') localStorage.removeItem(key);
  } catch {
    /* private mode, quota, disabled storage: behave as if empty */
  }
  return null;
}

async function fetchJson(url, ms, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.headers = res.headers;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** A newer snapshot may have been deployed since this bundle was built. */
export async function freshSnapshot() {
  try {
    const data = await fetchJson('/data/profile.json', SNAPSHOT_TIMEOUT_MS, { cache: 'no-cache' });
    if (data && data.schema === snapshot.schema && data.generatedAt > snapshot.generatedAt) return data;
  } catch {
    /* fall through to the bundled copy */
  }
  return snapshot;
}

/** Live version of a repo: a non-GitHub homepage, else its Pages URL when enabled. */
function demoUrl(r, login, known) {
  const home = String(r.homepage || '').trim();
  if (home && !/^https?:\/\/github\.com\//.test(home)) return home;
  // The snapshot only records Pages URLs that answered at build time; trust
  // it over the flag alone so an unbuilt site is never advertised.
  if (known && 'demo' in known) return known.demo;
  if (r.has_pages) return `https://${login}.github.io/${r.name}/`;
  return null;
}

function shapeRestRepo(r, snapshotRepos, login) {
  const known = snapshotRepos.find((s) => s.name.toLowerCase() === r.name.toLowerCase());
  return {
    name: r.name,
    url: r.html_url,
    homepage: r.homepage || null,
    demo: demoUrl(r, login, known),
    description: describe(r.name, r.description),
    language: r.language || known?.language || null,
    languageColor: languageColor(r.language, known?.languageColor),
    stars: r.stargazers_count || 0,
    forks: r.forks_count || 0,
    pushedAt: r.pushed_at,
    topics: r.topics || known?.topics || [],
    featured: isFeatured(r.name),
  };
}

function rateLimited(err) {
  if (!err || !(err.status === 403 || err.status === 429)) return false;
  const reset = Number(err.headers?.get('x-ratelimit-reset')) * 1000;
  storage('set', COOLDOWN_KEY, Number.isFinite(reset) && reset > 0 ? reset : Date.now() + 15 * 60 * 1000);
  return true;
}

/**
 * Resolve live events and repos, or explain why not.
 * @returns {Promise<{events?: object[], repos?: object[], source: 'cache'|'live'|'snapshot', syncedAt?: number, error?: string}>}
 */
export async function loadLive(base) {
  const login = base.login;
  const cached = storage('get', CACHE_KEY);
  if (cached && Date.now() - cached.at < TTL_MS && cached.login === login) {
    return { ...cached.data, source: 'cache', syncedAt: cached.at };
  }
  const cooldown = storage('get', COOLDOWN_KEY);
  if (cooldown && Date.now() < cooldown) {
    return { source: 'snapshot', error: 'rate-limited' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { source: 'snapshot', error: 'offline' };
  }

  const headers = { Accept: 'application/vnd.github+json' };
  const [eventsRes, reposRes] = await Promise.allSettled([
    fetchJson(`${API}/users/${login}/events/public?per_page=60`, TIMEOUT_MS, { headers }),
    fetchJson(`${API}/users/${login}/repos?sort=pushed&per_page=40&type=owner`, TIMEOUT_MS, { headers }),
  ]);

  const failures = [eventsRes, reposRes].filter((r) => r.status === 'rejected').map((r) => r.reason);
  if (failures.some(rateLimited)) return { source: 'snapshot', error: 'rate-limited' };
  if (eventsRes.status === 'rejected' && reposRes.status === 'rejected') {
    const reason = failures[0];
    return { source: 'snapshot', error: reason?.name === 'AbortError' ? 'timeout' : reason?.message || 'network' };
  }

  const data = {};
  if (eventsRes.status === 'fulfilled' && Array.isArray(eventsRes.value)) {
    data.events = normalizeEvents(eventsRes.value, login, base.events);
  }
  if (reposRes.status === 'fulfilled' && Array.isArray(reposRes.value)) {
    data.repos = reposRes.value
      .filter((r) => !r.fork && !r.archived && !excluded.has(r.name.toLowerCase()))
      .map((r) => shapeRestRepo(r, base.repos, login))
      .sort((a, b) => String(b.pushedAt).localeCompare(String(a.pushedAt)))
      .slice(0, 30);
  }
  const syncedAt = Date.now();
  storage('set', CACHE_KEY, { at: syncedAt, login, data });
  storage('del', COOLDOWN_KEY);
  return { ...data, source: 'live', syncedAt };
}

/** Merge a live result over the snapshot; calendar/stats/languages are snapshot-only. */
export function merge(base, live) {
  const events = live.events?.length ? live.events : base.events;
  const repos = live.repos?.length ? live.repos : base.repos;
  return { ...base, events, repos, now: deriveNow(events, repos) };
}
