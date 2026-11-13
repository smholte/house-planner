"""The first job of every test run on GitHub (task 0008): a few quick checks, then the mode of the run.

    python3 tools/ci_precheck.py                 locally: the checks and the mode against main
    python3 tools/ci_precheck.py --github --before SHA     in the workflow (writes the job outputs)

Checks (the run stops here when one fails):
  - nothing private in this public repository: no house/ folder, no task list, no changelog (they name the owner's house
    and live in the private repository)
  - the app's version (APP_VERSION in src/util.js) can be read, with the '__BUILD__' placeholder
  - every test file is in exactly one group (tools/ci_groups.py)
Mode (a line "MODE: …" in the log, which tools/ci_status.py shows):
  full   everything: the build and the test groups
  docs   only notes changed (*.md, *.txt, docs/) since a commit whose run was green: the build and the web check only
  reuse  a push to main of a tree that already ran green (a fast-forward merge of a green branch): nothing again
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ci_groups  # noqa: E402

ROOT = ci_groups.ROOT
WORKFLOW = 'tests.yml'
PRIVATE = ['house', 'tasks', 'TASKS.md', 'CHANGELOG.md', 'docs/HISTORY.md', 'docs/LESSONS.md']


def git(*args) -> str:
    r = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ''


def gh(path: str):
    r = subprocess.run(['gh', 'api', path], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip())
    return json.loads(r.stdout)


def is_doc(path: str) -> bool:
    return (path.endswith('.md') or path.startswith('docs/') or (path.endswith('.txt') and not path.startswith('tools/'))) \
        and not path.startswith('.github/')


def checks() -> list[str]:
    bad = []
    for p in PRIVATE:
        if os.path.exists(os.path.join(ROOT, p)):
            bad.append(f'{p} is in the public repository: it belongs in the private one (it names the owner\'s house)')
    util = open(os.path.join(ROOT, 'src', 'util.js'), encoding='utf-8').read()
    m = re.search(r"APP_VERSION\s*=\s*\{\s*n:\s*(\d+),\s*date:\s*'([^']+)',\s*build:\s*'__BUILD__'", util)
    if not m:
        bad.append("APP_VERSION in src/util.js is not { n: N, date: '…', build: '__BUILD__' }")
    files = ci_groups.test_files()
    grouped = [f for g in ci_groups.matrix() for f in g['files'].split()]
    if sorted(grouped) != files:
        bad.append('the test groups do not hold every test file exactly once')
    return bad


def version() -> str:
    m = re.search(r'APP_VERSION\s*=\s*\{\s*n:\s*(\d+)', open(os.path.join(ROOT, 'src', 'util.js'), encoding='utf-8').read())
    return m.group(1) if m else ''


def green_runs(repo: str) -> list[dict]:
    try:
        return gh(f'repos/{repo}/actions/workflows/{WORKFLOW}/runs?status=success&per_page=100')['workflow_runs']
    except (RuntimeError, KeyError):
        return []


def tree_of(repo: str, sha: str) -> str:
    try:
        return gh(f'repos/{repo}/git/commits/{sha}')['tree']['sha']
    except (RuntimeError, KeyError):
        return ''


def pick_mode(repo: str, sha: str, ref: str, event: str) -> tuple[str, str]:
    """(mode, why)"""
    runs = green_runs(repo) if repo else []
    if event == 'push' and ref == 'refs/heads/main':
        tree = git('rev-parse', f'{sha}^{{tree}}')
        for r in runs:
            if r['head_sha'] == sha or (tree and tree_of(repo, r['head_sha']) == tree):
                return 'reuse', str(r['id'])
    # the nearest green commit this one comes from
    best, dist = None, None
    for r in runs:
        c = r['head_sha']
        if c == sha:
            continue
        if subprocess.run(['git', 'merge-base', '--is-ancestor', c, sha], cwd=ROOT).returncode == 0:
            n = int(git('rev-list', '--count', f'{c}..{sha}') or 10 ** 6)
            if dist is None or n < dist:
                best, dist = c, n
    if not best:
        return 'full', 'no green run of an earlier commit found'
    changed = [p for p in git('diff', '--name-only', best, sha).splitlines() if p]
    if changed and all(is_doc(p) for p in changed):
        return 'docs', f'only notes changed since {best[:7]}: ' + ', '.join(changed[:8])
    return 'full', f'{len(changed)} files changed since the green commit {best[:7]}'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--github', action='store_true')
    ap.add_argument('--before', default='')
    args = ap.parse_args()
    bad = checks()
    for b in bad:
        print(f'::error title=precheck::{b}' if args.github else 'FAIL ' + b)
    if bad:
        return 1
    repo = os.environ.get('GITHUB_REPOSITORY', '')
    if not repo:
        url = git('remote', 'get-url', 'origin')
        m = re.search(r'([\w.-]+/[\w.-]+?)(?:\.git)?$', url)
        repo = m.group(1) if m else ''
    sha = os.environ.get('GITHUB_SHA') or git('rev-parse', 'HEAD')
    mode, why = pick_mode(repo, sha, os.environ.get('GITHUB_REF', ''), os.environ.get('GITHUB_EVENT_NAME', ''))
    if os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch' and mode != 'full':
        mode, why = 'full', 'started by hand: everything'
    groups = ci_groups.matrix()
    print(f'MODE: {mode}' + (f' {why}' if mode == 'reuse' else ''))
    print(f'  ({why})')
    print(f'version {version()}; {sum(len(g["files"].split()) for g in groups)} test files in {len(groups)} groups')
    for g in groups:
        print(f"  group {g['name']}: ~{g['minutes']} min: {g['files']}")
    out = os.environ.get('GITHUB_OUTPUT')
    if args.github and out:
        with open(out, 'a', encoding='utf-8') as fh:
            fh.write(f'mode={mode}\n')
            fh.write('groups=' + json.dumps(groups, separators=(',', ':')) + '\n')
            fh.write(f'version={version()}\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
