"""Documents whose files come from the library (task 0022): a house's document can name a library item (doc.lib =
'doc:<name>', a PDF and its thumb). Where its file is not on this device, the app copies it in from the library when the
house opens. Without the library the house opens as usual and Documents says where to get it, with Load library…
right there; loading it fills them in. Never a duplicate; a document deleted stays deleted, one renamed or turned
stays so. And this lane's follow-ups of 0026 / 0027: a packed house file that unpacks to more than 150 MB is not opened; the
clean-up keeps a file only Undo still uses. On the made-up house with a small library made here from its own PDF. PC (light) and phone (dark).
(The owner's eight documents: house/tests/test_docs_lib_own.py.)"""
from common import *
import base64, gzip, io, json, os, zipfile, zlib

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EX = json.load(open(os.path.join(APP, 'build', 'example.json'), encoding='utf-8'))['files']
PDF = base64.b64decode(EX['as_ex_plans_pdf']['b64'])
TH = base64.b64decode(EX['as_ex_plans_th']['b64'])


def lib_zip():
    "a library with two documents (the made-up house's PDF twice: 'doc:t1', 'doc:t2')"
    items, z = [], io.BytesIO()
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_STORED) as zf:
        for k in ('t1', 't2'):
            zf.writestr(f'docs/{k}.pdf', PDF); zf.writestr(f'docs/{k}.jpg', TH)
            items.append({'id': 'doc:' + k, 'kind': 'doc', 'licence': 'test', 'files': [{'f': f'docs/{k}.pdf', 'b': len(PDF)}, {'f': f'docs/{k}.jpg', 'b': len(TH), 'thumb': True, 'w': 200, 'h': 283}]})
        zf.writestr('library.json', json.dumps({'v': 1, 'kind': 'house-planner-library', 'name': 'testdocs', 'items': items}))
    os.makedirs(SHOTS, exist_ok=True)
    path = os.path.join(SHOTS, 'docs-lib-test.zip')
    open(path, 'wb').write(z.getvalue())
    return path


ZIP = lib_zip()
# a 160 MB house file packed to ~160 KB, and a small one
_z = zlib.compressobj(9, zlib.DEFLATED, 31)
BOMB = base64.b64encode(_z.compress(b'{"format":"house-planner","x":"') + b''.join(_z.compress(b'0' * (1 << 20)) for _ in range(160)) + _z.compress(b'"}') + _z.flush()).decode()
SMALL = base64.b64encode(gzip.compress(b'{"format":"house-planner","formatVersion":1,"projects":[],"assets":{}}')).decode()
# the made-up house with two documents of the library (their files not on this device), saved and opened again
ADD = """async () => { const H = window.__hp, a = H.app, id = a.project.id;
  a.mutate(p => { p.docs = (p.docs || []).filter(d => !d.lib);
    for (const k of ['t1', 't2']) p.docs.push({ id: 'doc_lib_' + k, name: 'Library ' + k, file: k + '.pdf', type: 'pdf', pages: 2, size: 2000, added: 1, rot: 0, storeys: {}, asset: 'as_lib_' + k + '_pdf', thumb: 'as_lib_' + k + '_th', lib: 'doc:' + k }); }, { project: true });
  await H.Saver.flushNow(); await a.openProject(id); return a.project.docs.length; }"""
STATE = """async () => { const H = window.__hp, P = H.app.project, keys = new Set(await H.DB.allKeys('assets'));
  return { n: P.docs.length, lib: P.docs.filter(d => d.lib).map(d => ({ id: d.id, name: d.name, rot: d.rot, pdf: keys.has(d.asset), th: keys.has(d.thumb) })),
    cards: [...document.querySelectorAll('.doc-card')].map(c => [c.dataset.doc, !!(c.querySelector('img') && c.querySelector('img').naturalWidth), !!c.querySelector('.doc-nofile')]),
    hint: (document.querySelector('#docs-lib-hint') || {}).textContent || '' }; }"""
REOPEN = "async () => { const a = window.__hp.app; await window.__hp.Saver.flushNow(); await a.openProject(a.project.id); }"
SHEET = "async () => { const a = window.__hp.app; a.setMode('view'); await a.documentsSheet(); }"


def close_sheet(pg):
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)


