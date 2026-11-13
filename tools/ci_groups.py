"""How the public test files are split over parallel jobs on GitHub (task 0008).

    python3 tools/ci_groups.py          the groups, with the minutes each is expected to take

Every `tests/test_*.py` goes into one of GROUPS groups, balanced by its seconds (longest first, each into the lightest
group): what GitHub measured (`ci.files` in tools/ci_times.json, the slowest of the last three green runs – written by
`python3 tools/ci_status.py --record`), else the time measured in a chat on the made-up house (`files[…].made_up`), else
NEW_FILE_SECS. So a new test file is never left out.
"""
from __future__ import annotations

import glob
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TIMES = os.path.join(ROOT, 'tools', 'ci_times.json')
GROUPS = 10                 # ~98 min of tests one after the other (made-up house, 12 Nov) → ~10 min a group
NEW_FILE_SECS = 120.0


def load_times(path: str = TIMES) -> dict:
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def test_files(root: str = ROOT) -> list[str]:
    return sorted(os.path.relpath(p, root).replace(os.sep, '/') for p in glob.glob(os.path.join(root, 'tests', 'test_*.py')))


def file_secs(times: dict, path: str) -> float:
    name = os.path.basename(path)
    ci = times.get('ci', {}).get('files', {})
    if name in ci:
        return float(ci[name])
    f = times.get('files', {}).get(name, {})
    return float(f.get('made_up', {}).get('seconds') or f.get('seconds') or NEW_FILE_SECS)


def groups(files: list[str], times: dict, n: int = GROUPS) -> list[dict]:
    """[{'name': '1', 'files': [...], 'secs': …}] – every file in exactly one group; the same split on every machine."""
    out = [{'name': str(i + 1), 'files': [], 'secs': 0.0} for i in range(n)]
    for f in sorted(files, key=lambda f: (-file_secs(times, f), f)):
        g = min(out, key=lambda g: (g['secs'], int(g['name'])))
        g['files'].append(f)
        g['secs'] += file_secs(times, f)
    for g in out:
        g['files'].sort()
    return [g for g in out if g['files']]


def matrix(times: dict | None = None, root: str = ROOT) -> list[dict]:
    times = load_times() if times is None else times
    return [{'name': g['name'], 'files': ' '.join(g['files']), 'minutes': round(g['secs'] / 60, 1)}
            for g in groups(test_files(root), times)]


def main() -> int:
    m = matrix()
    for g in m:
        print(f"group {g['name']}: ~{g['minutes']} min: {g['files']}")
    print(f"{sum(len(g['files'].split()) for g in m)} files in {len(m)} groups")
    return 0


if __name__ == '__main__':
    sys.exit(main())
