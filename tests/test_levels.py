"""Quality levels by device, part 1 (task 0010): Auto / Phone / Normal / PC high.

Without a browser window: the level Auto picks from what a browser says (a phone, a tablet with a phone's graphics chip,
a device with little memory, a computer drawing in software, a strong computer) – never from a device name.
PC light – the test browser (software 3D): Auto picks Normal and says why; Settings → 3D on this device: PC high (the
pictures asked for at 2048 px, the shadow 2048), kept after a reload; Phone on the PC: shadow 1024, the material pictures
compressed on the graphics card (KTX2) – less memory –, the ⋯ menu offers "3D pictures as before", which turns them off
(and on again); a 3D view's stop with compressed pictures in use turns them off by itself.
Phone dark: Auto picks Phone (touch screen, small): the 3D canvas at 1.5× (not 2×), shadow 1024, compressed pictures in
use, the trees' lighter far version; "Pictures as before" in Settings; Normal chosen: 2×, 2048, plain pictures, kept
after a reload; Settings fits the screen."""
from common import *

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
VIEW = """() => { const H = window.__hp, v = H.app.panes.find(p => p.kind === '3d').view; let ktx = 0, plain = 0; const seen = new Set();
  v.scene.traverse(o => { if (!o.material) return; for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
    const t = m[k]; if (!t || !t.source || seen.has(t.source.uuid) || !(t.userData && t.userData.lib)) continue; seen.add(t.source.uuid); if (t.isCompressedTexture) ktx++; else plain++; } });
  return { level: v.level, pr: v.renderer.getPixelRatio(), shadow: v.sun.shadow.mapSize.x, px: H.libWantPx(), gpu: H.libWantGpu(), ktx, plain,
    near: v.K && v.K.vegNear, vegFar: v.K && v.K.vegFar || 2, set: H.app.settings.level || 'auto', plainSet: !!H.app.settings.texPlain }; }"""
# the material pictures on the graphics card, in MB (as uploaded: compressed copies by their bytes, others w × h × 4 + copies)
MB = """() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view, seen = new Map();
  v.scene.traverse(o => { if (!o.material) return; for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
    const t = m[k]; if (!t || !t.source || seen.has(t.source.uuid) || !(t.userData && t.userData.lib)) continue; let b = 0;
    if (t.isCompressedTexture) for (const mm of t.mipmaps) b += mm.data.byteLength; else { const im = t.image; b = (im.naturalWidth || im.width) * (im.naturalHeight || im.height) * 4 * 4 / 3; }
    seen.set(t.source.uuid, b); } });
  return +([...seen.values()].reduce((a, b) => a + b, 0) / 1048576).toFixed(1); }"""


def settle(pg, ktx=None):
    """the pictures asked for are in and the views built with them (KTX2 copies count as loading)"""
    for _ in range(2):
        pg.wait_for_function(READY, timeout=240000); pg.wait_for_timeout(1500)
    if ktx is not None:
        pg.wait_for_function("(want) => { const T = window.__hp.TEXLIB; return T.ready && ([...T.gpu.values()].some(t => t && t.isTexture) === want); }", arg=ktx, timeout=240000)
        pg.wait_for_function(READY, timeout=240000)
    still(pg)


def level_menu(pg):
    pg.click('#btn-menu'); pg.wait_for_selector('.menu .mi')
    m = pg.evaluate("() => { const e = document.getElementById('mi-pics'); return e ? e.textContent : null; }")
    return m


