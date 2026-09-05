import { h } from '../util/dom.js';

/** CSS-only backdrop for browsers without WebGL (or when the renderer throws). */
export function mountFallback(data) {
  document.body.classList.add('no-webgl');
  if (document.querySelector('.fallback')) return;
  const days = data.calendar?.days || [];
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7).reduce((sum, d) => sum + d.c, 0));
  }
  const peak = Math.max(1, ...weeks);
  const wave = h('div', { class: 'fallback__wave' });
  weeks.slice(-40).forEach((w, i) => {
    const hgt = 6 + 90 * (Math.log1p(w) / Math.log1p(peak));
    wave.append(h('i', { style: { '--h': hgt.toFixed(1), '--i': i } }));
  });
  document.body.prepend(h('div', { class: 'fallback', 'aria-hidden': 'true' }, wave));
}
