"""Send to Fresing Render through the Toolbox folder (task 0042), toolbox format pinned at tag v0.1 (tests/toolbox/).
Playwright cannot press the folder picker: the Toolbox folder is a folder "Toolbox" in the browser's private file
system, filled from the tag's samples and handed to the app (app.tbUseRoot – what the picker's folder goes through).
Fresing Render is played by the tag's own Python reference code (tbf/folder.py) on a copy of that folder.
1. the app's toolbox-folder.js is the tag's, its type list the tag's types.json; build: .hpbake in file_handlers;
2. PC light: a wrong folder → a plain message, nothing written; the right one → our manifest (checked by check.py);
   Send from the dialog → a job like the sample's (checked), the line in the dialog, the bar after it closes, Stop →
   cancel.json (checked), "stopped"; a second send → Fresing Render bakes and replies → imported, both jobs deleted;
   a bake for another house of this copy waits (status waiting, checked) and is taken in when that house opens; bad
   replies (wrong type, wrong size, version 0.2) → failed with a code and a clear text, no import; two windows → one
   reads the inbox; a .hpbake opened by the installed app (tbOpenBakeFile, what launchQueue hands on);
3. phone dark and a browser without showDirectoryPicker: no Send button, nothing under the top bar."""
from common import *
import base64, json, shutil, sys, tempfile, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
TBF = HERE / 'toolbox'
sys.path.insert(0, str(TBF))
sys.path.insert(0, str(HERE))
from tbf import folder as F  # noqa: E402
from tbf.check import check as tb_check, read_doc, Report  # noqa: E402
from hpbake_maker import make_bake  # noqa: E402

ME, RENDER = 'nl.fresing.house-planner', 'nl.fresing.render'
SAMPLES = TBF / 'samples' / 'Toolbox'
ROOT = HERE.parent

OPFS = """
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
// the folder kept on this device: on GitHub's test machine the page closed when a handle of the private file system
// was read back from IndexedDB (ToolboxFolder.remembered). Here "kept" is a flag, and the handle is fetched again.
Object.defineProperty(window, 'ToolboxFolder', { configurable: true, get() { return this.__tf; }, set(v) {
  v.remember = async root => { localStorage.setItem('__tb_root', root.name); };
  v.forget = async () => { localStorage.removeItem('__tb_root'); };
  v.remembered = async () => { const n = localStorage.getItem('__tb_root'); return n ? (await navigator.storage.getDirectory()).getDirectoryHandle(n) : null; };
  this.__tf = v; } });
window.__opfs = {
  async top() { return navigator.storage.getDirectory(); },
  async dir(path, create = true) { let d = await this.top(); for (const p of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create }); return d; },
  async reset() { const top = await this.top(); for await (const [name] of top.entries()) await top.removeEntry(name, { recursive: true }); },
  async put(tree) {
    for (const [path, data] of Object.entries(tree)) {
      const parts = path.split('/'), d = await this.dir(parts.slice(0, -1).join('/'));
      const w = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable(); await w.write(unb64(data)); await w.close();
    }
  },
  async rm(paths) { for (const path of paths) { const parts = path.split('/'); try { const d = await this.dir(parts.slice(0, -1).join('/'), false); await d.removeEntry(parts.at(-1), { recursive: true }); } catch (e) { /* gone */ } } },
  async dump(top = 'Toolbox') {
    const out = { files: {}, dirs: [] };
    const walk = async (d, pre) => { for await (const [name, hd] of d.entries()) { if (hd.kind === 'directory') { out.dirs.push(pre + name); await walk(hd, pre + name + '/'); } else out.files[pre + name] = b64(new Uint8Array(await (await hd.getFile()).arrayBuffer())); } };
    try { await walk(await this.dir(top, false), top + '/'); } catch (e) { /* none */ }
    return out;
  },
};"""


def b64(data):
    return base64.b64encode(data).decode()


def tree(folder, prefix='Toolbox'):
    return {f'{prefix}/{p.relative_to(folder).as_posix()}': b64(p.read_bytes()) for p in sorted(folder.rglob('*')) if p.is_file()}


