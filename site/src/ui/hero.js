import { h, clear, $ } from '../util/dom.js';
import { relativeTime } from '../util/time.js';

export function renderHero(data, sync) {
  const status = $('#status');
  const text = $('.status__text', status);
  clear(text);
  const now = data.now || {};
  const label = now.text || 'Building local-first voice AI';
  const ago = now.at ? relativeTime(now.at) : '';
  const link = now.url ? h('a', { href: now.url, rel: 'noopener' }, label) : label;
  text.append('Now: ', link);
  if (ago) text.append(h('span', { class: 'status__ago' }, ` · ${ago}`));
  status.classList.toggle('is-stale', sync?.source === 'snapshot' && !!sync?.error);
}
