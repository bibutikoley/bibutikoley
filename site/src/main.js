import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

import { baseline, freshSnapshot, loadLive, merge } from './data/api.js';
import { renderHero } from './ui/hero.js';
import { renderNow } from './ui/now.js';
import { renderWork } from './ui/work.js';
import { renderActivity } from './ui/activity.js';
import { renderStack } from './ui/stack.js';
import { renderFooter } from './ui/footer.js';
import { mountFallback } from './ui/fallback.js';

let scene = null;

function renderAll(data, sync) {
  renderHero(data, sync);
  renderNow(data, sync);
  const shown = renderWork(data);
  renderActivity(data);
  renderStack(data);
  renderFooter(data);
  scene?.setData(data, shown);
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