def dump(pg, tmp):
    """the private file system's Toolbox folder → tmp/Toolbox (fresh)"""
    d = pg.evaluate("() => window.__opfs.dump()")
    box = Path(tmp) / 'Toolbox'
    if box.exists():
        shutil.rmtree(box)
    box.mkdir(parents=True)
    for path in d['dirs']:
        (Path(tmp) / path).mkdir(parents=True, exist_ok=True)
    for path, data in d['files'].items():
        (Path(tmp) / path).write_bytes(base64.b64decode(data))
    return box


def sync(pg, box):
    """what Python changed in tmp/Toolbox → back into the private file system, without making the folder anew"""
    d = pg.evaluate("() => window.__opfs.dump()")
    now = tree(box)
    put = {k: v for k, v in now.items() if d['files'].get(k) != v}
    have_dirs = {f'Toolbox/{p.relative_to(box).as_posix()}' for p in box.rglob('*') if p.is_dir()}
    gone = [k for k in d['files'] if k not in now and not any(k.startswith(x + '/') for x in d['dirs'] if x not in have_dirs)]
    gone += [x for x in d['dirs'] if x not in have_dirs and not any(x.startswith(y + '/') for y in d['dirs'] if y not in have_dirs and y != x)]
    pg.evaluate("async ([t, g]) => { await window.__opfs.put(t); await window.__opfs.rm(g); }", [put, gone])


def start_folder(pg, alive=False):
    """a Toolbox folder as Fresing Render leaves it at its first start: the mark, its manifest (and alive.json)"""
    pg.evaluate("() => window.__opfs.reset()")
    t = {'Toolbox/toolbox-folder.json': b64((SAMPLES / 'toolbox-folder.json').read_bytes()),
         'Toolbox/tools/nl.fresing.render/toolbox.json': b64((SAMPLES / 'tools' / RENDER / 'toolbox.json').read_bytes())}
    pg.evaluate("t => window.__opfs.put(t)", t)
    pg.evaluate("() => window.__opfs.dir('Toolbox/tools/nl.fresing.render/inbox')")


def connect(pg, name='Toolbox'):
    return pg.evaluate("async n => { const r = await window.__opfs.dir(n, false); const box = await window.__hp.app.tbUseRoot(r); return !!box; }", name)


def ok_report(rep, label, warn_ok=False):
    check(f'{label}: check.py (v0.1) finds no error', not rep.errors, rep.errors[:5])
    if not warn_ok:
        check(f'{label}: … and no warning', not rep.warnings, rep.warnings[:5])


def inbox_jobs(box, tool):
    d = box / 'tools' / tool / 'inbox'
    return sorted(p.name for p in d.iterdir() if p.is_dir()) if d.exists() else []


def quick_opts(pg):
    """a light export for the tests: the house only, one moment"""
    return pg.evaluate("""() => { const d = window.__hp.app.hpsceneDefaults(); d.groups = ['house']; d.moments = ['afternoon'];
      d.seasons.winter.on = false; d.open = false; d.cameras = []; d.pageSize = 1024; return d; }""")


def send(pg, o):
    return pg.evaluate("async o => window.__hp.app.tbSend(o, null)", o)


def tick(pg):
    pg.evaluate("async () => { const a = window.__hp.app; a._tb.cleaned = Date.now(); await a.tbTick(true); }")


def answer(pg, tmp, job_id, bake=True, scene_tweak=None):
    """Fresing Render (the tag's Python): take the job, bake it (hpbake_maker), reply; back into the browser"""
    box = dump(pg, tmp)
    me = F.read_tool(box, RENDER)
    doc, files = F.take(box, me, box / 'tools' / RENDER / 'inbox' / job_id)
    F.claim(box, RENDER, job_id, 'working', fraction=0.5, text='Baking summer noon (1 of 1)')
    reply = None
    if bake:
        scene = files[0][2].read_bytes()
        out = Path(tmp) / 'house.hpbake'
        out.write_bytes(make_bake(scene, snow=False, open_storeys=False))
        reply = F.send_reply(box, me, doc, [out], text='Baked')
    sync(pg, box)
    return box, reply


