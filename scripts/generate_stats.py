#!/usr/bin/env python3
"""Generate GitHub profile stat cards as SVG files committed to this repository.

The README embeds these files directly, so rendering never depends on a
third-party service being reachable from GitHub's image proxy.

Usage:
  generate_stats.py --login <user> --out assets            # live, needs GITHUB_TOKEN
  generate_stats.py --login <user> --out assets --dump-json data.json
  generate_stats.py --login <user> --out assets --fixture data.json   # offline
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import sys
import urllib.error
import urllib.request
from xml.sax.saxutils import escape

API = "https://api.github.com/graphql"

QUERY = """
query($login: String!, $cursor: String) {
  user(login: $login) {
    name
    login
    bio
    location
    company
    avatarUrl
    websiteUrl
    followers { totalCount }
    repositories(first: 100, after: $cursor, ownerAffiliations: OWNER,
                 isFork: false, privacy: PUBLIC,
                 orderBy: {field: STARGAZERS, direction: DESC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        description
        url
        homepageUrl
        stargazerCount
        forkCount
        pushedAt
        isArchived
        primaryLanguage { name color }
        repositoryTopics(first: 6) { nodes { topic { name } } }
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name color } }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
"""


# --------------------------------------------------------------------------- fetch


def graphql(token: str, variables: dict) -> dict:
    body = json.dumps({"query": QUERY, "variables": variables}).encode()
    req = urllib.request.Request(
        API,
        data=body,
        headers={
            "Authorization": f"bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "profile-stats-generator",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.load(resp)
    if "errors" in payload:
        raise RuntimeError(f"GraphQL errors: {payload['errors']}")
    if not payload.get("data", {}).get("user"):
        raise RuntimeError(f"no user in response: {payload}")
    return payload["data"]["user"]


def fetch(login: str, token: str) -> dict:
    """Fetch the user, following repository pagination."""
    user = graphql(token, {"login": login, "cursor": None})
    repos = list(user["repositories"]["nodes"])
    page = user["repositories"]["pageInfo"]
    while page["hasNextPage"]:
        nxt = graphql(token, {"login": login, "cursor": page["endCursor"]})
        repos.extend(nxt["repositories"]["nodes"])
        page = nxt["repositories"]["pageInfo"]
    user["repositories"]["nodes"] = repos
    return user


# --------------------------------------------------------------------------- events

REST = "https://api.github.com"


def rest_get(token: str, path: str) -> dict | list | None:
    """GET a REST endpoint; returns None on any HTTP/network error.

    Everything fetched through here is decorative (the activity feed), so a
    failure must never abort the run.
    """
    req = urllib.request.Request(
        f"{REST}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "profile-stats-generator",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except (urllib.error.URLError, ValueError, TimeoutError) as exc:
        print(f"GET {path} failed: {exc}", file=sys.stderr)
        return None


def fetch_events(login: str, token: str, pages: int = 2) -> list[dict]:
    """Public events, newest first. GitHub keeps about 90 days / 300 events."""
    events: list[dict] = []
    for page in range(1, pages + 1):
        batch = rest_get(token, f"/users/{login}/events/public?per_page=100&page={page}")
        if not batch:
            break
        events.extend(batch)
        if len(batch) < 100:
            break
    return events


def fetch_pages_flags(login: str, token: str) -> dict[str, bool]:
    """name -> has_pages, from the REST repo list (GraphQL does not expose it)."""
    flags: dict[str, bool] = {}
    for page in (1, 2):
        batch = rest_get(token, f"/users/{login}/repos?per_page=100&type=owner&page={page}")
        if not batch:
            break
        for repo in batch:
            flags[repo["name"].lower()] = bool(repo.get("has_pages"))
        if len(batch) < 100:
            break
    return flags


def demo_url(repo: dict, login: str, has_pages: bool) -> str | None:
    """Where a repository's live version lives, if it has one.

    The homepage wins when it points somewhere other than GitHub itself;
    otherwise a Pages-enabled repository maps to the standard project URL.
    """
    home = (repo.get("homepageUrl") or "").strip()
    if home and not home.startswith(("https://github.com/", "http://github.com/")):
        return home
    if has_pages:
        return f"https://{login}.github.io/{repo['name']}/"
    return None


def url_is_live(url: str) -> bool:
    """HEAD-check a demo before advertising it; an unbuilt Pages site 404s."""
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "profile-stats-generator"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= resp.status < 400
    except (urllib.error.URLError, TimeoutError, ValueError):
        return False


def short_repo(full: str, login: str) -> str:
    owner, _, name = full.partition("/")
    return name if owner.lower() == login.lower() else full


def first_line(text: str | None, limit: int = 80) -> str:
    line = (text or "").strip().splitlines()[0] if (text or "").strip() else ""
    return line if len(line) <= limit else line[: limit - 1].rstrip() + "…"


def normalize_events(raw: list[dict], login: str, limit: int = 20) -> list[dict]:
    """Map raw REST events onto the compact feed schema used by the site.

    Public PushEvent payloads carry only the head SHA (no commit messages), so
    push items are enriched later by ``enrich_events``. Consecutive pushes to
    the same branch within six hours collapse into one item.
    """
    items: list[dict] = []
    # The API is only roughly ordered; adjacency matters for collapsing pushes.
    for ev in sorted(raw, key=lambda e: e.get("created_at") or "", reverse=True):
        repo = ev.get("repo", {}).get("name") or ""
        if not repo:
            continue
        kind = ev.get("type")
        payload = ev.get("payload") or {}
        base = {
            "id": str(ev.get("id")),
            "repo": repo,
            "repoUrl": f"https://github.com/{repo}",
            "at": ev.get("created_at"),
            "detail": "",
        }
        name = short_repo(repo, login)
        if kind == "PushEvent":
            branch = (payload.get("ref") or "").replace("refs/heads/", "")
            suffix = "" if branch in ("main", "master", "") else f" ({branch})"
            prev = items[-1] if items else None
            if (
                prev
                and prev["type"] == "push"
                and prev["repo"] == repo
                and prev["branch"] == branch
                and within_hours(prev["at"], base["at"], 6)
            ):
                prev["count"] += 1
                continue  # keep the newer head/time already stored in prev
            items.append({
                **base,
                "type": "push",
                "title": f"Pushed to {name}{suffix}",
                "url": f"https://github.com/{repo}/commit/{payload.get('head', '')}",
                "branch": branch,
                "count": 1,
                "head": payload.get("head") or "",
            })
        elif kind == "CreateEvent":
            ref_type = payload.get("ref_type")
            # A new repository surfaces as its default branch being created.
            if ref_type == "repository" or (ref_type == "branch" and payload.get("ref") == payload.get("master_branch")):
                title, url = f"Created {name}", base["repoUrl"]
            elif ref_type == "tag":
                title, url = f"Tagged {name} {payload.get('ref')}", f"{base['repoUrl']}/releases/tag/{payload.get('ref')}"
            else:
                title, url = f"Created branch {payload.get('ref')} in {name}", f"{base['repoUrl']}/tree/{payload.get('ref')}"
            items.append({**base, "type": "create", "title": title, "url": url})
        elif kind == "PullRequestEvent":
            number = payload.get("number") or (payload.get("pull_request") or {}).get("number")
            action = (payload.get("action") or "updated").capitalize()
            items.append({
                **base,
                "type": "pr",
                "title": f"{action} PR #{number} in {name}",
                "url": f"{base['repoUrl']}/pull/{number}",
                "number": number,
                "detail": first_line((payload.get("pull_request") or {}).get("title")),
            })
        elif kind == "WatchEvent":
            items.append({**base, "type": "star", "title": f"Starred {repo}", "url": base["repoUrl"]})
        elif kind == "ForkEvent":
            items.append({**base, "type": "fork", "title": f"Forked {repo}", "url": base["repoUrl"]})
        elif kind == "ReleaseEvent":
            rel = payload.get("release") or {}
            items.append({
                **base,
                "type": "release",
                "title": f"Released {rel.get('tag_name') or ''} in {name}".replace("  ", " "),
                "url": rel.get("html_url") or f"{base['repoUrl']}/releases",
                "detail": first_line(rel.get("name")),
            })
        elif kind == "IssuesEvent":
            issue = payload.get("issue") or {}
            action = (payload.get("action") or "updated").capitalize()
            items.append({
                **base,
                "type": "issue",
                "title": f"{action} issue #{issue.get('number')} in {name}",
                "url": issue.get("html_url") or f"{base['repoUrl']}/issues",
                "detail": first_line(issue.get("title")),
            })
        # Comments, reviews, member events and the like are noise in a feed.
        if len(items) >= limit:
            break
    return items[:limit]


def within_hours(a: str | None, b: str | None, hours: float) -> bool:
    try:
        ta = dt.datetime.fromisoformat((a or "").replace("Z", "+00:00"))
        tb = dt.datetime.fromisoformat((b or "").replace("Z", "+00:00"))
    except ValueError:
        return False
    return abs((ta - tb).total_seconds()) <= hours * 3600


def enrich_events(items: list[dict], token: str, budget: int = 18) -> None:
    """Fill in details the public payloads omit, spending at most ``budget`` requests."""
    spent = 0
    for item in items:
        if spent >= budget:
            break
        if item["type"] == "push" and item.get("head") and not item["detail"]:
            data = rest_get(token, f"/repos/{item['repo']}/commits/{item['head']}")
            spent += 1
            if data:
                item["detail"] = first_line((data.get("commit") or {}).get("message"))
        elif item["type"] == "pr" and item.get("number") and not item["detail"]:
            data = rest_get(token, f"/repos/{item['repo']}/pulls/{item['number']}")
            spent += 1
            if data:
                item["detail"] = first_line(data.get("title"))
        elif item["type"] in ("star", "fork") and not item["detail"]:
            data = rest_get(token, f"/repos/{item['repo']}")
            spent += 1
            if data:
                item["detail"] = first_line(data.get("description"), 100)


def humanize_delta(then: str | None, now: dt.datetime) -> str:
    try:
        t = dt.datetime.fromisoformat((then or "").replace("Z", "+00:00"))
    except ValueError:
        return ""
    secs = max(0, int((now - t).total_seconds()))
    if secs < 90:
        return "just now"
    days = secs // 86400
    ladder = [
        ("minute", secs // 60, 60),
        ("hour", secs // 3600, 24),
        ("day", days, 7),
        ("week", days // 7, 5),
        ("month", days // 30, 12),
        ("year", days // 365, None),
    ]
    for unit, n, cap in ladder:
        if cap is None or n < cap:
            n = max(1, n)
            return f"{n} {unit}{'s' if n != 1 else ''} ago"
    return ""


def derive_now(events: list[dict], repos: list[dict]) -> dict:
    """The single line that says what the user is doing right now."""
    for ev in events:
        if ev["type"] in ("push", "create", "pr", "release"):
            return {"text": ev["title"], "at": ev["at"], "url": ev["url"]}
    live = sorted((r for r in repos if r.get("pushedAt")), key=lambda r: r["pushedAt"], reverse=True)
    if live:
        return {"text": f"Working on {live[0]['name']}", "at": live[0]["pushedAt"], "url": live[0]["url"]}
    return {"text": "Building local-first voice AI", "at": None, "url": None}


# --------------------------------------------------------------------------- derive


def summarize(user: dict) -> dict:
    repos = user["repositories"]["nodes"]
    contrib = user["contributionsCollection"]
    calendar = contrib["contributionCalendar"]

    stars = sum(r.get("stargazerCount", 0) for r in repos)

    sizes: dict[str, int] = {}
    colors: dict[str, str] = {}
    for repo in repos:
        for edge in repo.get("languages", {}).get("edges", []):
            node = edge["node"]
            name = node["name"]
            sizes[name] = sizes.get(name, 0) + edge["size"]
            colors.setdefault(name, node.get("color") or "#8b949e")
    languages = sorted(sizes.items(), key=lambda kv: kv[1], reverse=True)

    days = [d for week in calendar["weeks"] for d in week["contributionDays"]]
    days.sort(key=lambda d: d["date"])

    return {
        "name": user.get("name") or user["login"],
        "login": user["login"],
        "bio": user.get("bio") or "",
        "location": user.get("location") or "",
        "company": user.get("company") or "",
        "avatar_url": user.get("avatarUrl") or "",
        "website": user.get("websiteUrl") or "",
        "followers": user["followers"]["totalCount"],
        "repo_count": user["repositories"]["totalCount"],
        "stars": stars,
        "commits": contrib["totalCommitContributions"],
        "prs": contrib["totalPullRequestContributions"],
        "issues": contrib["totalIssueContributions"],
        "reviews": contrib["totalPullRequestReviewContributions"],
        "total_contributions": calendar["totalContributions"],
        "streak": current_streak(days),
        "languages": [(n, s, colors[n]) for n, s in languages],
        "weeks": calendar["weeks"],
        "days": days,
        "repos": repos,
    }


def current_streak(days: list[dict]) -> int:
    """Consecutive contributing days ending today (or yesterday, if today is idle).

    The calendar only covers the past year, so a longer run reports as capped.
    """
    if not days:
        return 0
    streak = 0
    for i, day in enumerate(reversed(days)):
        if day["contributionCount"] > 0:
            streak += 1
        elif i == 0:
            continue  # today may simply not have happened yet
        else:
            break
    return streak


# --------------------------------------------------------------------------- render

# Palette is defined once and switched with prefers-color-scheme, which applies
# inside an <img>-loaded SVG, so one file serves both GitHub themes.
STYLE = """
    :root {
      --bg: #ffffff; --border: #d0d7de; --title: #0969da;
      --text: #1f2328; --muted: #656d76; --track: #eaeef2;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117; --border: #30363d; --title: #58a6ff;
        --text: #e6edf3; --muted: #8b949e; --track: #21262d;
      }
    }
    .card { fill: var(--bg); stroke: var(--border); }
    .title { font: 600 16px 'Segoe UI', Ubuntu, Sans-Serif; fill: var(--title); }
    .label { font: 400 13px 'Segoe UI', Ubuntu, Sans-Serif; fill: var(--text); }
    .value { font: 600 13px 'Segoe UI', Ubuntu, Sans-Serif; fill: var(--text); }
    .muted { font: 400 10px 'Segoe UI', Ubuntu, Sans-Serif; fill: var(--muted); }
"""


def svg_open(width: int, height: int, title: str) -> list[str]:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" aria-label="{escape(title)}">',
        f"<title>{escape(title)}</title>",
        f"<style>{STYLE}</style>",
        f'<rect class="card" x="0.5" y="0.5" rx="6" width="{width - 1}" '
        f'height="{height - 1}"/>',
    ]


def fmt(n: int) -> str:
    return f"{n:,}"


def render_stats(s: dict, path: str) -> None:
    rows = [
        ("Total Stars Earned", fmt(s["stars"])),
        ("Total Commits (past year)", fmt(s["commits"])),
        ("Total Pull Requests", fmt(s["prs"])),
        ("Total Issues", fmt(s["issues"])),
        ("Code Reviews", fmt(s["reviews"])),
        ("Public Repositories", fmt(s["repo_count"])),
        ("Followers", fmt(s["followers"])),
        ("Current Streak", f"{s['streak']} day{'s' if s['streak'] != 1 else ''}"),
    ]
    width, top, step = 460, 74, 26
    height = top + step * len(rows) + 30
    out = svg_open(width, height, f"{s['name']}'s GitHub statistics")
    out.append(f'<text class="title" x="25" y="35">{escape(s["name"])}\'s GitHub Stats</text>')
    out.append(
        f'<text class="muted" x="25" y="53">{fmt(s["total_contributions"])} '
        f"contributions in the last year</text>"
    )
    for i, (label, value) in enumerate(rows):
        y = top + i * step
        out.append(f'<text class="label" x="25" y="{y}">{escape(label)}</text>')
        out.append(f'<text class="value" x="{width - 25}" y="{y}" text-anchor="end">{escape(value)}</text>')
    # The calendar total counts private contributions; the per-type rows above
    # only see public ones unless a STATS_TOKEN with read:user is configured.
    out.append(
        f'<text class="muted" x="25" y="{top + step * len(rows) + 6}">'
        "Per-type counts cover public contributions only</text>"
    )
    out.append("</svg>")
    write(path, out)


def render_languages(s: dict, path: str, top_n: int = 6) -> None:
    langs = s["languages"][:top_n]
    total = sum(size for _, size, _ in langs)
    width = 460
    height = 74 + 22 * ((len(langs) + 1) // 2) + 10
    out = svg_open(width, height, "Most used languages")
    out.append('<text class="title" x="25" y="35">Most Used Languages</text>')

    bar_x, bar_w, bar_y = 25, width - 50, 48
    out.append(f'<rect x="{bar_x}" y="{bar_y}" rx="5" width="{bar_w}" height="10" fill="var(--track)"/>')
    if total:
        # Clip the segments so the joined bar keeps its rounded ends.
        out.append(f'<clipPath id="bar"><rect x="{bar_x}" y="{bar_y}" rx="5" width="{bar_w}" height="10"/></clipPath>')
        out.append('<g clip-path="url(#bar)">')
        offset = float(bar_x)
        for _, size, color in langs:
            seg = bar_w * size / total
            out.append(f'<rect x="{offset:.2f}" y="{bar_y}" width="{seg:.2f}" height="10" fill="{escape(color)}"/>')
            offset += seg
        out.append("</g>")

    for i, (name, size, color) in enumerate(langs):
        col, row = i % 2, i // 2
        x = 25 + col * (bar_w // 2)
        y = 84 + row * 22
        pct = (size / total * 100) if total else 0.0
        out.append(f'<circle cx="{x + 5}" cy="{y - 4}" r="5" fill="{escape(color)}"/>')
        out.append(f'<text class="label" x="{x + 17}" y="{y}">{escape(name)} {pct:.1f}%</text>')
    out.append("</svg>")
    write(path, out)


def render_activity(s: dict, path: str) -> None:
    weeks = s["weeks"]
    cell, gap, pad_x, pad_y = 11, 3, 25, 60
    width = pad_x * 2 + len(weeks) * (cell + gap)
    height = pad_y + 7 * (cell + gap) + 26
    out = svg_open(width, height, "Contribution activity over the past year")
    out.append('<text class="title" x="25" y="35">Contribution Activity</text>')

    peak = max((d["contributionCount"] for d in s["days"]), default=0)
    for wi, week in enumerate(weeks):
        for day in week["contributionDays"]:
            di = dt.date.fromisoformat(day["date"]).isoweekday() % 7
            x = pad_x + wi * (cell + gap)
            y = pad_y + di * (cell + gap)
            count = day["contributionCount"]
            if count == 0:
                fill = "var(--track)"
            else:
                # Four buckets scaled to this user's own busiest day.
                level = min(4, 1 + int(3 * (count - 1) / max(1, peak - 1)))
                fill = {1: "#9be9a8", 2: "#40c463", 3: "#30a14e", 4: "#216e39"}[level]
            out.append(
                f'<rect x="{x}" y="{y}" width="{cell}" height="{cell}" rx="2" fill="{fill}">'
                f'<title>{day["date"]}: {count} contribution{"s" if count != 1 else ""}</title></rect>'
            )
    legend_y = pad_y + 7 * (cell + gap) + 14
    out.append(f'<text class="muted" x="{pad_x}" y="{legend_y}">Less</text>')
    for i, fill in enumerate(["var(--track)", "#9be9a8", "#40c463", "#30a14e", "#216e39"]):
        out.append(
            f'<rect x="{pad_x + 32 + i * 14}" y="{legend_y - 9}" width="{cell}" '
            f'height="{cell}" rx="2" fill="{fill}"/>'
        )
    out.append(f'<text class="muted" x="{pad_x + 32 + 5 * 14 + 4}" y="{legend_y}">More</text>')
    out.append("</svg>")
    write(path, out)


def render_hero(s: dict, now_item: dict, path: str, now: dt.datetime | None = None, about: dict | None = None) -> None:
    """Animated README hero: a breathing contribution waveform with a live status line.

    GitHub renders this inside an <img>, which permits inline CSS, gradients,
    filters and SMIL animation but strips scripts, links and external
    references, so the whole card is built from those primitives alone.
    """
    now = now or dt.datetime.now(dt.timezone.utc)
    weeks = s["weeks"][-52:]
    totals = [sum(d["contributionCount"] for d in w["contributionDays"]) for w in weeks]
    peak = max(totals) or 1
    width, height, mid = 900, 300, 200
    bar_w, step, x0 = 9, 15, 60

    status = now_item.get("text") or "Building local-first voice AI"
    if now_item.get("at"):
        ago = humanize_delta(now_item["at"], now)
        if ago:
            status = f"{status} · {ago}"
    if len(status) > 72:
        status = status[:71].rstrip() + "…"

    style = """
    :root {
      --bg: #070a12; --bg2: #0d1322; --border: #1e293b; --text: #f1f5f9;
      --muted: #94a3b8; --accent: #22d3ee; --accent2: #a78bfa; --ok: #34d399;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc; --bg2: #ffffff; --border: #e2e8f0; --text: #0f172a;
        --muted: #475569; --accent: #0891b2; --accent2: #7c3aed; --ok: #059669;
      }
    }
    .bg { fill: var(--bg); stroke: var(--border); }
    .gA { stop-color: var(--accent); } .gB { stop-color: var(--accent2); }
    .name { font: 700 34px 'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif; fill: var(--text); letter-spacing: -0.5px; }
    .role { font: 400 16px 'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif; fill: var(--muted); }
    .status { font: 500 14px 'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif; fill: var(--accent); }
    .meta { font: 400 11px 'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif; fill: var(--muted); }
    .cta { font: 600 13px 'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif; fill: var(--accent); }
    .pill { fill: var(--bg2); stroke: var(--accent); }
    .head { stroke: var(--accent); }
    .dot { fill: var(--ok); }
    .mark { fill: var(--accent); }
"""
    label = f"{s['name']} — animated contribution waveform. Now: {status}. Open the 3D portfolio."
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" aria-label="{escape(label)}">',
        f"<title>{escape(label)}</title>",
        f"<style>{style}</style>",
        "<defs>",
        f'<clipPath id="frame"><rect x="0.5" y="0.5" rx="14" width="{width - 1}" height="{height - 1}"/></clipPath>',
        '<radialGradient id="glow" cx="50%" cy="68%" r="55%">'
        '<stop offset="0" class="gA" stop-opacity="0.32"/><stop offset="1" class="gA" stop-opacity="0"/></radialGradient>',
        '<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" class="gB"/><stop offset="0.5" class="gA"/><stop offset="1" class="gB"/></linearGradient>',
        '<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0" class="gA" stop-opacity="0"/><stop offset="0.5" class="gA" stop-opacity="0.18"/>'
        '<stop offset="1" class="gA" stop-opacity="0"/></linearGradient>',
        '<filter id="soft" x="-20%" y="-30%" width="140%" height="160%">'
        '<feGaussianBlur stdDeviation="2.2" result="b"/>'
        '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
        "</defs>",
        f'<rect class="bg" x="0.5" y="0.5" rx="14" width="{width - 1}" height="{height - 1}"/>',
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="url(#glow)" clip-path="url(#frame)"/>',
    ]

    # Waveform bars: one per week, mirrored around the baseline, each breathing
    # on its own phase so the ripple appears to travel across the card.
    out.append('<g filter="url(#soft)" fill="url(#bar)">')
    splines = 'calcMode="spline" keyTimes="0;0.33;0.66;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1"'

    for i, total in enumerate(totals):
        # Log scale so a quiet week still registers next to a burst week.
        h = 5 + 74 * math.log1p(total) / math.log1p(peak)
        x = x0 + i * step
        hs = [h, h * 1.35, h * 0.8, h]
        ys = ";".join(f"{mid - v / 2:.1f}" for v in hs)
        heights = ";".join(f"{v:.1f}" for v in hs)
        begin = f"{-(i * 0.09):.2f}s"
        dim = ' opacity="0.4"' if total == 0 else ""
        out.append(
            f'<rect x="{x}" y="{mid - h / 2:.1f}" width="{bar_w}" height="{h:.1f}" rx="4"{dim}>'
            f'<animate attributeName="height" values="{heights}" dur="2.6s" begin="{begin}" repeatCount="indefinite" {splines}/>'
            f'<animate attributeName="y" values="{ys}" dur="2.6s" begin="{begin}" repeatCount="indefinite" {splines}/>'
            f"</rect>"
        )
    out.append("</g>")

    # A playhead sweeping across the waveform, like a voice being scanned.
    x_end = x0 + (len(totals) - 1) * step + bar_w
    # The clip lives on an outer group so it stays put while the inner one moves.
    out.append(
        '<g clip-path="url(#frame)"><g>'
        f'<rect x="-60" y="130" width="120" height="140" fill="url(#beam)"/>'
        f'<line class="head" x1="0" y1="140" x2="0" y2="260" stroke-width="1.5" stroke-opacity="0.7"/>'
        f'<animateTransform attributeName="transform" type="translate" from="{x0} 0" to="{x_end} 0" '
        'dur="7s" repeatCount="indefinite"/>'
        "</g></g>"
    )
    # Pulse on the newest week.
    out.append(
        f'<circle class="mark" cx="{x_end - bar_w / 2}" cy="{mid}" r="5">'
        '<animate attributeName="r" values="4;9;4" dur="1.8s" repeatCount="indefinite"/>'
        '<animate attributeName="opacity" values="0.9;0.15;0.9" dur="1.8s" repeatCount="indefinite"/>'
        "</circle>"
    )

    out.append(f'<text class="name" x="{x0}" y="64">{escape(s["name"])}</text>')
    # Headline plus role when they fit on one line, otherwise just the role.
    headline = (about or {}).get("headline") or "Developer building with AI"
    role = (about or {}).get("role") or ""
    line = f"{headline} · {role}" if role and len(f"{headline} · {role}") <= 72 else (role or headline)
    out.append(f'<text class="role" x="{x0}" y="92">{escape(line[:72])}</text>')
    out.append(
        f'<circle class="dot" cx="{x0 + 5}" cy="119" r="4">'
        '<animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite"/></circle>'
    )
    out.append(f'<text class="status" x="{x0 + 17}" y="124">Now: {escape(status)}</text>')

    meta = (
        f"{fmt(s['total_contributions'])} contributions in the last year · "
        f"{s['streak']}-day streak · updated {now:%Y-%m-%d} UTC"
    )
    out.append(f'<text class="meta" x="{x0}" y="272">{escape(meta)}</text>')
    out.append(
        '<rect class="pill" x="640" y="249" width="200" height="34" rx="17">'
        '<animate attributeName="stroke-opacity" values="0.45;1;0.45" dur="2.4s" repeatCount="indefinite"/></rect>'
    )
    out.append('<text class="cta" x="740" y="271" text-anchor="middle">Open the 3D portfolio →</text>')
    out.append("</svg>")
    write(path, out)


def write(path: str, lines: list[str]) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"wrote {path}", file=sys.stderr)


# --------------------------------------------------------------------------- projects

ABOUT_PATH = "data/about.json"


def load_about(path: str = ABOUT_PATH) -> dict:
    """Curated profile copy shared by the site, the README and the hero card."""
    try:
        with open(path, encoding="utf-8") as fh:
            raw = json.load(fh)
    except FileNotFoundError:
        raw = {}
    return {
        "headline": raw.get("headline") or "Developer building with AI",
        "role": raw.get("role") or "",
        "tagline": raw.get("tagline") or "",
        "summary": raw.get("summary") or "",
        "focus": raw.get("focus") or [],
        "experience": raw.get("experience") or [],
        "highlights": raw.get("highlights") or [],
    }


def replace_block(content: str, name: str, body: str) -> str:
    """Swap the text between <!-- NAME:START --> and <!-- NAME:END --> markers."""
    start_tag, end_tag = f"<!-- {name}:START -->", f"<!-- {name}:END -->"
    if start_tag not in content or end_tag not in content:
        print(f"README: {name} markers missing, skipping", file=sys.stderr)
        return content
    start = content.index(start_tag)
    end = content.index(end_tag) + len(end_tag)
    return content[:start] + f"{start_tag}\n\n{body}\n\n{end_tag}" + content[end:]


def render_about(about: dict, readme: str = "README.md") -> None:
    """Intro paragraph and a highlights list in the README, from data/about.json."""
    with open(readme, encoding="utf-8") as fh:
        content = fh.read()

    intro = f"**{about['headline']}.** {about['tagline']}".strip()
    if about["summary"]:
        intro += f"\n\n{about['summary']}"
    content = replace_block(content, "ABOUT", intro)

    rows = []
    for item in about["highlights"][:8]:
        title = f"[{item['title']}]({item['url']})" if item.get("url") else item.get("title", "")
        when = item.get("date", "")
        org = f" · {item['org']}" if item.get("org") else ""
        detail = f" — {item['detail']}" if item.get("detail") else ""
        rows.append(f"- **{when}**{org}: {title}{detail}" if when else f"- {title}{org}{detail}")
    if rows:
        content = replace_block(content, "HIGHLIGHTS", "\n".join(rows))
    else:
        content = replace_block(content, "HIGHLIGHTS", "_Milestones will appear here once `data/about.json` lists them._")

    with open(readme, "w", encoding="utf-8") as fh:
        fh.write(content)
    print(f"updated about/highlights in {readme}", file=sys.stderr)


PROJECTS_START = "<!-- PROJECTS:START -->"
PROJECTS_END = "<!-- PROJECTS:END -->"


def load_overrides(path: str = "data/projects.json") -> dict:
    """Curated blurbs and pin order, since most repositories carry no description."""
    try:
        with open(path, encoding="utf-8") as fh:
            raw = json.load(fh)
    except FileNotFoundError:
        return {"featured": [], "descriptions": {}, "exclude": []}
    return {
        "featured": raw.get("featured", []),
        # Repository names are matched case-insensitively.
        "descriptions": {k.lower(): v for k, v in raw.get("descriptions", {}).items()},
        "exclude": [name.lower() for name in raw.get("exclude", [])],
    }


def pick_projects(repos: list[dict], overrides: dict, limit: int = 6) -> list[dict]:
    """Pinned repositories first, then the most recently pushed ones."""
    excluded = set(overrides["exclude"])
    live = [r for r in repos if not r.get("isArchived") and r["name"].lower() not in excluded]
    live.sort(key=lambda r: r.get("pushedAt") or "", reverse=True)

    by_name = {r["name"].lower(): r for r in live}
    picked, seen = [], set()
    for name in overrides["featured"]:
        repo = by_name.get(name.lower())
        if repo:
            picked.append(repo)
            seen.add(repo["name"].lower())
    for repo in live:
        if len(picked) >= limit:
            break
        if repo["name"].lower() not in seen:
            picked.append(repo)
    return picked[:limit]


def resolve_description(repo: dict, overrides: dict) -> str:
    """Curated blurb first, then the GitHub description, else empty."""
    return (
        overrides["descriptions"].get(repo["name"].lower())
        or (repo.get("description") or "").strip()
    )


def render_projects(repos: list[dict], readme: str = "README.md") -> None:
    """Rewrite the project table between the PROJECTS markers in the README."""
    with open(readme, encoding="utf-8") as fh:
        content = fh.read()
    if PROJECTS_START not in content or PROJECTS_END not in content:
        print(f"{readme}: project markers missing, skipping", file=sys.stderr)
        return

    overrides = load_overrides()
    rows = ["| Project | What it is | Stack |", "| --- | --- | --- |"]
    for repo in pick_projects(repos, overrides):
        name = repo["name"]
        desc = resolve_description(repo, overrides) or "_No description yet_"
        lang = (repo.get("primaryLanguage") or {}).get("name") or ""
        topics = [t["topic"]["name"] for t in repo.get("repositoryTopics", {}).get("nodes", [])]
        stack = " · ".join(filter(None, [f"**{lang}**" if lang else "", ", ".join(topics[:3])]))
        stars = repo.get("stargazerCount", 0)
        title = f"[{name}]({repo['url']})" + (f" ⭐ {stars}" if stars else "")
        if repo.get("demo"):
            title += f" · [live ↗]({repo['demo']})"
        rows.append(f"| {title} | {desc} | {stack or '—'} |")

    block = f"{PROJECTS_START}\n\n" + "\n".join(rows) + f"\n\n{PROJECTS_END}"
    start = content.index(PROJECTS_START)
    end = content.index(PROJECTS_END) + len(PROJECTS_END)
    with open(readme, "w", encoding="utf-8") as fh:
        fh.write(content[:start] + block + content[end:])
    print(f"updated project table in {readme}", file=sys.stderr)


# --------------------------------------------------------------------------- snapshot

SNAPSHOT_SCHEMA = 1


def shape_repo(repo: dict, overrides: dict) -> dict:
    lang = repo.get("primaryLanguage") or {}
    return {
        "name": repo["name"],
        "url": repo["url"],
        "homepage": repo.get("homepageUrl") or None,
        "demo": repo.get("demo") or None,
        "description": resolve_description(repo, overrides),
        "language": lang.get("name") or None,
        "languageColor": lang.get("color") or None,
        "stars": repo.get("stargazerCount", 0),
        "forks": repo.get("forkCount", 0),
        "pushedAt": repo.get("pushedAt"),
        "topics": [t["topic"]["name"] for t in repo.get("repositoryTopics", {}).get("nodes", [])],
        "featured": repo["name"].lower() in {f.lower() for f in overrides["featured"]},
    }


def build_snapshot(s: dict, events: list[dict], overrides: dict, now: dt.datetime) -> dict:
    """Compact JSON the site ships with, so it renders even if the API is unreachable."""
    excluded = set(overrides["exclude"])
    live = [r for r in s["repos"] if not r.get("isArchived") and r["name"].lower() not in excluded]
    live.sort(key=lambda r: r.get("pushedAt") or "", reverse=True)
    repos = [shape_repo(r, overrides) for r in live[:30]]

    total_size = sum(size for _, size, _ in s["languages"]) or 1
    languages = [
        {"name": name, "size": size, "color": color, "pct": round(size / total_size * 100, 1)}
        for name, size, color in s["languages"][:8]
    ]
    days = [{"d": d["date"], "c": d["contributionCount"]} for d in s["days"]]
    return {
        "schema": SNAPSHOT_SCHEMA,
        "generatedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "login": s["login"],
        "name": s["name"],
        "bio": s["bio"],
        "location": s["location"],
        "company": s["company"],
        "avatarUrl": s["avatar_url"],
        "website": s["website"],
        "stats": {
            "followers": s["followers"],
            "repos": s["repo_count"],
            "stars": s["stars"],
            "commits": s["commits"],
            "prs": s["prs"],
            "issues": s["issues"],
            "reviews": s["reviews"],
            "totalContributions": s["total_contributions"],
            "streak": s["streak"],
        },
        "languages": languages,
        "calendar": {
            "from": days[0]["d"] if days else None,
            "to": days[-1]["d"] if days else None,
            "peak": max((d["c"] for d in days), default=0),
            "days": days,
        },
        "repos": repos,
        "events": events,
        "now": derive_now(events, repos),
        "about": load_about(),
    }


# --------------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--login", required=True)
    ap.add_argument("--out", default="assets")
    ap.add_argument("--fixture", help="render from a saved API response instead of fetching")
    ap.add_argument("--dump-json", help="save the raw API response here")
    ap.add_argument("--readme", help="README to refresh the project table in")
    ap.add_argument("--site-json", help="write the site data snapshot to this path")
    args = ap.parse_args()

    if args.fixture:
        with open(args.fixture, encoding="utf-8") as fh:
            saved = json.load(fh)
        # Older fixtures are a bare user object; newer ones wrap user + events.
        user = saved.get("user", saved)
        raw_events = saved.get("events", [])
        token = None
    else:
        token = os.environ.get("GITHUB_TOKEN")
        if not token:
            print("GITHUB_TOKEN is not set", file=sys.stderr)
            return 1
        try:
            user = fetch(args.login, token)
        except (urllib.error.URLError, RuntimeError) as exc:
            print(f"failed to fetch stats: {exc}", file=sys.stderr)
            return 1
        raw_events = fetch_events(args.login, token)

    if args.dump_json:
        with open(args.dump_json, "w", encoding="utf-8") as fh:
            json.dump({"user": user, "events": raw_events}, fh, indent=2)

    now = dt.datetime.now(dt.timezone.utc)
    overrides = load_overrides()
    events = normalize_events(raw_events, args.login)
    if token:
        enrich_events(events, token)

    # Attach live demo links (Pages sites / homepages) to repositories.
    pages = fetch_pages_flags(args.login, token) if token else {}
    for repo in user["repositories"]["nodes"]:
        if repo.get("demo"):
            continue  # already resolved in a fixture
        url = demo_url(repo, args.login, pages.get(repo["name"].lower(), False))
        repo["demo"] = url if url and (not token or url_is_live(url)) else None

    os.makedirs(args.out, exist_ok=True)
    s = summarize(user)
    snapshot = build_snapshot(s, events, overrides, now)
    render_stats(s, os.path.join(args.out, "github-stats.svg"))
    render_languages(s, os.path.join(args.out, "top-languages.svg"))
    render_activity(s, os.path.join(args.out, "activity.svg"))
    render_hero(s, snapshot["now"], os.path.join(args.out, "hero.svg"), now, snapshot["about"])
    if args.readme:
        render_projects(s["repos"], args.readme)
        render_about(snapshot["about"], args.readme)
    if args.site_json:
        os.makedirs(os.path.dirname(args.site_json) or ".", exist_ok=True)
        with open(args.site_json, "w", encoding="utf-8") as fh:
            json.dump(snapshot, fh, separators=(",", ":"), ensure_ascii=False)
            fh.write("\n")
        print(f"wrote {args.site_json}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
