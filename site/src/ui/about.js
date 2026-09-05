import { h, clear, $ } from '../util/dom.js';

function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})/.exec(ym || '');
  if (!m) return ym || '';
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(+m[1], +m[2] - 1, 1)),
  );
}

/** Hero copy and the "What I do" section, all from data/about.json via the snapshot. */
export function renderAbout(data) {
  const about = data.about || {};
  const set = (id, text) => {
    const el = $(`#${id}`);
    if (el && text) el.textContent = text;
  };
  set('hero-role', about.role);
  set('hero-headline', about.headline);
  set('hero-tagline', about.tagline);
  set('about-summary', about.summary);

  const focus = $('#focus');
  clear(focus);
  for (const [i, item] of (about.focus || []).entries()) {
    focus.append(
      h(
        'article',
        { class: 'focus__item', style: { '--i': i } },
        h('span', { class: 'focus__index' }, String(i + 1).padStart(2, '0')),
        h('h3', { class: 'focus__title' }, item.title),
        h('p', { class: 'focus__blurb' }, item.blurb),
      ),
    );
  }

  const milestones = $('#milestones');
  clear(milestones);
  const highlights = [...(about.highlights || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const experience = about.experience || [];
  milestones.hidden = !highlights.length && !experience.length;
  if (milestones.hidden) return;

  if (highlights.length) {
    const list = h('ol', { class: 'timeline' });
    for (const item of highlights) {
      const title = item.url ? h('a', { href: item.url, rel: 'noopener' }, item.title) : item.title;
      list.append(
        h(
          'li',
          { class: 'timeline__item' },
          h('time', { class: 'timeline__when', datetime: item.date }, monthLabel(item.date)),
          h(
            'div',
            {},
            h('div', { class: 'timeline__title' }, title, item.org ? h('span', { class: 'timeline__org' }, ` · ${item.org}`) : null),
            item.detail ? h('p', { class: 'timeline__detail' }, item.detail) : null,
          ),
        ),
      );
    }
    milestones.append(h('div', { class: 'milestones__col' }, h('h3', { class: 'milestones__h' }, 'Milestones'), list));
  }

  if (experience.length) {
    const list = h('ul', { class: 'roles' });
    for (const job of experience) {
      list.append(
        h(
          'li',
          { class: 'roles__item' },
          h('div', { class: 'roles__title' }, job.role, job.company ? h('span', { class: 'roles__org' }, ` · ${job.company}`) : null),
          job.period ? h('div', { class: 'roles__period' }, job.period) : null,
          job.detail ? h('p', { class: 'roles__detail' }, job.detail) : null,
        ),
      );
    }
    milestones.append(h('div', { class: 'milestones__col' }, h('h3', { class: 'milestones__h' }, 'Experience'), list));
  }
}