# ───────────────────────────────── 1. the pinned copies and the build
def files_test():
    src = (ROOT / 'src' / 'toolbox-folder.js').read_text(encoding='utf-8')
    first, rest = src.split('\n', 1)
    check('src/toolbox-folder.js: its first line names the tag and commit', 'tag v0.1' in first and 'aa75e85' in first, first)
    check('… and the rest is the tag\'s web/toolbox-folder.js byte for byte', rest == (TBF / 'web' / 'toolbox-folder.js').read_text(encoding='utf-8'))
    check('… with its MIT notice (tests/toolbox/LICENSE)', 'MIT' in (TBF / 'LICENSE').read_text())
    types = json.loads((TBF / 'types.json').read_text())['types']
    block = rest.split('/* TYPES-BEGIN */')[1].split('/* TYPES-END */')[0]
    js_types = json.loads(block.split('const TYPES =', 1)[1].strip().rstrip(';'))
    check('the type list in the app is the tag\'s types.json (the hpbake rule from it)', js_types == types)
    man = json.loads((ROOT / 'dist' / 'house-planner-app' / 'manifest.webmanifest').read_text())
    hb = [fh for fh in man.get('file_handlers', []) if any('.hpbake' in v for v in fh['accept'].values())]
    check('the web app manifest: .hpbake in file_handlers (double-click in the installed app)', len(hb) == 1, man.get('file_handlers'))
    check('… the .json handler stays', any('.json' in v for fh in man['file_handlers'] for v in fh['accept'].values()))
    check('the samples of the tag pass its own checker here', tb_check(SAMPLES).ok)


# ───────────────────────────────── 2. the PC
def full_chromium(p):
    """open_app with the full Chromium (new headless mode): GitHub's headless shell closed the page when a folder
    handle kept in IndexedDB was read back (ToolboxFolder.remembered)"""
    launch = p.chromium.launch
    p.chromium.launch = lambda **k: launch(channel='chromium', **k)
    try:
        return open_app(p, theme='light', init=[])
    finally:
        p.chromium.launch = launch


