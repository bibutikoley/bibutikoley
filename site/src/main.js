import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

import { baseline, freshSnapshot, loadLive, merge } from './data/api.js';
import { renderHero } from './ui/hero.js';
import { renderNow } from './ui/now.js';
import { renderWork } from './ui/work.js';
import { renderLive } from './ui/live.js';
import { renderActivity } from './ui/activity.js';
import { renderStack } from './ui/stack.js';
import { renderFooter } from './ui/footer.js';
import { mountFallback } from './ui/fallback.js';

let scene = null;

function renderAll(data, sync) {
  renderHero(data, sync);
  renderNow(data, sync);
  const shown = renderWork(data);
  renderLive(data);
  renderActivity(data);
  renderStack(data);
  renderFooter(data);
  scene?.setData(data, shown);
  scene?.measure();
  return shown;
}

function watchReveals() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
  );
  els.forEach((el) => io.observe(el));
}

function watchSections() {
  const panels = document.querySelectorAll('[data-scene]');
  const links = document.querySelectorAll('.nav a');
  const set = (name) => {
    document.body.dataset.section = name;
    links.forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
    document.dispatchEvent(new CustomEvent('section:change', { detail: { name } }));
  };
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (best) set(best.target.dataset.scene);
    },
    { threshold: [0.35, 0.6] },
  );
  panels.forEach((p) => io.observe(p));
}

/**
 * In-page links scroll without writing a hash into the URL, so a reload never
 * jumps back into the middle of the page. Direct deep links (/#work) still
 * work because the browser handles them before this runs.
 */
function watchAnchors() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) window.scrollTo(0, 0);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (link.classList.contains('skip')) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });
}

async function startScene(data, shown) {
  const canvas = document.getElementById('scene');
  try {
    const { createScene } = await import('./scene/index.js');
    scene = await createScene(canvas, data, shown);
    if (!scene) mountFallback(data);
  } catch (err) {
    console.warn('3D scene unavailable, using the CSS backdrop.', err);
    mountFallback(data);
  }
}

async function boot() {
  document.documentElement.classList.remove('no-js');
  // ?og renders a clean frame for the social preview image (no nav chrome).
  if (new URLSearchParams(location.search).has('og')) document.body.classList.add('is-og');

  // 1. Paint immediately from the bundled snapshot.
  let data = baseline;
  let shown = renderAll(data, { source: 'snapshot' });
  watchAnchors();
  watchReveals();
  watchSections();

  // 2. Bring the scene up (async, never blocks content).
  const scenePromise = startScene(data, shown);

  // 3. Prefer a newer deployed snapshot, then overlay live API data.
  try {
    const fresh = await freshSnapshot();
    if (fresh !== data) {
      data = fresh;
      shown = renderAll(data, { source: 'snapshot' });
    }
    const live = await loadLive(data);
    data = merge(data, live);
    shown = renderAll(data, live);
  } catch (err) {
    console.warn('Live refresh failed; snapshot stays on screen.', err);
  }

  // The scene may have come up after the last render; hand it the final data.
  await scenePromise;
  scene?.setData(data, shown);
}

boot();
