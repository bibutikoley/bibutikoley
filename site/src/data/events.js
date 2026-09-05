// Mirrors normalize_events() in scripts/generate_stats.py so live and
// snapshot feeds look identical. Public push payloads carry no commit
// messages, so details are borrowed from the snapshot when the head matches.

const SIX_HOURS = 6 * 3600 * 1000;

function shortRepo(full, login) {
  const [owner, name] = full.split('/');
  return owner && owner.toLowerCase() === login.toLowerCase() ? name : full;
}

function firstLine(text, limit = 80) {
  const line = String(text || '').trim().split('\n')[0] || '';
  return line.length <= limit ? line : `${line.slice(0, limit - 1).trimEnd()}…`;
}

export function normalizeEvents(raw, login, snapshotEvents = [], limit = 20) {
  const byHead = new Map();
  const byId = new Map();
  for (const ev of snapshotEvents) {
    if (ev.head) byHead.set(ev.head, ev);
    byId.set(ev.id, ev);
  }

  const sorted = [...raw].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const items = [];
  for (const ev of sorted) {
    const repo = ev.repo?.name;
    if (!repo) continue;
    const payload = ev.payload || {};
    const base = {
      id: String(ev.id),
      repo,
      repoUrl: `https://github.com/${repo}`,
      at: ev.created_at,
      detail: byId.get(String(ev.id))?.detail || '',
    };
    const name = shortRepo(repo, login);

    switch (ev.type) {
      case 'PushEvent': {
        const branch = String(payload.ref || '').replace('refs/heads/', '');
        const suffix = ['main', 'master', ''].includes(branch) ? '' : ` (${branch})`;
        const prev = items[items.length - 1];
        if (
          prev &&
          prev.type === 'push' &&
          prev.repo === repo &&
          prev.branch === branch &&
          Math.abs(Date.parse(prev.at) - Date.parse(base.at)) <= SIX_HOURS
        ) {
          prev.count += 1;
          continue;
        }
        const head = payload.head || '';
        items.push({
          ...base,
          type: 'push',
          title: `Pushed to ${name}${suffix}`,
          url: `https://github.com/${repo}/commit/${head}`,
          branch,
          count: 1,
          head,
          detail: base.detail || byHead.get(head)?.detail || '',
        });
        break;
      }
      case 'CreateEvent': {
        const refType = payload.ref_type;
        if (refType === 'repository' || (refType === 'branch' && payload.ref === payload.master_branch)) {
          items.push({ ...base, type: 'create', title: `Created ${name}`, url: base.repoUrl });
        } else if (refType === 'tag') {
          items.push({
            ...base,
            type: 'create',
            title: `Tagged ${name} ${payload.ref}`,
            url: `${base.repoUrl}/releases/tag/${payload.ref}`,
          });
        } else {
          items.push({
            ...base,
            type: 'create',
            title: `Created branch ${payload.ref} in ${name}`,
            url: `${base.repoUrl}/tree/${payload.ref}`,
          });
        }
        break;
      }
      case 'PullRequestEvent': {
        const number = payload.number ?? payload.pull_request?.number;
        const action = String(payload.action || 'updated');
        items.push({
          ...base,
          type: 'pr',
          title: `${action[0].toUpperCase()}${action.slice(1)} PR #${number} in ${name}`,
          url: `${base.repoUrl}/pull/${number}`,
          number,
          detail: base.detail || firstLine(payload.pull_request?.title),
        });
        break;
      }
      case 'WatchEvent':
        items.push({ ...base, type: 'star', title: `Starred ${repo}`, url: base.repoUrl });
        break;
      case 'ForkEvent':
        items.push({ ...base, type: 'fork', title: `Forked ${repo}`, url: base.repoUrl });
        break;
      case 'ReleaseEvent': {
        const rel = payload.release || {};
        items.push({
          ...base,
          type: 'release',
          title: `Released ${rel.tag_name || ''} in ${name}`.replace('  ', ' '),
          url: rel.html_url || `${base.repoUrl}/releases`,
          detail: base.detail || firstLine(rel.name),
        });
        break;
      }
      case 'IssuesEvent': {
        const issue = payload.issue || {};
        const action = String(payload.action || 'updated');
        items.push({
          ...base,
          type: 'issue',
          title: `${action[0].toUpperCase()}${action.slice(1)} issue #${issue.number} in ${name}`,
          url: issue.html_url || `${base.repoUrl}/issues`,
          detail: base.detail || firstLine(issue.title),
        });
        break;
      }
      default:
        break;
    }
    if (items.length >= limit) break;
  }
  return items.slice(0, limit);
}

export function deriveNow(events, repos) {
  const ev = events.find((e) => ['push', 'create', 'pr', 'release'].includes(e.type));
  if (ev) return { text: ev.title, at: ev.at, url: ev.url };
  const live = [...repos].filter((r) => r.pushedAt).sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
  if (live.length) return { text: `Working on ${live[0].name}`, at: live[0].pushedAt, url: live[0].url };
  return { text: 'Building local-first voice AI', at: null, url: null };
}