def pc_test(p, tmp):
    b, pg = full_chromium(p)
    pg.add_init_script(OPFS)
    pg.reload(); pg.wait_for_timeout(800)
    open_example(pg)
    pg.wait_for_function("() => window.__hp.app._tb && window.__hp.app._tb.inited", timeout=20000)
    check('PC: the Toolbox folder can be used (Chrome, a mouse)', pg.evaluate("() => window.__hp.app.tbAvailable()"))

    # the dialog before connecting
    pg.evaluate("() => { window.__hp.app.hpsceneDialog(); }")
    pg.wait_for_selector('.hps-dialog')
    dlg = pg.inner_text('.dialog')
    check('PC: the export dialog has "Send to Fresing Render"', 'Send to Fresing Render' in dlg, dlg[-300:])
    check('… and "Connect to Fresing Render…" (not connected yet)', pg.locator('#tb-connect-btn').count() == 1)
    pg.locator('.dialog').screenshot(path=SHOTS + 'toolbox-dialog-pc-light.png')
    pg.keyboard.press('Escape')

    # a wrong folder: a plain message, nothing written
    pg.evaluate("() => window.__opfs.reset()")
    pg.evaluate("() => window.__opfs.dir('Documents')")
    pg.evaluate("async () => { const r = await window.__opfs.dir('Documents', false); window.__wrong = window.__hp.app.tbUseRoot(r); }")
    pg.wait_for_selector('#tb-wrong')
    msg = pg.inner_text('#tb-wrong')
    check('a folder without toolbox-folder.json: "This is not the Toolbox folder", what to do', 'not the Toolbox folder' in msg and 'Fresing Render' in msg and 'Toolbox' in msg, msg)
    pg.click('.dialog .btn.primary')
    left = pg.evaluate("() => window.__opfs.dump('Documents')")
    check('… and nothing was written there', not left['files'] and not left['dirs'], left)
    check('… and it is not kept as the folder', pg.evaluate("async () => !(await ToolboxFolder.remembered()) && !window.__hp.app._tb.root"))

    # the right folder: our manifest
    start_folder(pg)
    check('the Toolbox folder is taken (toolbox-folder.json there)', connect(pg))
    box = dump(pg, tmp)
    mf = box / 'tools' / ME / 'toolbox.json'
    check('our manifest is written: tools/nl.fresing.house-planner/toolbox.json', mf.exists())
    ok_report(tb_check(mf), 'our manifest')
    m = json.loads(mf.read_text())
    sm = json.loads((SAMPLES / 'tools' / ME / 'toolbox.json').read_text())
    check('… the sample\'s, with import-model left out (the app cannot take models yet)', [a['id'] for a in m['actions']] == ['import-bake'] and m['actions'][0] == sm['actions'][0]
          and {k: v for k, v in m.items() if k not in ('actions', 'app_version')} == {k: v for k, v in sm.items() if k not in ('actions', 'app_version')}, m)
    check('… app_version is the app\'s version', m['app_version'] == str(pg.evaluate("() => window.__hp.APP_VERSION.n")))
    check('… no alive.json from a page', not (box / 'tools' / ME / 'alive.json').exists())
    check('the folder is kept on this device', pg.evaluate("async () => !!(await ToolboxFolder.remembered())"))

    # job A: Send from the dialog
    pg.evaluate("() => { window.__hp.app.hpsceneDialog(); }")
    pg.wait_for_selector('.hps-dialog')
    check('connected: the dialog names the folder and offers Disconnect', pg.locator('#tb-disconnect').count() == 1 and 'Toolbox' in pg.inner_text('#tb-row'))
    for k in ('furniture', 'installs', 'ceilItems', 'garden', 'street', 'houses', 'park'):
        pg.evaluate("k => { const el = document.getElementById('hps-g-' + k); if (el && el.checked) el.click(); }", k)
    t0 = time.time()
    pg.click('.dialog .dlg-foot .btn.primary')
    pg.wait_for_function("() => /Sent\\./.test((document.getElementById('tb-dlg-line') || {}).textContent || '')", timeout=600000)
    sent_s = time.time() - t0
    line = pg.inner_text('#tb-dlg-line')
    check('Send: the dialog stays open and says it was sent; Fresing Render not open → "Open Fresing Render …"', 'Open Fresing Render' in line, line)
    box = dump(pg, tmp)
    jobs = inbox_jobs(box, RENDER)
    check('… one job in Fresing Render\'s inbox', len(jobs) == 1, jobs)
    ja = jobs[0]
    ok_report(tb_check(box), 'the Toolbox folder with the sent job')
    job = json.loads((box / 'tools' / RENDER / 'inbox' / ja / 'job.json').read_text())
    sj = json.loads((SAMPLES / 'tools' / RENDER / 'inbox' / '20261118-195100-9f3c2a' / 'job.json').read_text())
    same = lambda d: {k: v for k, v in d.items() if k not in ('job', 'created', 'files', 'title')}
    check('… like the sample\'s job (all but id, time, file name and size, title)', same(job) == same(sj) and set(job) == set(sj)
          and [f['type'] for f in job['files']] == [f['type'] for f in sj['files']], (job, sj))
    check('… the file is a house scene (.hpscene) of the stated size', job['files'][0]['name'].endswith('.hpscene') and (box / 'tools' / RENDER / 'inbox' / ja / job['files'][0]['name']).stat().st_size == job['files'][0]['size'])
    check('… the title names house and version', job['title'].startswith(pg.evaluate("() => window.__hp.app.project.name")))
    dev = pg.evaluate("async () => (await window.__hp.TbJobs.all()).map(j => [j.job, j.houseId, j.sceneId, j.state])")
    house_a = pg.evaluate("() => window.__hp.app.project.id")
    check('the device list keeps the job (house, scene) – not the house', any(d[0] == ja and d[1] == house_a and d[2] for d in dev)
          and not any('tb' in k.lower() for k in pg.evaluate("() => Object.keys(window.__hp.app.project)")), dev)

    # Fresing Render takes it and works: the line follows
    pg.evaluate("t => window.__opfs.put(t)", {f'Toolbox/tools/{RENDER}/alive.json': b64(json.dumps({'format': 'toolbox-alive', 'version': '0.1', 'seen': F.now()}).encode())})
    box = dump(pg, tmp)
    F.claim(box, RENDER, ja, 'working', fraction=0.4, text='Baking summer noon (3 of 8)')
    sync(pg, box)
    tick(pg)
    line = pg.inner_text('#tb-dlg-line')
    check('working: "Baking: Baking summer noon (3 of 8) (40 %)" in the dialog', 'summer noon (3 of 8)' in line and '40' in line, line)
    pg.locator('.dialog').screenshot(path=SHOTS + 'toolbox-sending-pc-light.png')
    pg.keyboard.press('Escape')
    pg.wait_for_selector('#tb-bar')
    bar = pg.inner_text('#tb-bar')
    check('the dialog closed: the bar under the top bar shows it, with Stop', 'summer noon' in bar and pg.locator('#tb-stop').count() == 1, bar)
    bb = pg.locator('#tb-bar').bounding_box(); tb = pg.locator('.topbar').bounding_box()
    check('… under the top bar, within the window', bb['y'] >= tb['y'] + tb['height'] - 2 and bb['x'] >= 0 and bb['x'] + bb['width'] <= 1280, (bb, tb))
    pg.locator('#tb-bar').screenshot(path=SHOTS + 'toolbox-bar-pc-light.png')
    pg.click('#tb-stop')
    pg.wait_for_timeout(500)
    box = dump(pg, tmp)
    cf = box / 'tools' / RENDER / 'inbox' / ja / 'cancel.json'
    check('Stop: cancel.json in the job', cf.exists())
    ok_report(tb_check(box / 'tools' / RENDER / 'inbox' / ja), 'the job with cancel.json')
    F.write_status(box, RENDER, ja, 'cancelled', text='Stopped')
    sync(pg, box)
    tick(pg)
    check('cancelled: "The bake was stopped."', 'stopped' in pg.inner_text('#tb-bar'), pg.inner_text('#tb-bar'))
    box = dump(pg, tmp)
    check('… and the finished job is cleared from Fresing Render\'s inbox (the sender may, 7.4)', ja not in inbox_jobs(box, RENDER))

    # job B: Fresing Render bakes and replies → imported, both jobs gone
    o = quick_opts(pg)
    check('a second send', send(pg, o))
    box = dump(pg, tmp)
    jb = inbox_jobs(box, RENDER)[0]
    box, reply = answer(pg, tmp, jb)
    ok_report(tb_check(box), 'the folder with Fresing Render\'s reply (written by the tag\'s Python)')
    tick(pg)
    pg.wait_for_function("() => { const v = window.__hp.app.shownVersion(); return v.bake && v.bake.json; }", timeout=600000)
    pg.wait_for_timeout(500)
    tick(pg)
    box = dump(pg, tmp)
    check('the reply is imported: the version has baked light', pg.evaluate("() => !!window.__hp.app.shownVersion().bake"))
    check('… the reply job is deleted from our inbox', reply not in inbox_jobs(box, ME), inbox_jobs(box, ME))
    check('… and the job it answers from Fresing Render\'s', jb not in inbox_jobs(box, RENDER), inbox_jobs(box, RENDER))
    st = pg.evaluate("async j => (await window.__hp.TbJobs.all()).find(x => x.job === j).state", jb)
    check('… the device list says imported; the bar "The baked light is in."', st == 'imported' and 'light is in' in pg.inner_text('#tb-bar'), (st, pg.inner_text('#tb-bar')))

    # job C: a bake for another house of this copy waits, and is taken in when that house opens
    send(pg, quick_opts(pg))
    box = dump(pg, tmp)
    jc = inbox_jobs(box, RENDER)[0]
    name_a = pg.evaluate("() => window.__hp.app.project.name")
    pg.evaluate("async () => { const p = window.__hp.newProject('Second house', ['Ground floor']); await window.__hp.DB.put('projects', p); await window.__hp.app.openProject(p.id); }")
    box, reply_c = answer(pg, tmp, jc)
    tick(pg)
    box = dump(pg, tmp)
    sf = box / 'tools' / ME / 'inbox' / reply_c / 'status.json'
    stc = json.loads(sf.read_text()) if sf.exists() else {}
    check('another house of this copy: status "waiting" with that house\'s name', stc.get('state') == 'waiting' and name_a in stc.get('text', ''), stc)
    rep = Report('status'); read_doc(sf, 'status-0', rep, 'status.json')
    check('… the status passes the checker', not rep.errors and sf.exists(), rep.errors)
    check('… nothing imported into the open house', not pg.evaluate("() => window.__hp.app.shownVersion().bake"))
    check('… the job is kept', reply_c in inbox_jobs(box, ME))
    pg.evaluate("id => window.__hp.app.openProject(id)", house_a)
    # the version has baked light already (job B): the owner is asked, as with Import bake
    pg.wait_for_selector('.dialog:has-text("Replace the baked light?")', timeout=600000)
    pg.click('.dialog .btn.primary')
    pg.wait_for_function("() => { const a = window.__hp.app; return a._tb && !a._tb.busy && a.project && a.shownVersion().bake && a.shownVersion().bake.scene === (a.project.hpScenes || []).slice(-1)[0].id; }", timeout=600000)
    pg.wait_for_timeout(500)
    box = dump(pg, tmp)
    check('… that house opened: its bake is taken in and both jobs are deleted', reply_c not in inbox_jobs(box, ME) and jc not in inbox_jobs(box, RENDER), (inbox_jobs(box, ME), inbox_jobs(box, RENDER)))

    # bad replies: refused with a code and a clear text, no import
    bake_id = pg.evaluate("() => window.__hp.app.shownVersion().bake.id")
    good = (Path(tmp) / 'house.hpbake').read_bytes()
    bads = {
        'wrong type': ('20261118-210000-aaaaa1', b'PK\x05\x06' + b'\0' * 18, {}, 'wrong-type'),
        'wrong size': ('20261118-210000-aaaaa2', good, {'size': len(good) - 10}, 'bad-job'),
        'version 0.2': ('20261118-210000-aaaaa3', good, {'version': '0.2'}, 'bad-job'),
    }
    t = {}
    for what, (jid, data, change, _) in bads.items():
        doc = {'format': 'toolbox-job', 'version': change.get('version', '0.1'), 'job': jid, 'created': F.now(), 'from': RENDER, 'to': ME,
               'action': 'import-bake', 'files': [{'name': 'house.hpbake', 'type': 'hpbake', 'size': change.get('size', len(data))}]}
        t[f'Toolbox/tools/{ME}/inbox/{jid}/house.hpbake'] = b64(data)
        t[f'Toolbox/tools/{ME}/inbox/{jid}/job.json'] = b64(json.dumps(doc).encode())
    pg.evaluate("t => window.__opfs.put(t)", t)
    tick(pg)
    box = dump(pg, tmp)
    for what, (jid, _, _, code) in bads.items():
        sf = box / 'tools' / ME / 'inbox' / jid / 'status.json'
        st = json.loads(sf.read_text()) if sf.exists() else {}
        rep = Report('s'); read_doc(sf, 'status-0', rep, 'status.json') if sf.exists() else None
        check(f'a bad reply ({what}): status failed, code {code}, the status passes the checker', st.get('state') == 'failed' and st.get('code') == code and not rep.errors, (st, rep.errors))
        if what == 'version 0.2':
            check('… version 0.2: "written by a newer tool (toolbox format 0.2)"', 'newer tool (toolbox format 0.2)' in st.get('text', ''), st)
    check('… no import (the bake stays as it was)', pg.evaluate("() => window.__hp.app.shownVersion().bake.id") == bake_id)
    toasts = pg.inner_text('#toasts')
    check('… and the owner is told', 'cannot take' in toasts, toasts)

    # review 0042: Cancel at "Replace the baked light?" keeps the bake as it was and does not lose the reply as "failed";
    # a reply naming a job this device never sent deletes nothing in Fresing Render's inbox
    send(pg, quick_opts(pg))
    box = dump(pg, tmp)
    je = inbox_jobs(box, RENDER)[0]
    other = '20261118-220000-bbbbb1'
    (box / 'tools' / RENDER / 'inbox' / other).mkdir()
    (box / 'tools' / RENDER / 'inbox' / other / 'job.json').write_bytes((box / 'tools' / RENDER / 'inbox' / je / 'job.json').read_bytes().replace(je.encode(), other.encode()))
    sync(pg, box)
    box, reply_e = answer(pg, tmp, je)
    pg.evaluate("() => { const a = window.__hp.app; a._tb.cleaned = Date.now(); a.tbTick(true); }")
    pg.wait_for_selector('.dialog:has-text("Replace the baked light?")', timeout=600000)
    pg.click('.dialog .btn:not(.primary):has-text("Cancel")')
    pg.wait_for_function("() => !window.__hp.app._tb.busy")
    box = dump(pg, tmp)
    sf = box / 'tools' / ME / 'inbox' / reply_e / 'status.json'
    st = json.loads(sf.read_text()) if sf.exists() else {}
    check('Cancel at "Replace?": the bake stays as it was, the reply is "cancelled" (not failed), kept a day', st.get('state') == 'cancelled'
          and pg.evaluate("() => window.__hp.app.shownVersion().bake.id") == bake_id and reply_e in inbox_jobs(box, ME), st)
    # a reply whose reply_to names a job this device never sent
    t = {}
    jf = '20261118-220000-ccccc1'
    doc = {'format': 'toolbox-job', 'version': '0.1', 'job': jf, 'created': F.now(), 'from': RENDER, 'to': ME, 'action': 'import-bake',
           'reply_to': {'tool': RENDER, 'job': other}, 'files': [{'name': 'house.hpbake', 'type': 'hpbake', 'size': len(good)}]}
    pg.evaluate("t => window.__opfs.put(t)", {f'Toolbox/tools/{ME}/inbox/{jf}/house.hpbake': b64(good), f'Toolbox/tools/{ME}/inbox/{jf}/job.json': b64(json.dumps(doc).encode())})
    pg.evaluate("() => { const a = window.__hp.app; a._tb.cleaned = Date.now(); a.tbTick(true); }")
    pg.wait_for_selector('.dialog:has-text("Replace the baked light?")', timeout=600000)
    pg.click('.dialog .btn.primary')
    pg.wait_for_function("() => !window.__hp.app._tb.busy && !document.querySelector('#sheet-root .scrim')", timeout=600000)
    pg.wait_for_timeout(500)
    box = dump(pg, tmp)
    check('a reply naming a job this device never sent: imported, but that job in Fresing Render\'s inbox is left alone',
          jf not in inbox_jobs(box, ME) and other in inbox_jobs(box, RENDER), (inbox_jobs(box, ME), inbox_jobs(box, RENDER)))
    bake_id = pg.evaluate("() => window.__hp.app.shownVersion().bake.id")

    # two windows: one reads the inbox at a time
    pg2 = pg.context.new_page()
    pg2.add_init_script(OPFS)
    pg2.goto(BASE)
    pg2.wait_for_function("() => window.__hp && window.__hp.app._tb && window.__hp.app._tb.box", timeout=60000)
    check('a second window finds the kept folder and its permission by itself', True)
    # window 1 holds the inbox's lock (as while it reads); window 2's look at the inbox is refused meanwhile
    # (both windows' own regular looks paused for this, so only these two ask for the lock)
    pause = "() => { const a = window.__hp.app; a.__tick = a.tbTick; a.tbTick = async () => {}; }"
    pg.evaluate(pause); pg2.evaluate(pause)
    for q in (pg, pg2):
        q.wait_for_function("() => !window.__hp.app._tb.busy", timeout=120000)
    pg.evaluate("() => { window.__held = true; window.__hp.app._tb.box.exclusively(() => new Promise(r => setTimeout(() => { window.__held = false; r('one'); }, 15000))); }")
    pg.wait_for_timeout(300)
    r2 = pg2.evaluate("async () => (await window.__hp.app._tb.box.exclusively(async () => 'two')) ?? null")
    still = pg.evaluate("() => window.__held")
    pg.wait_for_function("() => !window.__held", timeout=60000)
    r3 = pg2.evaluate("async () => (await window.__hp.app._tb.box.exclusively(async () => 'two')) ?? null")
    check('two windows: while one reads the inbox, the other does not (Web Lock); after it, the other may', r2 is None and still and r3 == 'two', (r2, still, r3))
    pg2.close()
    pg.evaluate("() => { const a = window.__hp.app; a.tbTick = a.__tick; }")

    # a .hpbake opened by the installed app (launchQueue hands the file to tbOpenBakeFile)
    o = quick_opts(pg)
    send(pg, o)
    box = dump(pg, tmp)
    jd = inbox_jobs(box, RENDER)[0]
    scene = next((box / 'tools' / RENDER / 'inbox' / jd).glob('*.hpscene')).read_bytes()
    bake = make_bake(scene, snow=False, open_storeys=False)
    pg.evaluate("async () => { const p = window.__hp.newProject('Third house', ['Ground floor']); await window.__hp.DB.put('projects', p); await window.__hp.app.openProject(p.id); }")
    pg.evaluate("b => { window.__od = null; window.__hp.app.tbOpenBakeFile(new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], 'house.hpbake')).then(r => { window.__od = { r }; }); }", b64(bake))
    # that house's version has baked light already: asked, as with Import bake
    pg.wait_for_selector('.dialog:has-text("Replace the baked light?")', timeout=600000)
    pg.click('.dialog .btn.primary')
    pg.wait_for_function("() => window.__od", timeout=600000)
    check('a .hpbake opened with the app goes to the house that sent it (that house opens, the bake is in)',
          pg.evaluate("id => { const a = window.__hp.app; return window.__od.r === true && a.project.id === id; }", house_a))
    lq = pg.evaluate("() => 'launchQueue' in window")
    print(f'   (launchQueue in the test browser: {lq}; a real launch from Explorer cannot be made here)')
    check('no errors on the page', not pg.errors, pg.errors[:3])
    b.close()


