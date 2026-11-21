"""Run some test files one after the other, as a GitHub test job does (task 0008).

    python3 tools/ci_run.py tests/test_web.py tests/test_pdf.py

Each file runs in its own process (in its own folder, like tests/run_all.py) with a time limit. Prints each file's
result, seconds and checks, then the lines `CI_FILE_SECS {…}` and `CI_FILE_CHECKS {…}` that `tools/ci_status.py
--record` / `--record-checks` read from the job's log, and writes a small table to the GitHub job summary when there is
one. Exit code 1 when a file failed – also when it ended without its count of checks, or passed fewer checks than its
number in tools/ci_checks.json (task 0047, tools/ci_checks.py).
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ci_checks  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LIMIT = 30 * 60                     # one file: 30 min at most (the slowest takes ~4 min here)


def main(files: list[str]) -> int:
    secs, failed, counts, rows = {}, [], {}, []
    record = ci_checks.load(ci_checks.PUBLIC_RECORD)
    for f in files:
        path = os.path.join(ROOT, f)
        n = os.path.basename(f)
        print(f'\n::group::{f}', flush=True)
        t = time.time()
        code, c = ci_checks.run_file(path, timeout=LIMIT)
        secs[n] = round(time.time() - t, 1)
        print('::endgroup::', flush=True)
        if c is not None:
            counts[n] = int(c.get('passed', 0))
        ok, note = ci_checks.judge(n, code, c, record)
        rows.append((n, ok, secs[n], note))
        print(f"{'ok  ' if ok else 'FAIL'} {f} ({secs[n]:.0f} s): {note}", flush=True)
        if not ok:
            failed.append(f)
            print(f'::error title={n} failed::{f}: {note} – its FAIL lines are in the group above')
        elif 'raise it' in note:
            print(f'::notice title={n}::{note} in tools/ci_checks.json')
    print('CI_FILE_SECS ' + json.dumps(secs), flush=True)
    print('CI_FILE_CHECKS ' + json.dumps(counts), flush=True)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as fh:
            fh.write(ci_checks.summary_table(rows))
    print('\nALL PASSED' if not failed else '\nFAILED: ' + ', '.join(failed))
    return 1 if failed else 0


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] for a in a.split()]
    sys.exit(main(args) if args else 0)
