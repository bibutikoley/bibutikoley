import { h, clear, $ } from '../util/dom.js';
import { formatDate } from '../util/time.js';

export function renderFooter(data) {
  const el = $('#colophon');
  clear(el);
  el.append(
    'Numbers come from a snapshot that ',
    h('a', { href: 'https://github.com/bibutikoley/bibutikoley/blob/master/.github/workflows/profile-stats.yml', rel: 'noopener' }, 'a GitHub Action'),
    ` regenerates daily (last: ${formatDate(data.generatedAt, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}), `,
    'refreshed in your browser from GitHub’s public API. ',
    'Built with Three.js and Vite; ',
    h('a', { href: 'https://github.com/bibutikoley/bibutikoley', rel: 'noopener' }, 'source'),
    '.',
  );
}
