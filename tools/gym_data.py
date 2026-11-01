"""Inspect, back up, and repair Gym Buddies data stored in the shared Gist.

Read-only commands need no token. Write commands preview by default and only
change data with --apply. Token: GITHUB_TOKEN env var, else git's stored
github.com credential (gist scope required).

  python tools/gym_data.py show                      current members
  python tools/gym_data.py revisions [--limit 20]    gist edit history
  python tools/gym_data.py backups                   daily snapshots (data-backups branch)
  python tools/gym_data.py restore --backup 2026-11-05 [--member ID ...] [--apply]
  python tools/gym_data.py restore --revision SHA [--member ID ...] [--apply]
  python tools/gym_data.py remove-days ID --from 2026-11-03 --to 2026-11-04 [--steps] [--apply]
  python tools/gym_data.py delete-member ID [--apply]
"""
import argparse
import datetime
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

GIST_ID = 'b5a7d32dc701472f020d199ee30de815'
REPO = 'gokxl/accountability-tracker'
BACKUP_BRANCH = 'data-backups'
API = 'https://api.github.com'


def token():
    tok = os.environ.get('GITHUB_TOKEN')
    if tok:
        return tok
    out = subprocess.run(['git', '-c', 'credential.interactive=never', 'credential', 'fill'],
                         input='protocol=https\nhost=github.com\nusername=gokxl\n\n',
                         capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith('password='):
            return line[len('password='):]
    sys.exit('No GitHub token found. Set GITHUB_TOKEN (gist scope) and retry.')


def call(method, url, body=None, auth=False):
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'gym-data-tool', 'Cache-Control': 'no-cache'}
    if auth:
        headers['Authorization'] = f'Bearer {token()}'
    data = json.dumps(body).encode() if body is not None else None
    if data:
        headers['Content-Type'] = 'application/json'
    with urllib.request.urlopen(urllib.request.Request(url, data, headers, method=method)) as r:
        return json.loads(r.read() or b'null')


def gym_files(files):
    """{filename: member dict} for gym-*.json entries of a gist files map."""
    out = {}
    for name, f in files.items():
        if name.startswith('gym-') and name.endswith('.json'):
            text = f['content'] if not f.get('truncated') else urllib.request.urlopen(f['raw_url']).read().decode()
            out[name] = json.loads(text)
    return out


def current():
    return gym_files(call('GET', f'{API}/gists/{GIST_ID}')['files'])


def summary(m):
    days = sorted(m.get('days', {}))
    steps = m.get('steps', {})
    return f"{m['id']:<28} {m.get('name', '?'):<12} {len(days):>4} days  last={days[-1] if days else '-'}  steps={sum(steps.values()):,} over {len(steps)} days"


def write(files, apply):
    """files: {filename: member dict or None (delete)}."""
    if not apply:
        print('\nDry run only. Re-run with --apply to write these changes.')
        return
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    payload = {}
    for name, m in files.items():
        if m is None:
            payload[name] = None
        else:
            # Newer timestamp makes every phone accept the repaired copy instead of its local one.
            m['updatedAt'] = now
            payload[name] = {'content': json.dumps(m, indent=1)}
    call('PATCH', f'{API}/gists/{GIST_ID}', {'files': payload}, auth=True)
    print(f'\nApplied {len(payload)} change(s). Phones pick it up on their next sync.')


def diff_line(name, old, new):
    if new is None:
        return f'  DELETE {name} ({len(old.get("days", {}))} days)'
    od, nd = set((old or {}).get('days', {})), set(new.get('days', {}))
    added, removed = sorted(nd - od), sorted(od - nd)
    os_, ns = (old or {}).get('steps', {}), new.get('steps', {})
    step_changes = sorted(k for k in set(os_) | set(ns) if os_.get(k) != ns.get(k))
    label = 'CREATE' if old is None else 'UPDATE'
    return f'  {label} {name}: {len(od)} -> {len(nd)} days' + \
        (f'\n    + {", ".join(added)}' if added else '') + (f'\n    - {", ".join(removed)}' if removed else '') + \
        (f'\n    steps changed on: {", ".join(step_changes)}' if step_changes else '')


def cmd_show(_):
    data = current()
    print(f'{len(data)} member(s) in gist {GIST_ID}')
    for m in data.values():
        print(' ', summary(m))