def no_button(p, phone, label):
    b, pg = open_app(p, phone=phone, theme='dark' if phone else 'light',
                     init=[] if phone else [str(Path(tempfile.gettempdir()) / '_nopicker.js')])
    open_example(pg)
    pg.wait_for_timeout(2000)
    check(f'{label}: the Toolbox folder is not offered', not pg.evaluate("() => window.__hp.app.tbAvailable()"))
    pg.evaluate("() => { window.__hp.app.hpsceneDialog(); }")
    pg.wait_for_selector('.hps-dialog')
    dlg = pg.inner_text('.dialog')
    check(f'{label}: no "Send to Fresing Render", no Connect; Save file is the main button', 'Send to Fresing Render' not in dlg and pg.locator('#tb-row').count() == 0
          and 'Save file' in pg.inner_text('.dialog .btn.primary'), dlg[-200:])
    if phone:
        w = pg.evaluate("() => Math.max(...[...document.querySelectorAll('.dialog *')].map(e => e.getBoundingClientRect().right))")
        check(f'{label}: the dialog fits the 390 px screen', w <= 391, w)
        pg.screenshot(path=SHOTS + 'toolbox-dialog-phone-dark.png')
    pg.keyboard.press('Escape')
    check(f'{label}: nothing under the top bar', pg.locator('#tb-bar').count() == 0)
    check(f'{label}: no errors on the page', not pg.errors, pg.errors[:3])
    b.close()


if __name__ == '__main__':
    files_test()
    (Path(tempfile.gettempdir()) / '_nopicker.js').write_text('delete window.showDirectoryPicker; window.showDirectoryPicker = undefined;')
    with sync_playwright() as p:
        no_button(p, True, 'phone dark')
        no_button(p, False, 'PC without showDirectoryPicker (Firefox, Safari)')
        with tempfile.TemporaryDirectory() as tmp:
            pc_test(p, tmp)
    sys.exit(summary())
