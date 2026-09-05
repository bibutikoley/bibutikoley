import { h, clear, $ } from '../util/dom.js';

const fmt = (n) => new Intl.NumberFormat('en').format(n || 0);

export function renderActivity(data) {
  const stats = data.stats || {};
  const dl = $('#stats');
  clear(dl);
  const rows = [
    ['Contributions', fmt(stats.totalContributions)],
    ['Commits', fmt(stats.commits)],
    ['Pull requests', fmt(stats.prs)],
    ['Streak', `${stats.streak || 0}d`],
    ['Repos', fmt(stats.repos)],
    ['Followers', fmt(stats.followers)],
  ];
  for (const [label, value] of rows) {
    dl.append(h('div', {}, h('dt', {}, label), h('dd', {}, value)));
  }

  const cal = $('#calendar');
  clear(cal);
  const days = data.calendar?.days || [];
  const peak = Math.max(1, data.calendar?.peak || 0);
  // Pad to the weekday of the first day so columns are calendar weeks.
  if (days.length) {
    const firstDow = new Date(`${days[0].d}T00:00:00Z`).getUTCDay();
    for (let i = 0; i < firstDow; i += 1) cal.append(h('i', { style: { visibility: 'hidden' } }));
  }
  for (const day of days) {
    const level = day.c === 0 ? 0 : Math.min(4, 1 + Math.floor((3 * (day.c - 1)) / Math.max(1, peak - 1)));
    cal.append(h('i', { dataset: { l: level }, title: `${day.d}: ${day.c} contribution${day.c === 1 ? '' : 's'}` }));
  }
}
