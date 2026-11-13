"""Thirty-eighth round (4 Nov, evening): the Renato sofa of Inhouse – every element of its model sheet at its real size, a
category of its own in Add furniture; the Pixel 10: safe pictures for its PowerVR chip on the OpenGL ES driver, and the
reason when 3D won't start. PC (light), phone (dark). (The owner's floor – PVC planks from his photo, in packs, in the
budget – and his Renato corner sofa in a layout of his house, and their upgrade: house/tests/test_round38_own.py.)"""
from common import *
import os, math

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
V3 = "window.__hp.app.panes.find(p => p.kind === '3d').view"

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    pg.wait_for_function(READY, timeout=90000)
    open_example(pg)
    # every element of the sheet: its shapes inside its size, a 3D model of a sensible size
    el = pg.evaluate("""() => { const H = window.__hp, out = [];
      for (const T of H.FURN_TYPES.filter(t => t.kind === 'modsofa')) {
        const P = H.renatoParts(T, T.w, T.d), pts = [P.outline, ...P.backs, ...P.arms, ...P.seats, ...P.cush].flat();
        const inside = pts.every(([x, y]) => Math.abs(x) <= T.w / 2 + 1e-6 && Math.abs(y) <= T.d / 2 + 1e-6);
        const g = H.renatoMesh({ type: T.id, w: T.w, d: T.d, h: T.h, color: T.color }); let tris = 0; const bb = new H.THREE.Box3().setFromObject(g);
        g.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
        const sz = bb.getSize(new H.THREE.Vector3());
        out.push({ id: T.id, inside, seats: P.seats.length, legs: P.legs.length, tris: Math.round(tris), w: +sz.x.toFixed(2), h: +sz.y.toFixed(2), d: +sz.z.toFixed(2), sym: H.furnSymbol({ type: T.id, w: T.w, d: T.d }).length });
      } return out; }""")
    bad = [e for e in el if not e['inside'] or e['seats'] < 1 or e['legs'] < 4 or e['tris'] > 60000 or e['sym'] < 2]
    check('30 elements of the sheet: shapes inside their size, seat cushions, legs, a 2D symbol, under 60,000 triangles each', len(el) == 30 and not bad, bad or [(e['id'], e['tris']) for e in el][:6])
    hts = {e['id']: e for e in el}
    check('… heights as the sheet: back 85 cm, a footstool 44 cm; widths as the sheet (3-seater 180 / 200 / 220, round island 136 × 128)', abs(hts['renato_3z']['h'] - 0.85) < 0.03 and abs(hts['renato_h80']['h'] - 0.46) < 0.04 and abs(hts['renato_3z']['w'] - 1.8) < 0.02 and abs(hts['renato_3zL']['w'] - 2.0) < 0.02 and abs(hts['renato_3zB']['w'] - 2.2) < 0.02 and abs(hts['renato_islL']['w'] - 1.36) < 0.02 and abs(hts['renato_islL']['d'] - 1.28) < 0.02, [(k, v['w'], v['h'], v['d']) for k, v in hts.items() if k in ('renato_3z', 'renato_3zL', 'renato_3zB', 'renato_islL', 'renato_h80')])
    # Add furniture: the Renato category
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('furnish'); a.setDim('2d'); a.refreshViews(false); }"); pg.wait_for_timeout(1500)
    pg.evaluate("() => { window.__hp.app.catalogSheet(); }"); pg.wait_for_timeout(900)
    pg.click('button[data-cat="renato"]'); pg.wait_for_timeout(900)
    cards = pg.evaluate("() => [...document.querySelectorAll('.cat-card .cc-name')].map(e => e.textContent)")
    check('Add furniture: a tab “Renato sofa (Inhouse)” with its 30 elements', len([c for c in cards if c.startswith('Renato')]) == 30, cards[:5])
    pg.screenshot(path=SHOTS + 'r38-catalog.png')
    pg.locator('.cat-card', has_text='Renato – Round corner element').click(); pg.wait_for_timeout(1200)
    add = pg.evaluate("() => { const a = window.__hp.app, L = a.project.furniture.layouts.find(l => l.id === a.project.furniture.activeLayoutId); return L.items.filter(f => f.type === 'renato_cround').length; }")
    check('… one added (the round corner element)', add == 1, add)
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.fit(20, false); }"); pg.wait_for_timeout(1200)
    pg.screenshot(path=SHOTS + 'r38-plan.png')
    pg.evaluate("() => window.__hp.app.undo()"); pg.wait_for_timeout(500)
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=90000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('furnish'); a.setDim('2d'); a.refreshViews(false); a.catalogSheet(); }"); pg.wait_for_timeout(1200)
    pg.locator('button[data-cat="renato"]').tap(); pg.wait_for_timeout(800)
    ph = pg.evaluate("() => ({ n: [...document.querySelectorAll('.cat-card .cc-name')].filter(e => /^Renato/.test(e.textContent)).length, over: document.documentElement.scrollWidth - innerWidth })")
    check('phone: the Renato tab (30 elements), nothing sideways', ph['n'] == 30 and ph['over'] <= 0, ph)
    pg.screenshot(path=SHOTS + 'r38-phone-catalog.png')
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── the Pixel 10: safe pictures for its PowerVR chip on the OpenGL ES driver; the reason when 3D won't start ─────────
    b, pg = open_app(p)
    pg.wait_for_function(READY, timeout=90000)
    sf = pg.evaluate("""() => { const H = window.__hp, T = H.THREE;
      return { gl: H.needSafeTex('ANGLE (Imagination Technologies, PowerVR D-Series DXT-48-1536, OpenGL ES 3.2)', {}), vk: H.needSafeTex('ANGLE (Imagination Technologies, Vulkan 1.4.317 (PowerVR D-Series DXT-48-1536 MC1 (0x71061212)), PowerVR D-Series Vulkan Driver)', {}),
        other: H.needSafeTex('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070, D3D11)', {}), forced: H.needSafeTex('ANGLE (NVIDIA)', { safeTex: true }), never: H.needSafeTex('PowerVR D-Series OpenGL ES', { safeTex: false }), now: H.safeTex() }; }""")
    check('safe pictures: on for the PowerVR chip with the OpenGL ES driver, not with Vulkan, not elsewhere; a device setting wins', sf['gl'] and not sf['vk'] and not sf['other'] and sf['forced'] and not sf['never'] and not sf['now'], sf)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.settings.safeTex = true; a.setMode('view'); a.setDim('3d'); a.setScope('storey', window.__hp.sortedStoreys(a.project)[0].id); a.layoutKey = null; a.setupPanes(false); a.refreshViews(false); }")
    pg.wait_for_timeout(14000); still(pg)
    sm = pg.evaluate("""() => { const H = window.__hp, T = H.THREE, x = new T.Texture(); x.anisotropy = 8; const v = %s;
      let mip = 0, n = 0; v.group.traverse(o => { if (!o.isMesh || !o.material) return; for (const m of [].concat(o.material)) if (m.map) { n++; if (m.map.generateMipmaps || m.map.anisotropy > 1) mip++; } });
      return { on: H.safeTex(), min: x.minFilter === T.LinearFilter, gen: x.generateMipmaps, an: x.anisotropy, own: x._hpAniso, maps: n, mip }; }""" % V3)
    check('… switched on (as on that phone): pictures without chip-made copies and without angle sharpening, their own settings kept', sm['on'] and sm['min'] and sm['gen'] is False and sm['an'] == 1 and sm['own'] == 8 and sm['maps'] > 10 and sm['mip'] == 0, sm)
    pg.screenshot(path=SHOTS + 'r38-safe-pictures.png')
    check('… the 3D view draws with them (no page errors)', not pg.errors, pg.errors[:3])
    pg.evaluate("() => { const a = window.__hp.app; delete a.settings.safeTex; }")
    b.close()
    b = p.chromium.launch(args=['--disable-3d-apis'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.wait_for_function("() => window.__hp && window.__hp.app", timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.refreshViews(false); }"); pg.wait_for_timeout(2000)
    no = pg.evaluate("() => { const n = document.querySelector('.no3d'); return n ? { text: n.textContent, retry: !!n.querySelector('#btn-3d-retry') } : null; }")
    check('no 3D at all: the message with the browser\'s own reason, what to do, and Try again', no and 'The browser says' in no['text'] and 'Close the browser completely' in no['text'] and no['retry'], no)
    pg.screenshot(path=SHOTS + 'r38-no3d.png')
    pg.click('#btn-3d-retry'); pg.wait_for_timeout(1500)
    check('… Try again: tries once more (the same message while the browser still says no)', pg.locator('.no3d').count() >= 1)
    b.close()

web = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist', 'web', 'index.html')
if os.path.exists(web):
    w = open(web, encoding='utf-8').read()
    check('the web version: the Renato elements are in it', "id: 'renato_' + id" in w and '3-seater without arms' in w)
sys.exit(summary())
