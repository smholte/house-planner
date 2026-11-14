"""Eighth round (30 Oct): faster and more real 3D. What never moves is drawn in one go per material (about ten times
fewer draw calls) and looks exactly the same; tapping, walking, doors and the gate still work on the pieces; the
views that make drawings are not merged. Glass and water reflect the sky; grass and paving get patches over the
area; walking by day has a sky with clouds and a far haze; phones get the soft shadows in corners (at half size).
PC and phone."""
from common import *
from PIL import Image, ImageChops

CALLS = """() => { const v = window.__hp.app.panes[0].view, r = v.renderer; r.render(v.scene, v.camera); let merged = 0, batches = 0; v.group.traverse(o => { if (o.userData && o.userData.merged) merged++; if (o.userData && o.userData.batch) batches++; }); v.needs = true; return { calls: r.info.render.calls, merged, batches }; }"""
CAM = "([t, c]) => { const v = window.__hp.app.panes[0].view; v.controls.target.set(...t); v.camera.position.set(...c); v.controls.update(); v.needs = true; }"

def diff(a, b):
    d = ImageChops.difference(Image.open(a).convert('RGB'), Image.open(b).convert('RGB')).convert('L')
    return sum(1 for v in d.tobytes() if v > 40)

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(500)
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000)
    pg.click('#storey-tabs button:has-text("Whole house")'); pg.wait_for_timeout(4000)
    pg.evaluate(CAM, [[9, 2, 6], [-12, 22, 34]]); pg.wait_for_timeout(1500); still(pg)
    on = pg.evaluate(CALLS)
    pg.evaluate("() => { window.__hpNoBatch = true; window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(4000); still(pg)
    off = pg.evaluate(CALLS)
    # (pieces merged: the owner's house over 500, the smaller made-up one over 400)
    check('the whole house: about ten times fewer draw calls (what never moves in one go per material)', on['merged'] > by_house(pg, 400, 500) and on['batches'] > 20 and off['merged'] == 0 and on['calls'] * 5 < off['calls'], [on, off])
    # the same picture (without the soft shadows in corners, which come a moment later; the trees all in their full
    # version, with their full shadows – task 0029 draws trees far away lighter, which is not what is compared here)
    pg.evaluate("() => { window.__hp.app.settings.ao = false; window.__hpVegFull = true; }")
    pg.evaluate("() => { window.__hpNoBatch = true; window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(3500); still(pg)
    pg.screenshot(path=SHOTS + 'r8-unmerged.png')
    pg.evaluate("() => { window.__hpNoBatch = false; window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(3500); still(pg)
    pg.screenshot(path=SHOTS + 'r8-merged.png')
    n = diff(SHOTS + 'r8-unmerged.png', SHOTS + 'r8-merged.png')
    check('merged it looks exactly the same (pixels that differ: < 0.1 %)', n < 1000, n)
    pg.evaluate("() => { delete window.__hp.app.settings.ao; window.__hpVegFull = false; }")
    # the pieces are still found: tapping a room in 3D
    pg.click('#mode-switch button[data-mode="build"]'); pg.wait_for_timeout(1200)
    pg.evaluate("() => { const a = window.__hp.app; a.setScope('storey', [...a.project.storeys].sort((x, y) => x.level - y.level)[0].id); }"); pg.wait_for_timeout(3000)
    pg.evaluate(CAM, [[7, 0, 8], [7, 14, 22]]); pg.wait_for_timeout(1500); still(pg)
    pt = pg.evaluate("""() => { const a = window.__hp.app, v = a.panes[0].view, THREE = window.__hp.THREE; const r = a.shownVersion().plan.rooms.find(x => x.name === 'Woonkamer'); let x = 0, y = 0; for (const q of r.poly) { x += q[0]; y += q[1]; }
      const p = new THREE.Vector3(x / r.poly.length, 0.05, y / r.poly.length).project(v.camera); const rc = v.renderer.domElement.getBoundingClientRect(); return [rc.left + (p.x + 1) / 2 * rc.width, rc.top + (1 - p.y) / 2 * rc.height]; }""")
    pg.mouse.click(pt[0], pt[1]); pg.wait_for_timeout(1200)
    sel = pg.evaluate("() => { const s = window.__hp.app.selection; return s && [s.type, (window.__hp.app.shownVersion().plan.rooms.find(r => r.id === s.id) || {}).name]; }")
    check('Build: tapping the floor of the Woonkamer in 3D selects it', sel == ['room', 'Woonkamer'], sel)
    hit = pg.evaluate("([x, y]) => { const v = window.__hp.app.panes[0].view; const h = v.firstHit({ clientX: x, clientY: y }); return h && [h.object.userData.merged === true, !!h.object.userData.batch]; }", pt)
    # (a piece alone in its buckets is not copied at all since task 0029: then it is drawn and found itself)
    check('a ray finds the piece itself, not the merged mesh', hit and not hit[1], hit)
    # the drawings are made from pieces that are not merged
    pg.evaluate("() => { const a = window.__hp.app; if (a.drawingView) a.drawingView(); }")
    dv = pg.evaluate("() => { const a = window.__hp.app; const d = a._dv; return d ? [!!d.opts.noBatch, d.batched || 0] : null; }")
    check('the view for drawings is not merged', dv is None or (dv[0] and dv[1] == 0), dv)
    # glass and water reflect the sky; grass and paving have patches over the area
    looks = pg.evaluate("""() => { const v = window.__hp.app.panes[0].view; let glass = null, water = null, grass = null, tiles = null; v.group.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (!m) continue;
        if (m.transparent && m.color && ['a8c8d8', '9ebdcc'].includes(m.color.getHexString())) glass = glass || [!!m.envMap, m.envMapIntensity];
        if (o.userData.water) water = water || [!!m.envMap, m.envMapIntensity];
        if (m.userData.macro === 'grass') grass = true; if (m.userData.macro === 'hard') tiles = true; } });
      const progs = (v.renderer.info.programs || []).map(p => p.cacheKey).join('|'); return { glass, water, grass, tiles, macroProg: /macro-grass/.test(progs) && /macro-hard/.test(progs) }; }""")
    check('glass and water reflect the sky; grass and paving have patches over the area (in the shaders)', looks['glass'] and looks['glass'][0] and looks['water'] and looks['water'][0] and looks['grass'] and looks['tiles'] and looks['macroProg'], looks)
    # walking by day: the sky and a far haze; not in the evening
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(4000)
    pg.evaluate("() => { const w = window.__hp.app.walker; w.x = 3.5; w.y = -4.5; w.feet = -0.13; w.yaw = Math.PI + 0.35; w.pitch = 0.05; w.updateCamera(); window.__hp.app.panes[0].view.needs = true; }"); pg.wait_for_timeout(1500); still(pg)
    sky = pg.evaluate("() => { const s = window.__hp.app.panes[0].view.scene; return [!!(s.background && s.background.isTexture), s.fog ? [s.fog.near, s.fog.far] : null]; }")
    check('walking by day: a sky with clouds and a haze far away (from 80 m)', sky[0] and sky[1] and sky[1][0] >= 60, sky)
    pg.screenshot(path=SHOTS + 'r8-walk-sky.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(1500)
    sky2 = pg.evaluate("() => { const s = window.__hp.app.panes[0].view.scene; return [!!(s.background && s.background.isTexture), !!s.fog]; }")
    check('… and the plain background again when you stop walking', sky2 == [False, False], sky2)
    pg.evaluate("() => { const a = window.__hp.app; a.settings.light = 'evening'; a.refreshViews(false); }"); pg.wait_for_timeout(1500)
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(4000)
    sky3 = pg.evaluate("() => { const s = window.__hp.app.panes[0].view.scene; return [!!(s.background && s.background.isTexture), !!s.fog]; }")
    check('walking in the evening: no day sky', sky3 == [False, False], sky3)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(800)
    pg.evaluate("() => { const a = window.__hp.app; a.settings.light = 'day'; a.refreshViews(false); }")
    check('no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone: the soft shadows in corners, at half size, when the view stands still ─────────
    b, pg = open_app(p, phone=True, ao=True)
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(500)
    pg.tap('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(5000); still(pg); pg.wait_for_timeout(4000); pg.evaluate(GPU_SYNC)
    ao = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; return [v.aoWanted(), v.aoScale, !!v.ao, v.ao ? v.ao.pass.width || (v.ao.pass.gtaoMaterial && v.ao.pass.gtaoMaterial.uniforms.resolution.value.x) : 0, v.renderer.domElement.width]; }")
    check('phone: soft shadows in corners, at half size', ao[0] and ao[1] == 0.5 and ao[2], ao)
    c = pg.evaluate(CALLS)
    check('phone: one storey takes about 120 draw calls (it was about 930)', c['calls'] < 250, c)
    pg.screenshot(path=SHOTS + 'r8-phone.png')
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
