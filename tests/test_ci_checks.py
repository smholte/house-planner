"""Task 0047 – the test machinery itself: the check counts (tools/ci_checks.py) and the guard over the app's actions
(tools/ui_inventory.py). No browser: a copy of the repository's src/ and tests/ in a temporary folder, changed the way a
task would change them.

    python3 tests/test_ci_checks.py
"""
import json, os, shutil, subprocess, sys, tempfile
from common import *

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import ci_checks, ui_inventory  # noqa: E402

# ── check counts ──
rec = {'files': {'test_a.py': 10}}
check('counts: the same number passes', ci_checks.judge('test_a.py', 0, {'passed': 10, 'failed': 0}, rec)[0])
ok, note = ci_checks.judge('test_a.py', 0, {'passed': 12, 'failed': 0}, rec)
check('counts: more passes and says "raise it"', ok and 'raise it' in note, note)
ok, note = ci_checks.judge('test_a.py', 0, {'passed': 9, 'failed': 0}, rec)
check('counts: one check fewer fails, with the way out (lower it with a reason)', not ok and 'Fewer checks: test_a.py' in note, note)
check('counts: a failed check fails although the exit code was 0', not ci_checks.judge('test_a.py', 0, {'passed': 10, 'failed': 1}, rec)[0])
check('counts: no count line (stopped early) fails', not ci_checks.judge('test_a.py', 0, None, rec)[0])
check('counts: an error code fails', not ci_checks.judge('test_a.py', 1, {'passed': 10, 'failed': 0}, rec)[0])
check('counts: a file without a number fails …', not ci_checks.judge('test_new.py', 0, {'passed': 3, 'failed': 0}, rec)[0])
check('… unless the record is seeding', ci_checks.judge('test_new.py', 0, {'passed': 3, 'failed': 0}, {'files': {}, 'seeding': True})[0])
check('counts: a lowered number is found', ci_checks.lowered({'files': {'test_a.py': 10, 'test_b.py': 4}}, {'files': {'test_a.py': 8, 'test_b.py': 5}}) == [('test_a.py', 10, 8)])
check('counts: the reason line is read from a commit message',
      ci_checks.reasons(['Task 9: tidy\n\nFewer checks: test_a.py – two checks moved to test_c.py\n']) == {'test_a.py': 'two checks moved to test_c.py'})

# a real file run the way ci_run.py runs it: its count line comes through, also when it crashes half-way
tmp = tempfile.mkdtemp()
for name, body in (('test_ok.py', "check('one', True)\ncheck('two', True)\nsys.exit(summary())\n"),
                   ('test_crash.py', "check('one', True)\nraise SystemExit(3)\n"),
                   ('test_noexit.py', "check('one', True)\ncheck('two', False)\nsummary()\n")):
    open(os.path.join(tmp, name), 'w').write(f"import sys\nsys.path.insert(0, {os.path.dirname(os.path.abspath(__file__))!r})\nfrom common import *\n" + body)
open(os.path.join(tmp, 'test_hang.py'), 'w').write("import time\nprint('PASS before the hang', flush=True)\ntime.sleep(60)\n")
t0 = __import__('time').time(); hang = ci_checks.run_file(os.path.join(tmp, 'test_hang.py'), timeout=3, echo=False)
check('a test file that hangs without printing: stopped at its time limit, judged failed', hang == ('timeout', None) and __import__('time').time() - t0 < 20
      and not ci_checks.judge('test_hang.py', *hang, {'files': {'test_hang.py': 1}})[0], hang)
res = {n: ci_checks.run_file(os.path.join(tmp, n), timeout=120, echo=False) for n in ('test_ok.py', 'test_crash.py', 'test_noexit.py')}
check('a test file: its CI_CHECKS line is read', res['test_ok.py'] == (0, {'passed': 2, 'failed': 0}), res['test_ok.py'])
check('a test file that stops half-way: the count of what ran, and its exit code', res['test_crash.py'] == (3, {'passed': 1, 'failed': 0}), res['test_crash.py'])
check('a test file that forgot sys.exit(summary()): judged failed by its count', not ci_checks.judge('test_noexit.py', *res['test_noexit.py'], {'files': {'test_noexit.py': 1}})[0], res['test_noexit.py'])
shutil.rmtree(tmp, ignore_errors=True)

