"""Run some test files one after the other, as a GitHub test job does (task 0008).

    python3 tools/ci_run.py tests/test_web.py tests/test_pdf.py

Each file runs in its own process (in its own folder, like tests/run_all.py) with a time limit. Prints each file's
result and seconds, then one line `CI_FILE_SECS {…}` that `tools/ci_status.py --record` reads from the job's log, and
writes a small table to the GitHub job summary when there is one. Exit code 1 when a file failed.
"""
import json
import os
import subprocess
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LIMIT = 30 * 60                     # one file: 30 min at most (the slowest takes ~4 min here)


def main(files: list[str]) -> int:
    secs, failed = {}, []
    for f in files:
        path = os.path.join(ROOT, f)
        print(f'\n::group::{f}', flush=True)
        t = time.time()
        try:
            r = subprocess.run([sys.executable, path], cwd=os.path.dirname(path), timeout=LIMIT)
            code = r.returncode
        except subprocess.TimeoutExpired:
            print(f'TIMEOUT after {LIMIT // 60} min')
            code = 'timeout'
        secs[os.path.basename(f)] = round(time.time() - t, 1)
        print('::endgroup::', flush=True)
        ok = code == 0
        print(f"{'ok  ' if ok else 'FAIL'} {f} ({secs[os.path.basename(f)]:.0f} s)", flush=True)
        if not ok:
            failed.append(f)
            print(f'::error title={os.path.basename(f)} failed::{f} failed (exit {code}) – its FAIL lines are in the group above')
    print('CI_FILE_SECS ' + json.dumps(secs), flush=True)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as fh:
            fh.write('| Test file | Result | Seconds |\n| --- | --- | --- |\n')
            for f in files:
                n = os.path.basename(f)
                fh.write(f"| {n} | {'FAILED' if f in failed else 'ok'} | {secs[n]:.0f} |\n")
    print('\nALL PASSED' if not failed else '\nFAILED: ' + ', '.join(failed))
    return 1 if failed else 0


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] for a in a.split()]
    sys.exit(main(args) if args else 0)
