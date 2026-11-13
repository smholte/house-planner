"""Thirty-seventh round (4 Nov, night): the documents of a house – each with its file and its picture, every page there
(pdf.js reads it); the list, a document opened and its pages turned; a storey's details list the pages that show it
and a tap opens them; a backup carries them, a copy for viewing leaves them out (it stays small); nothing of them in
the web version. PC (light) and phone (dark). (The owner's seven documents and their upgrade:
house/tests/test_round37_own.py.)"""
from common import *
import os

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
DV = "() => { const v = document.querySelector('.docview'); const c = document.querySelector('#dv-canvas'); return v ? { page: v.docState.page, zoom: Math.round(v.docState.zoom * 100), cw: c ? c.width : 0, ch: c ? c.height : 0, lbl: (document.querySelector('#dv-page') || {}).textContent || '', id: v.dataset.doc } : null; }"
DOCS = """() => { const H = window.__hp, P = H.app.project, sts = H.sortedStoreys(P).map(s => s.id);
  return (P.docs || []).map(d => ({ id: d.id, name: d.name, pages: d.pages, size: d.size, gf: (d.storeys[sts[0]] || []).length,
    pdf: !!(H.Assets.get(d.asset) || {}).url && H.Assets.get(d.asset).url.startsWith('data:application/pdf'), thumb: !!(H.Assets.get(d.thumb) || {}).url })); }"""

def wait_render(pg, page=None, t=30000):
    pg.wait_for_function("(n) => { const c = document.querySelector('#dv-canvas'); return c && c.width > 50 && (n == null || c.dataset.page === String(n)); }", arg=page, timeout=t)
    pg.wait_for_timeout(500)

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    pg.wait_for_function(READY, timeout=90000)
    open_example(pg)
    D = pg.evaluate(DOCS)
    check('the example has documents, each with its file and its picture on this device, its number of pages', D and all(d['pdf'] and d['thumb'] and d['size'] > 1000 and d['pages'] >= 1 for d in D), D)
    np = pg.evaluate("""async () => { const a = window.__hp.app, out = {}; for (const d of a.project.docs) { const pdf = await a.docPdf(d); out[d.id] = pdf.numPages; } return out; }""")
    check('every file opens with all its pages', all(np.get(d['id']) == d['pages'] for d in D), np)
    # the list
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('view'); a.documentsSheet(); }"); pg.wait_for_timeout(2500)
    cards = pg.evaluate("() => [...document.querySelectorAll('.doc-card')].map(c => [c.querySelector('.doc-name').textContent, !!(c.querySelector('img') && c.querySelector('img').naturalWidth)])")
    check(f'the list: {len(D)} cards, each with its picture', len(cards) == len(D) and all(c[1] for c in cards), cards)
    pg.screenshot(path=SHOTS + 'r37-documents.png')
    # a document with more than one page: opened, the pages turned
    M = max(D, key=lambda d: d['pages'])
    pg.click(f'.doc-card[data-doc="{M["id"]}"]'); wait_render(pg, 1)
    v = pg.evaluate(DV)
    check(f'a document opens on its first page (1 / {M["pages"]})', v and v['id'] == M['id'] and (v['lbl'] == f'1 / {M["pages"]}' or (M['pages'] == 1 and v['lbl'] in ('', '1 / 1'))) and v['ch'] > 300, v)
    if M['pages'] > 1:
        pg.keyboard.press('ArrowRight'); wait_render(pg, 2)
        check(f'… the next page (2 / {M["pages"]})', pg.evaluate(DV)['lbl'] == f'2 / {M["pages"]}', pg.evaluate(DV))
    pg.click('#dv-in'); pg.click('#dv-in'); pg.wait_for_timeout(2000)
    check('… zoomed in', pg.evaluate(DV)['zoom'] > 100, pg.evaluate(DV))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400); pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    # the ground floor's details: the pages that show it
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('build'); a.setDisplay('plan'); a.setDim('2d'); a.setScope('storey', window.__hp.sortedStoreys(a.project)[0].id); a.select(null); a.renderInspector(); }"); pg.wait_for_timeout(1500)
    chips = pg.evaluate("() => [...document.querySelectorAll('#storey-docs .doc-chip')].map(c => c.textContent)")
    G = [d for d in D if d['gf']]
    check('the ground floor\'s details: a chip for each document page that shows it', G and len(chips) == sum(d['gf'] for d in G), (chips, G))
    pg.locator('#storey-docs .doc-chip').first.click(); wait_render(pg)
    check('… a tap opens that document', pg.evaluate(DV)['id'] == G[0]['id'], pg.evaluate(DV))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    # a backup carries them; a copy for viewing leaves them out
    ex = pg.evaluate("""async () => { const a = window.__hp.app, P = a.project; const j = JSON.parse(await a.buildExport([P], false)); const pr = j.projects[0].project;
      return { docs: pr.docs.length, files: pr.docs.every(d => j.assets[d.asset] && j.assets[d.thumb]) }; }""")
    check('a backup carries the documents with their files', ex['docs'] == len(D) and ex['files'], ex)
    vw = pg.evaluate("""async () => { const a = window.__hp.app; const d = await a.buildViewerData(a.project, { notes: true, drawings: true }); const html = window.__hp.viewerPage(d);
      return { mb: +(html.length / 1e6).toFixed(1), pdf: html.includes('JVBERi0'), docs: (d.projects[0].project.docs || []).length }; }""")
    # (the public app's made-up example is part of the app's own script, its PDF with it: only the owner's house keeps
    #  its documents' files out of the script – house/tests/test_round37_own.py)
    check('a copy for viewing: without the documents (so it stays small)', vw['docs'] == 0 and vw['mb'] < 20 and (is_testhouse(pg) or not vw['pdf']), vw)
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=90000)
    open_example(pg)
    n = len(pg.evaluate(DOCS))
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('view'); a.documentsSheet(); }"); pg.wait_for_timeout(2500)
    ph = pg.evaluate("() => ({ cards: document.querySelectorAll('.doc-card').length, over: document.documentElement.scrollWidth - innerWidth, wide: [...document.querySelectorAll('.doc-card')].filter(c => c.getBoundingClientRect().right > innerWidth + 1).length })")
    check('phone: the documents fit the screen', ph['cards'] == n and ph['over'] <= 0 and ph['wide'] == 0, ph)
    pg.screenshot(path=SHOTS + 'r37-phone-documents.png')
    pg.locator('.doc-card').first.tap(); wait_render(pg, 1)
    v = pg.evaluate(DV)
    check('phone: a document opens', v and v['ch'] > 300 and v['page'] == 1, v)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
web = os.path.join(ROOT, 'dist', 'web', 'index.html')
if os.path.exists(web):
    w = open(web, encoding='utf-8').read()
    # (since task 0008 the web version has the made-up example house, with its own made-up document: only that one)
    ex = json.load(open(os.path.join(ROOT, 'build', 'example.json'), encoding='utf-8'))
    w_rest = w.replace(json.dumps(ex.get('files'), separators=(',', ':')), '') if ex.get('files') else w
    check('the web version: no documents inside but the made-up example\'s own (no other PDF files)', 'JVBERi0' not in w_rest)
one = os.path.join(ROOT, 'dist', 'house-planner.html')
if os.path.exists(one):
    check('the app in one file stays under 40 MB with its documents', os.path.getsize(one) < 40e6, os.path.getsize(one))
sys.exit(summary())
