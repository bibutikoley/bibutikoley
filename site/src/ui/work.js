import { h, clear, $ } from '../util/dom.js';
import { shortAgo, formatDate } from '../util/time.js';
import { featuredRank } from '../data/overrides.js';

const MAX_CARDS = 9;

/** Featured repos first (in curated order), then by most recent push. */
export function pickRepos(repos) {
  return [...repos]
    .sort((a, b) => {
      const fa = featuredRank(a.name);
      const fb = featuredRank(b.name);
      if (fa !== fb) return fa - fb;
      return String(b.pushedAt).localeCompare(String(a.pushedAt));
    })
    .slice(0, MAX_CARDS);
}

/**
 * Renders the cards and wires two-way hover with the 3D nodes through DOM
 * CustomEvents, so the scene module never has to know about the cards.
 */
export function renderWork(data) {
  const root = $('#repos');
  clear(root);
  const repos = pickRepos(data.repos || []);

  for (const repo of repos) {
    // A repo with a live site opens that site; the code link stays one click away.
    const primary = repo.demo || repo.url;
    const card = h(
      'article',
      { class: `repo${repo.demo ? ' repo--live' : ''}`, dataset: { repo: repo.name }, tabindex: '-1' },
      h(
        'div',
        { class: 'repo__head' },
        h('h3', { class: 'repo__name' }, h('a', { href: primary, rel: 'noopener', 'aria-label': repo.demo ? `${repo.name} (open live site)` : repo.name }, repo.name)),
        repo.demo
          ? h('span', { class: 'repo__live' }, h('i', { 'aria-hidden': 'true' }), 'Live')
          : repo.featured
            ? h('span', { class: 'repo__featured' }, 'Featured')
            : null,
      ),
      h('p', { class: 'repo__desc' }, repo.description || 'No description yet.'),
      h(
        'div',
        { class: 'repo__meta' },
        repo.language
          ? h('span', { class: 'repo__lang', style: { '--dot': repo.languageColor || '#8b949e' } }, h('i'), repo.language)
          : null,
        repo.stars ? h('span', {}, `★ ${repo.stars}`) : null,
        repo.pushedAt ? h('span', { title: `Last push ${formatDate(repo.pushedAt)}` }, `pushed ${shortAgo(repo.pushedAt)} ago`) : null,
        repo.demo ? h('a', { class: 'repo__code', href: repo.url, rel: 'noopener', 'aria-label': `${repo.name} source on GitHub` }, 'Code ↗') : null,
      ),
      repo.topics?.length ? h('div', { class: 'repo__topics' }, repo.topics.slice(0, 4).map((t) => h('span', {}, t))) : null,
    );
    const emit = (on) => document.dispatchEvent(new CustomEvent('repo:hover', { detail: { name: repo.name, on } }));
    card.addEventListener('mouseenter', () => emit(true));
    card.addEventListener('mouseleave', () => emit(false));
    card.addEventListener('focusin', () => emit(true));
    card.addEventListener('focusout', () => emit(false));
    root.append(card);
  }

  return repos;
}

/** Called by the scene when a node is hovered or tapped. */
export function highlightCard(name, on, { scroll = false } = {}) {
  for (const card of document.querySelectorAll('.repo')) {
    const match = card.dataset.repo === name;
    card.classList.toggle('is-hot', match && on);
    if (match && on && scroll) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