with sync_playwright() as p:
    # ───────── the choice, from what a browser says ─────────
    b, pg = open_app(p)
    sig = pg.evaluate("""() => { const L = window.__hp.deviceLevel, base = { touch: false, side: 1080, mem: 8, cores: 8, maxTex: 16384, gl2: true, desktopTC: true, mobileTC: false, soft: false };
      const pick = o => L(Object.assign({}, base, o));
      return { pc: pick({}), pcUnknownMem: pick({ mem: null }), pixel: pick({ touch: true, side: 412, maxTex: 8192, desktopTC: false, mobileTC: true }),
        tablet: pick({ touch: true, side: 800, desktopTC: false, mobileTC: true }), lowmem: pick({ mem: 2 }), soft: pick({ soft: true, maxTex: 8192 }),
        smallGpu: pick({ maxTex: 8192 }), touchLaptop: pick({ touch: true, side: 1080 }), mem4: pick({ mem: 4 }), oldGpu: pick({ maxTex: 2048 }) }; }""")
    lv = {k: v['level'] for k, v in sig.items()}
    check('Auto from what the browser says: a computer with a real graphics chip, mouse, big screen, 8 GB → PC high (memory not told: PC high too)',
          lv['pc'] == 'pc' and lv['pcUnknownMem'] == 'pc', sig['pc'])
    check('… a phone (touch, small screen, ASTC / ETC only) → Phone; a tablet with a phone\'s graphics chip → Phone; 2 GB or textures under 4096 px → Phone',
          lv['pixel'] == 'phone' and lv['tablet'] == 'phone' and lv['lowmem'] == 'phone' and lv['oldGpu'] == 'phone', lv)
    check('… 3D drawn in software, textures up to 8192 px, 4 GB, a touch screen without a mouse → Normal (each with its reason)',
          lv['soft'] == 'normal' and lv['smallGpu'] == 'normal' and lv['mem4'] == 'normal' and lv['touchLaptop'] == 'normal'
          and any('software' in w for w in sig['soft']['why']) and any('GB' in w for w in sig['mem4']['why']), sig['soft'])
    LV = pg.evaluate("() => window.__hp.LEVELS")
    check('what a level changes: Phone 512 px + compressed pictures, shadow 1024, canvas 1.5×, trees lighter from 20 / 60 m; Normal as before (512, 2048, 2×, 32 / 90 m); PC high 2048 px pictures',
          LV['phone'] == {'texPx': 512, 'ktx2': True, 'shadow': 1024, 'pr': 1.5, 'vegNear': [20, 60], 'vegFar': 3}
          and LV['normal'] == {'texPx': 512, 'ktx2': False, 'shadow': 2048, 'pr': 2, 'vegNear': [32, 90]}
          and LV['pc']['texPx'] == 2048 and LV['pc']['shadow'] == 2048 and not LV['pc']['ktx2'], LV)
    # safe pictures (the Pixel's PowerVR driver): never above 512 px; compressed pictures stay as the level asks
    sf = pg.evaluate("""() => { const H = window.__hp, S = H.Settings.values; const keep = [S.safeTex, S.level];
      S.safeTex = true; S.level = 'pc'; const pcSafe = H.libWantPx(); S.level = 'phone'; const phSafe = [H.libWantPx(), H.libWantGpu()];
      S.texPlain = true; const plain = H.libWantGpu(); S.texPlain = undefined; S.safeTex = keep[0]; S.level = keep[1]; return { pcSafe, phSafe, plain }; }""")
    check('safe pictures (PowerVR): at most 512 px even on PC high; Phone still compressed; "Pictures as before" never', sf == {'pcSafe': 512, 'phSafe': [512, True], 'plain': False}, sf)

    # ───────── PC (light): the test browser ─────────
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); }"); settle(pg)
    v0 = pg.evaluate(VIEW)
    check('PC (software 3D here): Auto picks Normal – the look as before (2048 shadow, 512 px, no compressed pictures)',
          v0['level'] == 'normal' and v0['set'] == 'auto' and v0['shadow'] == 2048 and v0['px'] == 512 and not v0['gpu'] and v0['ktx'] == 0, v0)
    mb0 = pg.evaluate(MB)
    pg.evaluate("() => { window.__hp.app.settingsSheet(); }"); pg.wait_for_selector('#set-level')
    st = pg.evaluate("() => ({ pressed: [...document.querySelectorAll('#set-level button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.k), labels: [...document.querySelectorAll('#set-level button')].map(b => b.textContent), why: document.getElementById('set-level-why').textContent, pics: getComputedStyle(document.getElementById('set-pics-box')).display })")
    check('Settings → 3D on this device: Auto (Normal) chosen, Phone, Normal, PC high; why Auto chose it; no picture choice on Normal',
          st['pressed'] == ['auto'] and st['labels'] == ['Auto (Normal)', 'Phone', 'Normal', 'PC high'] and 'software' in st['why'] and st['pics'] == 'none', st)
    pg.click('#set-level button[data-k="pc"]'); pg.wait_for_timeout(500)
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Done")'); pg.wait_for_timeout(500); settle(pg)
    v1 = pg.evaluate(VIEW)
    check('PC high chosen: the pictures asked for at 2048 px (as large as the library has), shadow 2048, no compressed pictures',
          v1['level'] == 'pc' and v1['set'] == 'pc' and v1['px'] == 2048 and v1['shadow'] == 2048 and v1['ktx'] == 0 and not pg.errors, (v1, pg.errors[:2]))
    pg.wait_for_timeout(800); pg.reload(); pg.wait_for_function("() => window.__hp && window.__hp.app", timeout=30000); pg.wait_for_timeout(2000)
    kept = pg.evaluate("() => [window.__hp.Settings.values.level, window.__hp.level3d(window.__hp.app.settings)]")
    check('… kept on this device after a reload (a device setting, not in the house)', kept == ['pc', 'pc'], kept)
    check('… not in the house', pg.evaluate("() => !JSON.stringify(window.__hp.app.project || {}).includes('\"level\":\"pc\"')"))
    if not pg.evaluate("() => !!window.__hp.app.project"): open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); a.setLevel('phone'); }"); settle(pg, ktx=True)
    v2 = pg.evaluate(VIEW); mb2 = pg.evaluate(MB)
    print(f'   material pictures on the graphics card (PC, made-up house): Normal {mb0} MB → Phone {mb2} MB ({v2["ktx"]} compressed, {v2["plain"]} plain)')
    check('Phone on the PC: shadow 1024, the material pictures compressed (KTX2) – less memory', v2['level'] == 'phone' and v2['shadow'] == 1024 and v2['ktx'] >= 10 and mb2 < mb0 * 0.75 and not pg.errors, (v2, mb0, mb2, pg.errors[:2]))
    pg.screenshot(path=SHOTS + 'levels-pc-phone.png')
    m = level_menu(pg)
    check('⋯ menu: "3D pictures as before" (two taps: ⋯, then it)', m == '3D pictures as before', m)
    pg.click('#mi-pics'); settle(pg, ktx=False)
    v3 = pg.evaluate(VIEW)
    check('… tapped: no compressed pictures any more, the plain ones instead; the choice kept on the device', v3['ktx'] == 0 and v3['plain'] >= 10 and v3['plainSet'] and not v3['gpu'] and not pg.errors, (v3, pg.errors[:2]))
    m = level_menu(pg)
    check('… the ⋯ menu now offers them again', m == '3D pictures: compressed again', m)
    pg.click('#mi-pics'); settle(pg, ktx=True)
    check('… tapped: compressed again', pg.evaluate(VIEW)['ktx'] >= 10)
    # the graphics card stopped while compressed pictures were in use: as before from now on (not chosen by hand yet)
    pg.evaluate("() => { const H = window.__hp; H.Settings.values.texPlain = undefined; H.app.view3dLost(H.app.panes.find(p => p.kind === '3d').view); }")
    pg.wait_for_timeout(3500); settle(pg, ktx=False)
    lost = pg.evaluate("() => [window.__hp.app.settings.texPlain, window.__hp.libWantGpu()]")
    check('the 3D view stopped (graphics card) with compressed pictures in use: "as before" from then on, by itself', lost == [True, False] and pg.evaluate(VIEW)['ktx'] == 0, lost)
    pg.evaluate("() => { const H = window.__hp; H.app.setPicturesPlain(false); H.app.setLevel('auto'); }"); settle(pg, ktx=False)
    check('Auto again: Normal, the look as before', pg.evaluate(VIEW)['level'] == 'normal')
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); }"); settle(pg, ktx=True)
    v = pg.evaluate(VIEW); mbp = pg.evaluate(MB)
    check('phone: Auto picks Phone – the canvas at 1.5× (the screen has 2×), shadow 1024, the trees\' lighter versions from 20 / 60 m and the lighter far one',
          v['level'] == 'phone' and v['set'] == 'auto' and v['pr'] == 1.5 and v['shadow'] == 1024 and v['near'] == [20, 60] and v['vegFar'] == 3, v)
    check('phone: the material pictures compressed on the graphics card (KTX2)', v['ktx'] >= 10 and v['gpu'], v)
    pg.screenshot(path=SHOTS + 'levels-phone-dark.png')
    pg.evaluate("() => { window.__hp.app.settingsSheet(); }"); pg.wait_for_selector('#set-level')
    pg.evaluate("() => document.getElementById('set-level-field').scrollIntoView()"); pg.wait_for_timeout(300)
    st = pg.evaluate("() => ({ auto: document.querySelector('#set-level button[data-k=\"auto\"]').textContent, pressed: document.querySelector('#set-level button[aria-pressed=\"true\"]').dataset.k, pics: getComputedStyle(document.getElementById('set-pics-box')).display, why: document.getElementById('set-level-why').textContent, sw: document.documentElement.scrollWidth, iw: window.innerWidth, right: Math.max(...[...document.querySelectorAll('#set-level-field *')].map(e => e.getBoundingClientRect().right)) })")
    check('phone: Settings shows Auto (Phone) and why (touch screen, small), with "Pictures" Compressed / As before; nothing sticks out sideways',
          st['auto'] == 'Auto (Phone)' and st['pressed'] == 'auto' and st['pics'] != 'none' and 'touch' in st['why'] and st['sw'] <= st['iw'] and st['right'] <= st['iw'] + 1, st)
    pg.screenshot(path=SHOTS + 'levels-phone-settings.png')
    pg.tap('#set-pics button[data-k="true"]'); pg.wait_for_timeout(300)
    pg.tap('.scrim:last-child .dialog .dlg-foot button:has-text("Done")'); settle(pg, ktx=False)
    v = pg.evaluate(VIEW)
    check('phone: Pictures → As before: the plain pictures, none compressed', v['ktx'] == 0 and v['plain'] >= 10 and v['plainSet'], v)
    mbp2 = pg.evaluate(MB)
    print(f'   material pictures on the graphics card (phone, made-up house): compressed {mbp} MB, as before {mbp2} MB')
    check('… compressed was less memory than as before', mbp < mbp2 * 0.75, (mbp, mbp2))
    pg.evaluate("() => { const a = window.__hp.app; a.setPicturesPlain(false); a.setLevel('normal'); }"); settle(pg, ktx=False)
    v = pg.evaluate(VIEW)
    check('phone: Normal chosen – 2× canvas, shadow 2048, plain pictures, trees as before', v['level'] == 'normal' and v['pr'] == 2 and v['shadow'] == 2048 and v['ktx'] == 0 and v['near'] == [32, 90], v)
    pg.wait_for_timeout(800); pg.reload(); pg.wait_for_function("() => window.__hp && window.__hp.app", timeout=30000); pg.wait_for_timeout(2000)
    check('phone: … kept after a reload', pg.evaluate("() => window.__hp.level3d(window.__hp.app.settings)") == 'normal')
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