def cmd_revisions(a):
    for c in call('GET', f'{API}/gists/{GIST_ID}/commits?per_page={a.limit}'):
        s = c['change_status']
        print(f"{c['committed_at']}  {c['version'][:10]}  +{s.get('additions', 0)}/-{s.get('deletions', 0)}")


def cmd_backups(_):
    try:
        items = call('GET', f'{API}/repos/{REPO}/contents/snapshots?ref={BACKUP_BRANCH}')
    except urllib.error.HTTPError:
        sys.exit('No backups yet (the data-backups branch is created by the first backup run).')
    for i in sorted(items, key=lambda x: x['name']):
        print(i['name'])


def load_source(a):
    if a.revision:
        commits = call('GET', f'{API}/gists/{GIST_ID}/commits?per_page=100')
        match = [c['version'] for c in commits if c['version'].startswith(a.revision)]
        if len(match) != 1:
            sys.exit(f'Revision {a.revision} not found (or ambiguous). Use "revisions" to list them.')
        return gym_files(call('GET', f'{API}/gists/{GIST_ID}/{match[0]}')['files'])
    items = call('GET', f'{API}/repos/{REPO}/contents/snapshots/{a.backup}?ref={BACKUP_BRANCH}')
    out = {}
    for i in items:
        if i['name'].startswith('gym-') and i['name'].endswith('.json'):
            out[i['name']] = json.loads(urllib.request.urlopen(i['download_url']).read())
    return out


def cmd_restore(a):
    src, cur = load_source(a), current()
    if a.member:
        wanted = {f'gym-{m}.json' for m in a.member}
        src = {k: v for k, v in src.items() if k in wanted}
        cur = {k: v for k, v in cur.items() if k in wanted}
    changes = dict(src)
    if a.prune:
        changes.update({k: None for k in cur if k not in src})
    if not changes:
        sys.exit('Nothing to restore for that selection.')
    print('Planned changes:')
    for name, m in changes.items():
        print(diff_line(name, cur.get(name), m))
    write(changes, a.apply)


def cmd_remove_days(a):
    name = f'gym-{a.member}.json'
    cur = current()
    if name not in cur:
        sys.exit(f'No member {a.member}. Use "show" to list member IDs.')
    m = json.loads(json.dumps(cur[name]))
    m['days'] = {k: v for k, v in m['days'].items() if not (a.date_from <= k <= a.date_to)}
    if a.steps:
        m['steps'] = {k: v for k, v in m.get('steps', {}).items() if not (a.date_from <= k <= a.date_to)}
    print('Planned changes:')
    print(diff_line(name, cur[name], m))
    write({name: m}, a.apply)


def cmd_delete_member(a):
    name = f'gym-{a.member}.json'
    cur = current()
    if name not in cur:
        sys.exit(f'No member {a.member}.')
    print('Planned changes:')
    print(diff_line(name, cur[name], None))
    write({name: None}, a.apply)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('show').set_defaults(fn=cmd_show)
    r = sub.add_parser('revisions')
    r.add_argument('--limit', type=int, default=20)
    r.set_defaults(fn=cmd_revisions)
    sub.add_parser('backups').set_defaults(fn=cmd_backups)
    r = sub.add_parser('restore')
    g = r.add_mutually_exclusive_group(required=True)
    g.add_argument('--backup', metavar='YYYY-MM-DD')
    g.add_argument('--revision', metavar='SHA')
    r.add_argument('--member', nargs='+', metavar='ID', help='only these member IDs (e.g. gokul-1a2b3c)')
    r.add_argument('--prune', action='store_true', help='also delete members created after the source point')
    r.add_argument('--apply', action='store_true')
    r.set_defaults(fn=cmd_restore)
    r = sub.add_parser('remove-days')
    r.add_argument('member')
    r.add_argument('--from', dest='date_from', required=True, metavar='YYYY-MM-DD')
    r.add_argument('--to', dest='date_to', required=True, metavar='YYYY-MM-DD')
    r.add_argument('--steps', action='store_true', help='also remove step entries in that range')
    r.add_argument('--apply', action='store_true')
    r.set_defaults(fn=cmd_remove_days)
    r = sub.add_parser('delete-member')
    r.add_argument('member')
    r.add_argument('--apply', action='store_true')
    r.set_defaults(fn=cmd_delete_member)
    a = p.parse_args()
    try:
        a.fn(a)
    except urllib.error.HTTPError as e:
        sys.exit(f'GitHub returned {e.code} {e.reason} for {e.url}')


if __name__ == '__main__':
    main()
