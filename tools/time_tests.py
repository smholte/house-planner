"""Run test files once and write the time of each to tools/ci_times.json (pass/fail included), with the total of each
set (task 0007b): public (tests/: runs on the made-up house and on the owner's) and private (house/tests/: the owner's
house only, his build).

    python3 tools/time_tests.py                      every test file, against the app served at HP_URL
    python3 tools/time_tests.py test_doors test_web  only these (the others keep their times)
    python3 tools/time_tests.py --house made-up ...  write the times under "made_up" (the public app's example)
"""
import glob, json, os, subprocess, sys, time
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(root, 'tools', 'ci_times.json')

# the two sets (task 0007b): the private tests are the ones in house/tests/
PUBLIC_DIR = os.path.join(root, 'tests')
PRIVATE_DIR = os.path.join(root, 'house', 'tests')
def set_of(name):
    return 'private' if os.path.exists(os.path.join(PRIVATE_DIR, name if name.endswith('.py') else name + '.py')) else 'public'
def path_of(name):
    p = os.path.join(PRIVATE_DIR, name)
    return p if os.path.exists(p) else os.path.join(PUBLIC_DIR, name)

def totals(files):
    out = {}
    for n, v in files.items():
        s = out.setdefault(v.get('set', set_of(n)), {'files': 0, 'seconds': 0.0, 'made_up_seconds': 0.0})
        s['files'] += 1; s['seconds'] = round(s['seconds'] + v.get('seconds', 0), 1)
        if 'made_up' in v: s['made_up_seconds'] = round(s['made_up_seconds'] + v['made_up']['seconds'], 1)
    return out

def save(data):
    for n, v in data['files'].items(): v['set'] = set_of(n)
    data['total_seconds'] = round(sum(v.get('seconds', 0) for v in data['files'].values()), 1)
    data['sets'] = totals(data['files'])
    json.dump(data, open(OUT, 'w'), indent=1)

if __name__ == '__main__':
    args = sys.argv[1:]
    made_up = '--house' in args and args[args.index('--house') + 1] == 'made-up'
    if '--house' in args: i = args.index('--house'); del args[i:i + 2]
    data = json.load(open(OUT)) if os.path.exists(OUT) else {'files': {}}
    names = [a if a.endswith('.py') else a + '.py' for a in args] or sorted(os.path.basename(f) for f in glob.glob(os.path.join(PUBLIC_DIR, 'test_*.py')) + glob.glob(os.path.join(PRIVATE_DIR, 'test_*.py')))
    # (a file that is gone – moved or split by a task – leaves the list)
    for n in [n for n in data['files'] if not os.path.exists(path_of(n))]: del data['files'][n]
    for n in names:
        t = time.time()
        r = subprocess.run([sys.executable, path_of(n)], cwd=os.path.dirname(path_of(n)), capture_output=True, text=True)
        res = {'seconds': round(time.time() - t, 1), 'ok': r.returncode == 0}
        if r.returncode: res['tail'] = (r.stdout + r.stderr)[-600:]
        e = data['files'].setdefault(n, {})
        if made_up: e['made_up'] = res
        else: e.update(res); e.pop('tail', None) if res['ok'] else None
        print(n, res['seconds'], 'ok' if r.returncode == 0 else 'FAIL', flush=True)
        save(data)
