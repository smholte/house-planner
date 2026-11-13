"""English, Dutch and Norwegian: the language is chosen in Settings (the app starts again in it, your work saved);
every word on screen that is in the dictionary is shown translated (also texts with numbers or names in them),
dates in that language and decimals with a comma; ?lang=no in the address works too; back to English. Also
checks that nothing that is in the dictionary is left in English on the main screens. PC and phone."""
from common import *
import time

TR = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'i18n', 'translations.json'), encoding='utf-8'))
TEXTS = """() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { const p = n.parentElement; if (!p || p.closest('[translate="no"], script, style, textarea, svg')) continue;
    const r = p.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(p).visibility === 'hidden') continue;
    const s = n.nodeValue.replace(/\\s+/g, ' ').trim(); if (s && /[A-Za-z]{2}/.test(s)) out.push(s); }
  for (const el of document.querySelectorAll('[title], [aria-label], [placeholder]')) { if (el.closest('[translate="no"]')) continue; for (const a of ['title', 'aria-label', 'placeholder']) { const v = el.getAttribute(a); if (v && /[A-Za-z]{2}/.test(v)) out.push(v.replace(/\\s+/g, ' ').trim()); } }
  return out; }"""

def wait_app(pg):
    pg.wait_for_function("() => window.__hp && window.__hp.app && (window.__hp.app.project || !document.querySelector('#home').hidden)", timeout=30000); pg.wait_for_timeout(1500)

def switch(pg, lang):
    pg.evaluate("() => { window.__hp.app.settingsSheet(); }"); pg.wait_for_timeout(500)
    pg.click(f'#set-lang button[data-k="{lang}"]')
    pg.wait_for_timeout(1500); wait_app(pg)

def misses(pg, li):
    """texts on screen that are in the dictionary with a different translation: the translation layer missed them"""
    return sorted({s for s in pg.evaluate(TEXTS) if s in TR and TR[s][li] and TR[s][li] != s})

def select_room(pg, name):
    pg.evaluate("(n) => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === n); a.selection = { type: 'room', id: r.id, storey: r.storey }; a.renderInspector(); }", name); pg.wait_for_timeout(500)

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(500)
    t0 = time.time()
    for _ in range(5): pg.evaluate("() => window.__hp.app.refreshViews(false)"); pg.wait_for_timeout(50)
    en_time = time.time() - t0
    switch(pg, 'nl')
    check('Dutch: the app started again in Dutch, on the same house', pg.evaluate("() => [document.documentElement.lang, window.__hp.app.settings.lang, !!window.__hp.app.project]") == ['nl', 'nl', True])
    body = pg.inner_text('body')
    want = ['Bouwen', 'Inrichten', 'Bekijken', 'Exporteren', 'Herstelpunt', 'Origineel', 'Gepland', 'Wijzigingen']
    check('the main buttons in Dutch', all(w in body for w in want), [w for w in want if w not in body])
    m = misses(pg, 0)
    check('nothing from the dictionary left in English on the main screen', not m, m[:20])
    rname, rarea = by_house(pg, ('Keuken', '17,2 m²'), ('Kamer', '23,6 m²'))
    select_room(pg, rname)
    ins = pg.inner_text('.inspector')
    check('a room\'s details in Dutch (Naam, Vloer, Materiaal, Kleur)', all(w in ins for w in ['Naam', 'Vloer', 'Materiaal', 'Kleur']), ins[:300])
    check(f'decimals with a comma ({rarea})', rarea in ins, ins[:200])
    m = misses(pg, 0)
    check('the room details: nothing from the dictionary left in English', not m, m[:20])
    tx = pg.evaluate("() => { const H = window.__hp; return [H.t('{n} planned versions', { n: 2 }), H.trText('3 houses imported.'), H.trText('Floor plan · Begane grond'), H.fmtDate(new Date(2026, 9, 27, 14, 5).getTime())]; }")
    check('texts with numbers and names are translated', tx[0] == '2 geplande versies' and tx[1] == '3 huizen geïmporteerd.' and tx[2].startswith(TR['Floor plan'][0]), tx)
    check('dates in Dutch', 'okt' in tx[3] and '2026' in tx[3], tx[3])
    pg.evaluate("() => { window.__hp.app.settingsSheet(); }"); pg.wait_for_timeout(500)
    st = pg.inner_text('.scrim:last-child .dialog')
    check('Settings in Dutch, with Nederlands chosen', 'Instellingen' in st and 'Uiterlijk' in st and pg.get_attribute('#set-lang button[data-k="nl"]', 'aria-pressed') == 'true')
    m = misses(pg, 0)
    check('Settings: nothing from the dictionary left in English', not m, m[:20])
    pg.screenshot(path=SHOTS + 'i18n-settings-nl.png')
    pg.click('.scrim:last-child .dialog .dlg-head button[aria-label]'); pg.wait_for_timeout(300)
    # 3D and the quantities window
    pg.evaluate("() => window.__hp.app.setDim ? window.__hp.app.setDim('3d') : null"); pg.wait_for_timeout(2500)
    m = misses(pg, 0)
    check('3D: nothing from the dictionary left in English', not m, m[:20])
    pg.evaluate("() => { window.__hp.app.quantitiesSheet && window.__hp.app.quantitiesSheet(); }"); pg.wait_for_timeout(1500)
    m = misses(pg, 0)
    check('the quantities: nothing from the dictionary left in English', not m, m[:20])
    pg.screenshot(path=SHOTS + 'i18n-quantities-nl.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("() => window.__hp.app.setDim ? window.__hp.app.setDim('2d') : null"); pg.wait_for_timeout(1000)
    t0 = time.time()
    for _ in range(5): pg.evaluate("() => window.__hp.app.refreshViews(false)"); pg.wait_for_timeout(50)
    nl_time = time.time() - t0
    check('drawing the plan is not noticeably slower in Dutch', nl_time < en_time * 2 + 0.5, (round(en_time, 2), round(nl_time, 2)))
    pg.screenshot(path=SHOTS + 'i18n-nl-pc.png')
    # Norwegian
    switch(pg, 'no')
    body = pg.inner_text('body')
    check('Norwegian: the main buttons', all(w in body for w in ['Bygge', 'Innrede', 'Vise', 'Eksporter']) and pg.evaluate("() => document.documentElement.lang") == 'nb')
    m = misses(pg, 1)
    check('Norwegian: nothing from the dictionary left in English', not m, m[:20])
    # back to English
    switch(pg, 'en')
    body = pg.inner_text('body')
    check('back in English', all(w in body for w in ['Build', 'Furnish', 'Export']) and 'Bygge' not in body)
    # the address can choose the language for one visit
    pg.goto(BASE + '?lang=no'); wait_app(pg)
    check('?lang=no in the address shows Norwegian', 'Bygge' in pg.inner_text('body'))
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    switch(pg, 'no')
    m = misses(pg, 1)
    check('phone, Norwegian: nothing from the dictionary left in English', not m, m[:20])
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: longer words do not push anything off the screen', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'i18n-no-phone-dark.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
