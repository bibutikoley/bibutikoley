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


def write(path: str, lines: list[str]) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"wrote {path}", file=sys.stderr)


# --------------------------------------------------------------------------- projects

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
        desc = (
            overrides["descriptions"].get(name.lower())
            or (repo.get("description") or "").strip()
            or "_No description yet_"
        )
        lang = (repo.get("primaryLanguage") or {}).get("name") or ""
        topics = [t["topic"]["name"] for t in repo.get("repositoryTopics", {}).get("nodes", [])]
        stack = " · ".join(filter(None, [f"**{lang}**" if lang else "", ", ".join(topics[:3])]))
        stars = repo.get("stargazerCount", 0)
        title = f"[{name}]({repo['url']})" + (f" ⭐ {stars}" if stars else "")
        rows.append(f"| {title} | {desc} | {stack or '—'} |")

    block = f"{PROJECTS_START}\n\n" + "\n".join(rows) + f"\n\n{PROJECTS_END}"
    start = content.index(PROJECTS_START)
    end = content.index(PROJECTS_END) + len(PROJECTS_END)
    with open(readme, "w", encoding="utf-8") as fh:
        fh.write(content[:start] + block + content[end:])
    print(f"updated project table in {readme}", file=sys.stderr)


# --------------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--login", required=True)
    ap.add_argument("--out", default="assets")
    ap.add_argument("--fixture", help="render from a saved API response instead of fetching")
    ap.add_argument("--dump-json", help="save the raw API response here")
    ap.add_argument("--readme", help="README to refresh the project table in")
    args = ap.parse_args()

    if args.fixture:
        with open(args.fixture, encoding="utf-8") as fh:
            user = json.load(fh)
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

    if args.dump_json:
        with open(args.dump_json, "w", encoding="utf-8") as fh:
            json.dump(user, fh, indent=2)

    os.makedirs(args.out, exist_ok=True)
    s = summarize(user)
    render_stats(s, os.path.join(args.out, "github-stats.svg"))
    render_languages(s, os.path.join(args.out, "top-languages.svg"))
    render_activity(s, os.path.join(args.out, "activity.svg"))
    if args.readme:
        render_projects(s["repos"], args.readme)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
