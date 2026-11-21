"""Check counts (task 0047, as Fresing Render's MIN_CHECKS): a test file cannot quietly check less.

Every test file prints one fixed last line with its count (tests/common.py does it when the file ends, however it ends):

    CI_CHECKS {"passed": 41, "failed": 0}

`run_file` runs one test file, shows its output as it comes and reads that line; `judge` says what is wrong with it:
  - it ended without the line (a crash, os._exit, killed),
  - a check failed (also when the file forgot to exit with an error code – test_phone_taps.py, test_plan_floor_start.py),
  - it passed fewer checks than its number in the record (tools/ci_checks.json public, house/tests/checks.json private).
More checks than the record: fine (the run says so: raise the number). A file with no number yet: fails (a new test
file adds its number in the same commit), unless the record says "seeding": true.

Lowering a number is allowed only together with a reason in a commit message of the push (`lowered`):
    Fewer checks: test_x.py – the old IFC check moved to test_ifc.py
`python3 tools/ci_status.py --run <green run> --record-checks` writes the counts of a green run into the record.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time

TOOLS = os.path.dirname(os.path.abspath(__file__))
PUBLIC_RECORD = os.path.join(TOOLS, 'ci_checks.json')
LINE = 'CI_CHECKS '
REASON = re.compile(r'^\s*Fewer checks:\s*(test_[\w.]+?\.py)\b\s*[–:-]?\s*(\S.*)$', re.M | re.I)


def load(path: str) -> dict:
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save(path: str, rec: dict) -> None:
    rec['files'] = dict(sorted(rec.get('files', {}).items()))
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(rec, fh, indent=1)
        fh.write('\n')


def run_file(path: str, env: dict | None = None, timeout: int = 30 * 60, echo: bool = True) -> tuple[object, dict | None]:
    """(exit code or 'timeout', {'passed', 'failed'} from the file's CI_CHECKS line or None). The output is shown live."""
    counts = None
    pr = subprocess.Popen([sys.executable, path], cwd=os.path.dirname(path), env=env, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace', bufsize=1)
    end = time.time() + timeout
    try:
        for line in pr.stdout:
            if echo:
                sys.stdout.write(line)
            if line.startswith(LINE):
                try:
                    counts = json.loads(line[len(LINE):])
                except ValueError:
                    pass
            if time.time() > end:
                raise subprocess.TimeoutExpired(path, timeout)
        code = pr.wait(timeout=max(1, end - time.time()))
    except subprocess.TimeoutExpired:
        pr.kill()
        pr.wait()
        print(f'TIMEOUT after {timeout // 60} min')
        return 'timeout', counts
    sys.stdout.flush()
    return code, counts


def judge(name: str, code, counts: dict | None, record: dict) -> tuple[bool, str]:
    """(ok, a plain note): the file's exit code, its count line and its number in the record"""
    need = record.get('files', {}).get(name)
    seeding = bool(record.get('seeding'))
    if code != 0:
        return False, f'exit {code}'
    if counts is None:
        return False, 'ended without its count of checks (the CI_CHECKS line): it stopped early or does not use common.py'
    p, f = int(counts.get('passed', 0)), int(counts.get('failed', 0))
    if f:
        return False, f'{f} check(s) failed, but the file ended without an error code'
    if need is None:
        if seeding:
            return True, f'{p} checks (no number recorded yet: seeding)'
        return False, f'{p} checks, but it has no number in the record: add "{name}": {p} to it'
    if p < need:
        if seeding:
            return True, f'{p} checks, fewer than its {need} (seeding: not judged)'
        return False, (f'only {p} checks passed, its record is {need}: a check was skipped or the file stopped early. '
                       f'If fewer is right, lower the number and say why in the commit message ("Fewer checks: {name} – why")')
    if p > need:
        return True, f'{p} checks (record {need}: raise it)'
    return True, f'{p} checks'


def lowered(old: dict, new: dict) -> list[tuple[str, int, int]]:
    """the files whose number went down (or was dropped while the file is still listed elsewhere)"""
    out = []
    for name, n in (old.get('files') or {}).items():
        m = (new.get('files') or {}).get(name)
        if m is not None and m < n:
            out.append((name, n, m))
    return out


def reasons(messages: list[str]) -> dict:
    out = {}
    for msg in messages:
        for m in REASON.finditer(msg or ''):
            out[m.group(1)] = m.group(2).strip()
    return out


def gh_json(path: str):
    r = subprocess.run(['gh', 'api', path], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return json.loads(r.stdout)


def check_lowered(repo: str, record_path: str, new: dict, sha: str, ref: str, before: str) -> list[str]:
    """On GitHub: the numbers this push lowers (against main, or – a push to main – the commit before it) each need a
    reason line in a commit message of the push. [] when none was lowered or each has its reason."""
    import base64
    base = 'main' if ref != 'refs/heads/main' else before
    if not repo or not sha or not base or set(base) == {'0'}:
        return []
    try:
        raw = gh_json(f'repos/{repo}/contents/{record_path}?ref={base}')
        old = json.loads(base64.b64decode(raw['content']).decode('utf-8'))
    except (RuntimeError, KeyError, ValueError):
        return []                                    # no record on the base yet (the first one): nothing to compare
    down = lowered(old, new)
    if not down:
        return []
    try:
        msgs = [c['commit']['message'] for c in gh_json(f'repos/{repo}/compare/{base}...{sha}').get('commits', [])]
    except RuntimeError:
        msgs = []
    why = reasons(msgs)
    return [f'{record_path}: {n}: {a} → {b} checks without a reason – write "Fewer checks: {n} – why" in the commit message'
            for n, a, b in down if n not in why]


def summary_table(rows: list[tuple[str, bool, float, str]]) -> str:
    out = '| Test file | Result | Seconds | Checks |\n| --- | --- | --- | --- |\n'
    for n, ok, secs, note in rows:
        out += f"| {n} | {'ok' if ok else 'FAILED'} | {secs:.0f} | {note} |\n"
    return out
