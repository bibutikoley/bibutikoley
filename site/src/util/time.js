/** "3 days ago" style relative time, matching the Python generator's wording. */
export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return '';
  const secs = Math.max(0, Math.floor((now - t) / 1000));
  if (secs < 90) return 'just now';
  const days = Math.floor(secs / 86400);
  const ladder = [
    ['minute', Math.floor(secs / 60), 60],
    ['hour', Math.floor(secs / 3600), 24],
    ['day', days, 7],
    ['week', Math.floor(days / 7), 5],
    ['month', Math.floor(days / 30), 12],
    ['year', Math.floor(days / 365), Infinity],
  ];
  for (const [unit, raw, cap] of ladder) {
    if (raw < cap) {
      const n = Math.max(1, raw);
      return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    }
  }
  return '';
}

/** Short form for dense UI: "3d", "2w". */
export function shortAgo(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return '';
  const secs = Math.max(0, Math.floor((now - t) / 1000));
  if (secs < 3600) return `${Math.max(1, Math.floor(secs / 60))}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  const days = Math.floor(secs / 86400);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function formatDate(iso, opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return '';
  return new Intl.DateTimeFormat('en', { ...opts, timeZone: 'UTC' }).format(t);
}
