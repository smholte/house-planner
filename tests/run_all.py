"""Run every test in this folder (the app must be served at HP_URL, default http://localhost:8765/index.html), and the
private tests of the owner's house in house/tests/ when that folder is there (task 0007b).

    python3 tests/run_all.py              the public tests, then the private ones (when house/tests/ is there)
    python3 tests/run_all.py --public     only the public tests (they run on the made-up house and on the owner's)
    python3 tests/run_all.py --private    only the private tests (the owner's build only: python3 build.py)
"""
import glob, os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
private = os.path.join(os.path.dirname(here), 'house', 'tests')
args = sys.argv[1:]
files = []
if '--private' not in args: files += sorted(glob.glob(os.path.join(here, 'test_*.py')))
if '--public' not in args: files += sorted(glob.glob(os.path.join(private, 'test_*.py')))
failed = []
for f in files:
    print('\n=====', os.path.relpath(f, os.path.dirname(here)), flush=True)
    r = subprocess.run([sys.executable, f], cwd=os.path.dirname(f))
    if r.returncode: failed.append(os.path.basename(f))
print('\nALL PASSED' if not failed else '\nFAILED: ' + ', '.join(failed))
sys.exit(1 if failed else 0)
