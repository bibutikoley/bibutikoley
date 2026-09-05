import { h, clear, svgIcon, $ } from '../util/dom.js';
import { relativeTime, formatDate } from '../util/time.js';

const ICONS = {
  push: ['M12 3v12', 'm7 8 5-5 5 5', 'M5 21h14'],
  create: ['M12 5v14', 'M5 12h14'],
  pr: ['M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M6 9v12', 'M18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M18 15V9a3 3 0 0 0-3-3h-3', 'm14 3-2 3 2 3'],
  star: ['m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  fork: ['M7 3v6a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V3', 'M12 12v9'],
  release: ['M20 12v8H4v-8', 'M2 7h20v5H2z', 'M12 7v13', 'M12 7c-2-3-6-3-6-1s3 1 6 1c3 0 6 0 6-1s-4-2-6 1z'],
  issue: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 8v5', 'M12 16h.01'],
};

export function renderNow(data, sync) {
  const feed = $('#feed');
  clear(feed);
  feed.setAttribute('aria-busy', 'false');
  const events = (data.events || []).slice(0, 12);

  if (!events.length) {
    feed.append(h('li', { class: 'feed__empty' }, 'Quiet on GitHub lately. The latest work is below.'));
  }
  for (const ev of events) {
    const icon = h('span', { class: 'feed__icon' }, svgIcon(ICONS[ev.type] || ICONS.push));
    const title = h('div', { class: 'feed__title' }, h('a', { href: ev.url || ev.repoUrl, rel: 'noopener' }, ev.title));
    const body = h('div', {}, title);
    const detail = ev.detail || (ev.type === 'push' && ev.count > 1 ? `${ev.count} pushes` : '');
    if (detail) body.append(h('div', { class: 'feed__detail' }, detail));
    const time = h('time', { class: 'feed__time', datetime: ev.at, title: formatDate(ev.at) }, relativeTime(ev.at));
    feed.append(h('li', { class: 'feed__item', dataset: { type: ev.type } }, icon, body, time));
  }

  const syncEl = $('#sync');
  syncEl.className = 'sync reveal in';
  let note;
  if (sync?.source === 'live') {
    note = `Live from GitHub · synced ${relativeTime(new Date(sync.syncedAt).toISOString())}`;
    syncEl.classList.add('is-live');
  } else if (sync?.source === 'cache') {
    note = `Live from GitHub · synced ${relativeTime(new Date(sync.syncedAt).toISOString())}`;
    syncEl.classList.add('is-live');
  } else if (sync?.error === 'rate-limited') {
    note = `GitHub's public API is rate-limited right now · showing the daily snapshot from ${formatDate(data.generatedAt)}`;
    syncEl.classList.add('is-warn');
  } else if (sync?.error) {
    note = `Couldn't reach GitHub (${sync.error}) · showing the daily snapshot from ${formatDate(data.generatedAt)}`;
    syncEl.classList.add('is-warn');
  } else {
    note = `Daily snapshot from ${formatDate(data.generatedAt)} · checking GitHub for newer activity…`;
  }
  syncEl.textContent = note;
}