def run(p, phone):
    b, pg = open_app(p, phone=phone, theme='dark' if phone else 'light')
    tag = 'phone' if phone else 'PC'
    pg.wait_for_function(READY, timeout=90000)
    open_example(pg)
    n0 = pg.evaluate(ADD)
    st = pg.evaluate(STATE)
    check(f'{tag}: the house opens without the library; its two library documents listed, their files not here', n0 >= 2 and len(st['lib']) == 2 and not any(d['pdf'] or d['th'] for d in st['lib']), st)
    pg.evaluate(SHEET); pg.wait_for_selector('#docs-lib-hint')
    st = pg.evaluate(STATE)
    check(f'{tag}: Documents says 2 are in the library, with Load library… right there; their cards say so', st['hint'].startswith('2 ') and pg.locator('#docs-lib-load').is_visible()
          and sum(1 for c in st['cards'] if c[2]) == 2, st)
    over = pg.evaluate("() => document.documentElement.scrollWidth - innerWidth")
    check(f'{tag}: the hint fits the screen', over <= 0, over)
    pg.screenshot(path=SHOTS + f'docslib-{tag}-hint.png')
    # a document opened without its file: says where it is
    pg.click('.doc-card[data-doc="doc_lib_t1"]'); pg.wait_for_timeout(1500)
    toast = pg.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')")
    check(f'{tag}: opened without its file, it says the document is in the library', 'library' in toast, toast)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    pg.evaluate(SHEET); pg.wait_for_selector('#docs-lib-hint')
    pg.set_input_files('#docs-lib-file', ZIP)
    pg.wait_for_function("() => !document.querySelector('#docs-lib-hint') && document.querySelectorAll('.doc-card img').length >= 2", timeout=60000)
    pg.wait_for_timeout(800)
    st = pg.evaluate(STATE)
    check(f'{tag}: Load library… fills them in: each with its file and picture, no hint left', all(d['pdf'] and d['th'] for d in st['lib']) and not st['hint']
          and all(c[1] and not c[2] for c in st['cards'] if c[0].startswith('doc_lib_')), st)
    check(f'{tag}: … not a document more (no duplicates)', st['n'] == n0, (st['n'], n0))
    pg.screenshot(path=SHOTS + f'docslib-{tag}-filled.png')
    pages = pg.evaluate("async () => { const a = window.__hp.app; const pdf = await a.docPdf(a.project.docs.find(d => d.id === 'doc_lib_t1')); return pdf.numPages; }")
    check(f'{tag}: the file from the library opens (pdf.js, all its pages)', pages == 2, pages)
    close_sheet(pg)
    if not phone:
        # renamed, turned, deleted: stays so – also when the files are gone again and come back from the library
        pg.evaluate("""() => { const a = window.__hp.app; a.mutate(p => { const d = p.docs.find(x => x.id === 'doc_lib_t1'); d.name = 'Mine now'; d.rot = 90; p.docs = p.docs.filter(x => x.id !== 'doc_lib_t2'); }, { project: true }); }""")
        pg.evaluate("async () => { const H = window.__hp; await H.DB.del('assets', 'as_lib_t1_pdf'); await H.DB.del('assets', 'as_lib_t1_th'); H.Assets.cache.delete('as_lib_t1_pdf'); H.Assets.cache.delete('as_lib_t1_th'); }")
        pg.evaluate(REOPEN); pg.wait_for_timeout(800)
        st = pg.evaluate(STATE)
        check('the library on this device: a document whose file is gone gets it back at once when the house opens', len(st['lib']) == 1 and st['lib'][0]['pdf'] and st['lib'][0]['th'], st)
        check('… renamed and turned stays so, the deleted one does not come back', st['lib'][0]['name'] == 'Mine now' and st['lib'][0]['rot'] == 90 and st['n'] == n0 - 1, st)
        pg.evaluate(REOPEN); pg.wait_for_timeout(500)
        st2 = pg.evaluate(STATE)
        assets = pg.evaluate("async () => (await window.__hp.DB.allKeys('assets')).filter(k => k.startsWith('as_lib_')).sort()")
        # (the deleted one's files may still be kept a while: undo, the clean-up's grace time)
        check('… opened again: the same (no duplicates, no extra files)', st2['n'] == st['n'] and assets[:2] == ['as_lib_t1_pdf', 'as_lib_t1_th'] and set(assets) <= {'as_lib_t1_pdf', 'as_lib_t1_th', 'as_lib_t2_pdf', 'as_lib_t2_th'}, (st2, assets))
        # a backup carries the file it has now; the library item travels as a name only
        ex = pg.evaluate("""async () => { const a = window.__hp.app; const j = JSON.parse(await a.buildExport([a.project], false)); const d = j.projects[0].project.docs.find(x => x.id === 'doc_lib_t1');
          return { lib: d.lib, file: !!j.assets[d.asset] }; }""")
        check('a backup carries the document with its file', ex['lib'] == 'doc:t1' and ex['file'], ex)
    if not phone:
        # (0027's follow-up) the clean-up of unused files keeps one only Undo still uses (Empty trash runs it)
        gc = pg.evaluate("""async () => { const H = window.__hp, a = H.app;
          await H.DB.put('assets', { id: 'as_undo_only', dataUrl: 'data:image/png;base64,AA==', w: 1, h: 1, created: 1 });
          a.undoStack.push({ s: JSON.stringify({ photo: 'as_undo_only' }), t: Date.now(), b: 40 });
          await H.Assets.collectGarbage(); const kept = !!(await H.DB.get('assets', 'as_undo_only'));
          a.undoStack.pop(); await H.Assets.collectGarbage(); const gone = !(await H.DB.get('assets', 'as_undo_only'));
          return { kept, gone }; }""")
        check('the clean-up keeps a file only Undo still uses; once Undo no longer has it, it goes', gc['kept'] and gc['gone'], gc)
    if not phone:
        # (a follow-up of task 0026 in this lane) a packed house file is checked by what it unpacks to: a small .gz that
        # unpacks to more than 150 MB is not read on – the phone could run out of memory
        r = pg.evaluate("""async ([big, ok]) => { const a = window.__hp.app, f = (b64, n) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], n);
          document.querySelectorAll('.toast').forEach(t => t.remove());
          const d1 = await a.readHouseFileChecked(f(big, 'big.house.gz')), msg = [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ');
          const d2 = await a.readHouseFileChecked(f(ok, 'ok.house.gz'));
          return { big: d1 === null, msg, ok: !!(d2 && d2.format === 'house-planner') }; }""", [BOMB, SMALL])
        check('a .house.gz that unpacks to more than 150 MB is not opened (it says so); a normal one is', r['big'] and 'unpacks to more than' in r['msg'] and r['ok'], r)
    check(f'{tag}: no page errors', not pg.errors, pg.errors[:3])
    b.close()


with sync_playwright() as p:
    run(p, False)
    run(p, True)
sys.exit(summary())