# ── the guard over the app's actions ──
copy = tempfile.mkdtemp()
for d in ('src', 'tests'):
    shutil.copytree(os.path.join(ROOT, d), os.path.join(copy, d), ignore=shutil.ignore_patterns('shots', '__pycache__', 'fixtures', 'house-scene-format', 'toolbox', 'test_ci_checks.py'))
bad = ui_inventory.check(copy)
check('guard: the repository as it is passes', bad == [], bad[:3])
acts, _ = ui_inventory.scan(copy)
check('guard: the scan finds the top bar, the tool rail and the ⋯ entries', {'#btn-menu', '#btn-share', '#mi-export', 'menu:Undo history'} <= set(acts), len(acts))
APP = os.path.join(copy, 'src', 'app.js')
src = open(APP, encoding='utf-8').read()
open(APP, 'w', encoding='utf-8').write(src + "\nconst __x = () => h('button', { class: 'btn', id: 'btn-zz-new', onclick: () => 1 }, t('Zz new'));\n")
bad = ui_inventory.check(copy)
check('guard: a new button with no test fails, with a plain message', len(bad) == 1 and '#btn-zz-new' in bad[0] and 'has no test' in bad[0], bad)
open(os.path.join(copy, 'tests', 'test_zz.py'), 'w').write("pg.click('#btn-zz-new')\n")
check('guard: … a test that presses it lets it pass', ui_inventory.check(copy) == [])
os.remove(os.path.join(copy, 'tests', 'test_zz.py'))
open(os.path.join(copy, 'tests', 'test_zz.py'), 'w').write("# covers: #btn-zz-new\n")
check('guard: … so does a "# covers:" comment in a test', ui_inventory.check(copy) == [])
os.remove(os.path.join(copy, 'tests', 'test_zz.py'))
feats = json.load(open(os.path.join(copy, 'tests', 'features.json'), encoding='utf-8'))
feats['not_yet_tested']['#btn-zz-new'] = {'lane': 'Shared (app, panels, ui)', 'size': 'S', 'task': ''}
json.dump(feats, open(os.path.join(copy, 'tests', 'features.json'), 'w', encoding='utf-8'))
bad = ui_inventory.check(copy)
check('guard: on not_yet_tested without a task number: fails', len(bad) == 1 and 'task number' in bad[0], bad)
feats['not_yet_tested']['#btn-zz-new']['task'] = '0099'
json.dump(feats, open(os.path.join(copy, 'tests', 'features.json'), 'w', encoding='utf-8'))
check('guard: … with a task number: passes', ui_inventory.check(copy) == [])
open(os.path.join(copy, 'tests', 'test_zz.py'), 'w').write("pg.click('#btn-zz-new')\n")
bad = ui_inventory.check(copy)
check('guard: a listed gap that gets a test must leave the list (it only shrinks)', len(bad) == 1 and 'take it off' in bad[0], bad)
open(APP, 'w', encoding='utf-8').write(src)
os.remove(os.path.join(copy, 'tests', 'test_zz.py'))
bad = ui_inventory.check(copy)
check('guard: a listed gap that left the app must leave the list', len(bad) == 1 and 'no longer in the app' in bad[0], bad)
# a menu entry, found by its English text (its i18n key) and pressed by it
open(APP, 'w', encoding='utf-8').write(src + "\nconst __y = (a) => UI.menu(a, [{ label: t('Zz entry…'), icon: 'eye', fn: () => 1 }]);\n")
json.dump(json.load(open(os.path.join(ROOT, 'tests', 'features.json'), encoding='utf-8')), open(os.path.join(copy, 'tests', 'features.json'), 'w', encoding='utf-8'))
bad = ui_inventory.check(copy)
check('guard: a new menu entry with no test fails (menu:<its text>)', len(bad) == 1 and 'menu:Zz entry…' in bad[0], bad)
open(os.path.join(copy, 'tests', 'test_zz.py'), 'w').write("pg.click('.menu .mi:has-text(\"Zz entry\")')\n")
check('guard: … pressed by its text: passes', ui_inventory.check(copy) == [])
shutil.rmtree(copy, ignore_errors=True)

# the precheck runs the guard and the counts (no browser, a few seconds)
r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'ci_precheck.py')], capture_output=True, text=True, cwd=ROOT)
check('the precheck passes on this commit (its checks: groups, counts, features)', 'FAIL' not in r.stdout, (r.stdout + r.stderr)[-800:])
sys.exit(summary())
