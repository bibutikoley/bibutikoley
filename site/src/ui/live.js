import { h, clear, $ } from '../util/dom.js';
import { shortAgo } from '../util/time.js';

// Anything with a deployed page qualifies. The daily generator (and the live
// REST overlay) mark repos with `demo`, so a new deployment shows up in this
// strip on its own; nothing in here needs editing.
const MAX = 12;
let observer = null;

/** Repos with a deployed page, newest push first. */
export function liveRepos(repos) {
  return (repos || [])
    .filter((r) => r.demo)
    .sort((a, b) => String(b.pushedAt).localeCompare(String(a.pushedAt)))
    .slice(0, MAX);
}

function prettyUrl(url) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}

/**
 * Previews are real iframes, but they only start loading once the card is
 * near the viewport, and never on small screens where they would just be a
 * blurry thumbnail eating the phone's battery.
 */
function attachPreview(frame, url, name) {
  if (window.innerWidth < 720 || !('IntersectionObserver' in window)) return;
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        const iframe = h('iframe', {
          src: el.dataset.src,
          title: `Live preview of ${el.dataset.name}`,
          sandbox: 'allow-scripts allow-same-origin',
          referrerpolicy: 'no-referrer-when-downgrade',
          tabindex: '-1',
          'aria-hidden': 'true',
        });
        // Heavy pages can hold the load event for a while; the frame is
        // visible as soon as it paints, so only the placeholder waits.
        const ready = () => el.classList.add('is-ready');
        iframe.addEventListener('load', ready);
        setTimeout(ready, 6000);
        el.append(iframe);
        observer.unobserve(el);
      }
    },
    { rootMargin: '200px 400px' },
  );
  frame.dataset.src = url;
  frame.dataset.name = name;
  observer.observe(frame);
  // The iframe renders at 1280px and is scaled to the frame's actual width.
  if ('ResizeObserver' in window) {
    new ResizeObserver(([entry]) => {
      frame.style.setProperty('--scale', (entry.contentRect.width / 1280).toFixed(4));
    }).observe(frame);
  }
}

function card(repo) {
  const frame = h('div', { class: 'demo__frame' }, h('span', { class: 'demo__placeholder' }, prettyUrl(repo.demo)));
  attachPreview(frame, repo.demo, repo.name);
  return h(
    'article',
    { class: 'demo', dataset: { repo: repo.name }, role: 'listitem' },
    h('a', { class: 'demo__hit', href: repo.demo, rel: 'noopener', 'aria-label': `Open ${repo.name} live`, tabindex: '-1' }, frame),
    h(
      'div',
      { class: 'demo__body' },
      h(
        'div',
        { class: 'demo__head' },
        h('h3', { class: 'demo__name' }, h('a', { href: repo.demo, rel: 'noopener' }, repo.name)),
        h('span', { class: 'repo__live' }, h('i', { 'aria-hidden': 'true' }), 'Live'),
      ),
      h('p', { class: 'demo__url' }, prettyUrl(repo.demo)),
      h('p', { class: 'demo__desc' }, repo.description || 'No description yet.'),
      h(
        'div',
        { class: 'demo__meta' },
        h('a', { class: 'btn btn--small btn--primary', href: repo.demo, rel: 'noopener' }, 'Open ↗'),
        h('a', { class: 'btn btn--small', href: repo.url, rel: 'noopener' }, 'Code'),
        repo.pushedAt ? h('span', { class: 'demo__ago' }, `pushed ${shortAgo(repo.pushedAt)} ago`) : null,
      ),
    ),
  );
}

/** Prev/next controls for the strip; hidden when everything already fits. */
function controls(strip) {
  const step = () => (strip.firstElementChild?.getBoundingClientRect().width || 600) + 18;
  const prev = h(
    'button',
    { class: 'demos__btn', type: 'button', 'aria-label': 'Previous live page', onclick: () => strip.scrollBy({ left: -step(), behavior: 'smooth' }) },
    '←',
  );
  const next = h(
    'button',
    { class: 'demos__btn', type: 'button', 'aria-label': 'Next live page', onclick: () => strip.scrollBy({ left: step(), behavior: 'smooth' }) },
    '→',
  );
  const bar = h('div', { class: 'demos__controls' }, prev, next);
  const sync = () => {
    bar.hidden = strip.scrollWidth <= strip.clientWidth + 4;
    prev.disabled = strip.scrollLeft <= 4;
    next.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 4;
  };
  strip.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  requestAnimationFrame(sync);
  return bar;
}

export function renderLive(data) {
  const section = $('#live');
  const nav = document.querySelector('[data-nav="live"]');
  const root = $('#demos');
  clear(root);
  const repos = liveRepos(data.repos);
  section.hidden = repos.length === 0;
  if (nav) nav.hidden = repos.length === 0;
  const count = $('#live-count');
  if (count) count.textContent = repos.length ? `${repos.length} running` : '';
  if (!repos.length) return repos;

  const strip = h('div', { class: 'demos__strip', role: 'list' }, repos.map(card));
  root.append(controls(strip), strip);
  return repos;
}
