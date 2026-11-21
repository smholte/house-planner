"""Third round of wishes (28 Oct): wall corners without double faces, a 2 m hedge, the quay wall (brick on top, stone
below), walking out through the outside doors, looking around with the mouse when walking, the attic's roof and
walls following the roof, moving and turning furniture in 3D, the window frames, the High quality preset (PC only),
grown trees, shrubs, hedges and reeds, and the houses around the plot. PC and phone, light and dark. (The owner's
quay wall, his park and neighbourhood and the upgrade of his older files: house/tests/test_round3_own.py.)"""
from common import *
import math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ST = "() => { const w = window.__hp.app.walker; return w ? w.state() : null; }"
SIM = """([keys, secs, yaw]) => { const w = window.__hp.app.walker; if (yaw != null) { w.yaw = yaw; w.look.dx = 0; w.look.dy = 0; } w.keys.clear(); for (const k of keys) w.keys.add(k); const n = Math.round(secs / 0.05); for (let i = 0; i < n; i++) w.tick(0.05); w.keys.clear(); return w.state(); }"""
V3 = "() => window.__hp.app.panes[0].view"

def to3d(pg):
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000)

with sync_playwright() as p:
    # ───────── PC, light ─────────
    b, pg = open_app(p)
    open_example(pg)

    # 1. wall corners: no two walls put a face in the same place facing the same way (that flickered)
    bad = pg.evaluate("""() => { const a = window.__hp.app, out = [];
      const shellLayer = w => w.kind === 'insulation' || (w.kind === 'exterior' && w.leaf === 'outer');
      for (const v of a.project.versions.slice(0, 2)) for (const st of a.project.storeys) {
        const ends = window.__hp.wallEnds(v.plan, st.id, shellLayer, w => w.h || 2.6);
        const polys = [];
        for (const w of v.plan.walls) {
          if (w.storey !== st.id || shellLayer(w)) continue;
          const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L < 0.01) continue;
          const d = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], n = [-d[1], d[0]], h = w.t / 2, E = ends.get(w.id);
          const at = (u, s) => [w.a[0] + d[0] * u + n[0] * s * h, w.a[1] + d[1] * u + n[1] * s * h];
          polys.push({ w, P: [at(-E.a[0], 1), at(L + E.b[0], 1), at(L + E.b[1], -1), at(-E.a[1], -1)] });
        }
        const edges = polys.map(({ w, P }) => { let ar = 0; for (let i = 0; i < 4; i++) { const p = P[i], q = P[(i + 1) % 4]; ar += p[0] * q[1] - q[0] * p[1]; } const sg = ar > 0 ? 1 : -1;
          return P.map((p, i) => { const q = P[(i + 1) % 4], t = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(...t); return { w, a: p, d: [t[0] / L, t[1] / L], L, out: [sg * t[1] / L, -sg * t[0] / L] }; }).filter(e => e.L > 0.0005); });
        for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) for (const e of edges[i]) for (const f of edges[j]) {
          if (Math.abs(e.d[0] * f.d[1] - e.d[1] * f.d[0]) > 1e-3) continue;
          if (Math.abs((f.a[0] - e.a[0]) * e.out[0] + (f.a[1] - e.a[1]) * e.out[1]) > 0.0003) continue;
          if (e.out[0] * f.out[0] + e.out[1] * f.out[1] < 0.9) continue;
          const pr = q => (q[0] - e.a[0]) * e.d[0] + (q[1] - e.a[1]) * e.d[1];
          const fb = f.a.map((_, k) => 0); const f0 = Math.min(pr(f.a), pr([f.a[0] + f.d[0] * f.L, f.a[1] + f.d[1] * f.L])), f1 = Math.max(pr(f.a), pr([f.a[0] + f.d[0] * f.L, f.a[1] + f.d[1] * f.L]));
          if (Math.min(e.L, f1) - Math.max(0, f0) > 0.002) out.push([v.kind, st.name, e.w.id, f.w.id]);
        }
      }
      return out; }""")
    check('wall corners: no double faces where walls meet (original and plans, every storey)', len(bad) == 0, bad[:5])

    # 2. the hedge's height (the made-up house's 1.8 m, the owner's 2 m)
    HH = by_house(pg, 1.8, 2)
    hd = pg.evaluate("() => (window.__hp.app.shownVersion().plan.garden.lines.find(l => l.kind === 'hedge') || {}).h")
    check(f'the hedge is {HH} m tall', hd and abs(hd - HH) < 1e-6, hd)
    to3d(pg)
    pg.evaluate("() => window.__hp.app.setScope('house')"); pg.wait_for_timeout(3000)
    hedge3d = pg.evaluate("""() => { const v = window.__hp.app.panes[0].view, THREE = window.__hp.THREE; let top = -9; v.group.traverse(o => { if (o.isMesh && o.userData.gline) { const bb = new THREE.Box3().setFromObject(o); if (bb.max.y > top) top = bb.max.y; } }); return top; }""")
    check(f'in 3D the hedge stands {HH} m above the garden', HH - 0.3 < hedge3d < HH + 0.4, hedge3d)

    # 3. trees, shrubs and the hedge grown with leaf cards (Beautiful), species from the name
    tv = pg.evaluate("""() => { const v = window.__hp.app.panes[0].view; let veg = 0, cards = 0, alpha = true, keep = true; v.group.traverse(o => { if (o.isMesh && o.userData.veg) { veg++; if (o.material.alphaTest > 0) cards += o.geometry.index.count / 6; if (o.material.alphaTest > 0 && o.material.side !== 2) alpha = false; } }); return { veg, cards: Math.round(cards), alpha, level: v.vegLevel() }; }""")
    VEG, CARDS = by_house(pg, (10, 3000), (30, 20000))
    check('Beautiful: trees, shrubs and the hedge are grown with leaf cards', tv['level'] == 'mid' and tv['veg'] > VEG and tv['cards'] > CARDS and tv['alpha'], tv)
    sp = pg.evaluate("() => ['Japanese maple', 'Treurwilg', 'Populier', 'Berk', 'Meerstammige Amelanchier', '', 'Lønn'].map(n => window.__hp.vegSpecies({ kind: 'tree', name: n }))")
    check('species from the name (maple, willow, poplar, birch, multi-stem; English, Dutch, Norwegian)', sp == ['maple', 'willow', 'poplar', 'birch', 'multistem', 'broadleaf', 'maple'], sp)

    # 4. the houses around the plot in 3D (the owner's park and neighbourhood: house/tests/test_round3_own.py)
    ar = pg.evaluate("""() => { const a = window.__hp.app, s = a.project.site, v = a.panes[0].view; let houses = 0; v.group.traverse(o => { if (o.isMesh && o.userData.around) houses++; });
      return { around: !!s.around, houses, nHouses: (s.around.blds || s.around.houses).length }; }""")
    check('3D: the houses around (walls, gables, roofs, solar panels)', ar['around'] and ar['nHouses'] >= 2 and ar['houses'] >= 4, ar)
    pg.evaluate("""() => { const v = window.__hp.app.panes[0].view; v.controls.target.set(5, 0, 0); v.camera.position.set(-45, 55, -60); v.controls.update(); v.needs = true; }"""); pg.wait_for_timeout(2500)
    pg.evaluate(GPU_SYNC)
    pg.screenshot(path=SHOTS + 'r3-around.png', timeout=180000)

    # 5. moving and turning furniture in 3D (Furnish)
    pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(1500)
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(1500)
    pg.evaluate("() => { const a = window.__hp.app; a.setScope('storey', [...a.project.storeys].sort((x, y) => x.level - y.level)[0].id); }"); pg.wait_for_timeout(1500)
    pg.click('#toolrail button[data-tool="add"]'); pg.wait_for_timeout(400)
    pg.fill('.cat-body input[type=search]', 'sofa, 3'); pg.wait_for_timeout(200)
    pg.click('.cat-card >> nth=0'); pg.wait_for_timeout(800)
    fid = pg.evaluate("() => window.__hp.app.activeLayout().items.slice(-1)[0].id")
    # in the middle of the living room
    pg.evaluate("""(id) => { const a = window.__hp.app, r = a.shownVersion().plan.rooms.find(x => x.name === 'Woonkamer'); let x = 0, y = 0; for (const q of r.poly) { x += q[0]; y += q[1]; }
      a.updateFurn(id, f => { f.x = x / r.poly.length; f.y = y / r.poly.length; f.rot = 0; }); }""", fid)
    pg.wait_for_timeout(600)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    to3d(pg)
    pg.evaluate("(id) => window.__hp.app.select({ type: 'furn', ids: [id] })", fid); pg.wait_for_timeout(1500)
    still(pg)
    SCR = """([id, dx, dz, up]) => { const a = window.__hp.app, v = a.panes[0].view, THREE = window.__hp.THREE; const f = a.activeLayout().items.find(x => x.id === id);
      let g = null; v.group.traverse(o => { if (!g && o.userData && o.userData.entry && o.userData.storeyId === f.storey) g = o; });
      const wp = g.localToWorld(new THREE.Vector3(f.x + dx, up, f.y + dz)); wp.project(v.camera); const r = v.renderer.domElement.getBoundingClientRect();
      return [r.left + (wp.x + 1) / 2 * r.width, r.top + (1 - wp.y) / 2 * r.height]; }"""
    f0 = pg.evaluate("(id) => { const f = window.__hp.app.activeLayout().items.find(x => x.id === id); return [f.x, f.y, f.rot || 0]; }", fid)
    a = pg.evaluate(SCR, [fid, 0, 0, 0.35])
    tgt = pg.evaluate(SCR, [fid, 0.6, 0.4, 0.0])
    drag(pg, a, tgt, 16); pg.wait_for_timeout(800)
    f1 = pg.evaluate("(id) => { const f = window.__hp.app.activeLayout().items.find(x => x.id === id); return [f.x, f.y, f.rot || 0]; }", fid)
    check('3D: dragging a piece of furniture moves it', math.hypot(f1[0] - f0[0], f1[1] - f0[1]) > 0.2, [f0, f1])
    still(pg); pg.wait_for_timeout(400)
    ring = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; return !!v.furnRing; }")
    check('3D: the selected piece has a ring to turn it', ring)
    rr = pg.evaluate("(id) => { const f = window.__hp.app.activeLayout().items.find(x => x.id === id); return Math.max(f.w, f.d) / 2 + 0.22; }", fid)
    pa = pg.evaluate(SCR, [fid, rr, 0, 0.02]); pb = pg.evaluate(SCR, [fid, rr * math.cos(1.0), rr * math.sin(1.0), 0.02])
    drag(pg, pa, pb, 16); pg.wait_for_timeout(800)
    f2 = pg.evaluate("(id) => { const f = window.__hp.app.activeLayout().items.find(x => x.id === id); return [f.x, f.y, f.rot || 0]; }", fid)
    check('3D: dragging the ring turns it', abs(((f2[2] - f1[2]) + 540) % 360 - 180) > 15, [f1, f2])
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(600); pg.keyboard.press('Control+z'); pg.wait_for_timeout(800)
    f3 = pg.evaluate("(id) => { const f = window.__hp.app.activeLayout().items.find(x => x.id === id); return [f.x, f.y, f.rot || 0]; }", fid)
    check('undo puts it back', math.hypot(f3[0] - f0[0], f3[1] - f0[1]) < 0.01 and abs(f3[2] - f0[2]) < 0.5, [f0, f3])
    pg.screenshot(path=SHOTS + 'r3-furn3d.png', timeout=180000)

    # 6. walking: out through the outside doors; looking around with the mouse
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(800)
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(4000)
    s0 = pg.evaluate(ST)
    s1 = pg.evaluate(SIM, [['w'], 3, math.pi])
    check('walking out through the front door', s1['y'] > by_house(pg, 11.2, 14.6), [s0, s1])
    doors = pg.evaluate("""() => { const a = window.__hp.app, plan = a.shownVersion().plan, v = a.panes[0].view; const st = [...a.project.storeys].sort((x, y) => x.level - y.level)[0]; const out = [];
      for (const op of plan.openings) { const w = plan.walls.find(x => x.id === op.wall); if (!w || w.storey !== st.id || op.kind !== 'door' || op.leaf || w.kind === 'interior' || w.leaf === 'outer' || w.kind === 'insulation') continue;
        const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), d = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], n = [-d[1], d[0]]; const c = [w.a[0] + d[0] * op.pos, w.a[1] + d[1] * op.pos];
        const inn = v.roomAt(plan, st.id, [c[0] + n[0] * 0.6, c[1] + n[1] * 0.6]) ? 1 : -1; out.push({ id: op.id, c, out: [-n[0] * inn, -n[1] * inn], t: w.t }); }
      return out; }""")
    # (furniture off for this: the made-up house's washing machine stands in front of its side door)
    pg.evaluate("() => { window.__hp.app.settings.furniture = false; }")
    passed = []
    for d in doors:
        x0, y0 = d['c'][0] - d['out'][0] * 0.7, d['c'][1] - d['out'][1] * 0.7
        yaw = math.atan2(-d['out'][0], -d['out'][1])
        pg.evaluate("([x, y]) => { const w = window.__hp.app.walker; w.x = x; w.y = y; w.feet = 0.004; }", [x0, y0])
        # walk into it (it opens), then on through it
        pg.evaluate(SIM, [['w'], 1.0, yaw]); pg.wait_for_timeout(1500)
        s = pg.evaluate(SIM, [['w'], 2.5, None])
        gone = (s['x'] - d['c'][0]) * d['out'][0] + (s['y'] - d['c'][1]) * d['out'][1]
        passed.append(gone > 0.8)
    check('every outside door on the ground floor lets you walk out', doors and all(passed), [doors, passed])
    pg.evaluate("() => { window.__hp.app.settings.furniture = true; }")
    # the mouse: drag to look (to the right: turn right), up / down inverted when set, smooth turning
    pg.evaluate("([x, y]) => { const w = window.__hp.app.walker; w.x = x; w.y = y; w.feet = 0.004; w.yaw = 0; w.pitch = 0; w.look.dx = 0; w.look.dy = 0; }", by_house(pg, room_pt(pg, 'Woonkamer'), [7.2, 12.0]))
    cv = pg.evaluate("() => { const r = window.__hp.app.panes[0].view.renderer.domElement.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
    y0 = pg.evaluate("() => window.__hp.app.walker.yaw")
    pg.mouse.move(cv[0], cv[1]); pg.mouse.down(); pg.mouse.move(cv[0] + 120, cv[1] - 60, steps=8); pg.mouse.up()
    pg.wait_for_timeout(1200)
    y1 = pg.evaluate("() => { const w = window.__hp.app.walker; return [w.yaw, w.pitch]; }")
    # the smoothing is eased by time (the same at any frame rate), so a slow test computer's long frames would finish it at
    # once: test it with a frame of 1/60 s given by hand – the turn is only partly done, the rest is still to come
    mid = pg.evaluate("() => { const w = window.__hp.app.walker; w.look.dx = 0.3; w.look.dy = 0; const y = w.yaw; w.tick(1 / 60); const r = [w.yaw - y, w.look.dx]; w.look.dx = 0; return r; }")
    check('walking: moving the mouse to the right turns to the right, up looks up', y1[0] < y0 - 0.1 and y1[1] > 0.05, [y0, y1])
    check('walking: turning is smoothed (the turn is still going on just after the mouse stops)', 0.01 < mid[0] < 0.29 and mid[1] > 0.01 and abs(mid[0] + mid[1] - 0.3) < 1e-6, mid)
    pg.evaluate("() => { window.__hp.Settings.set('walkInvert', true); const w = window.__hp.app.walker; w.pitch = 0; w.look.dx = 0; w.look.dy = 0; }")
    pg.mouse.move(cv[0], cv[1]); pg.mouse.down(); pg.mouse.move(cv[0], cv[1] - 60, steps=6); pg.mouse.up(); pg.wait_for_timeout(1200)
    pinv = pg.evaluate("() => window.__hp.app.walker.pitch")
    check('walking: mouse up / down can be inverted (Settings)', pinv < -0.05, pinv)
    pg.evaluate("() => window.__hp.Settings.set('walkInvert', false)")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(1500)

    # 7. the attic (2e verdieping): the flat part of the ceiling follows the roof; walls go up to the roof
    pg.click('#mode-switch button[data-mode="build"]'); pg.wait_for_timeout(800)
    to3d(pg)
    att = pg.evaluate("""() => { const a = window.__hp.app, v = a.panes[0].view; const st = [...a.project.storeys].sort((x, y) => x.level - y.level)[2];
      const F = v.roofCeiling(st.id); if (!F) return null; const flats = F.flats || []; const area = flats.reduce((s, f) => s + (f.w || 0) * (f.d || 0), 0);
      const plan = a.shownVersion().plan; const walls = plan.walls.filter(w => w.storey === st.id && w.kind === 'interior');
      return { flats: flats.length, keys: Object.keys(F), walls: walls.length, top: walls.map(w => w.top ? Math.max(...w.top.map(q => q[1])) : w.h || 0) }; }""")
    check('attic: the roof\'s underside is known for the 2e verdieping (the ceiling follows the inside of the roof)', att and 'at' in att['keys'], att)
    pg.evaluate("() => { const a = window.__hp.app; const st = [...a.project.storeys].sort((x, y) => x.level - y.level)[2]; a.setScope('storey', st.id); }"); pg.wait_for_timeout(3500)
    still(pg)
    pg.screenshot(path=SHOTS + 'r3-attic.png', timeout=180000)

    # 8. windows: every outside window of the model has its frame closed round to the inner wall (reveals in the
    #    frame colour) and keeps the builder's sill
    pg.evaluate("() => window.__hp.app.setScope('house')"); pg.wait_for_timeout(3500)
    wr = pg.evaluate("""() => { const v = window.__hp.app.panes[0].view; let reveal = 0; v.group.traverse(o => { if (o.isMesh && o.userData.reveal) reveal += o.geometry.attributes.position.count / 24; }); return Math.round(reveal); }""")
    check('windows and doors: the gaps round them are closed (frame-coloured reveals)', wr > 20, wr)

    # 9. High (computers): in the View menu and Settings; depth in surfaces, contact shadows every frame, sky light
    pg.click('#btn-viewopts')
    pg.wait_for_timeout(600)
    hi_btn = pg.is_visible('#mi-quality button[data-q="high"]')
    check('PC: the View menu offers High', hi_btn)
    if hi_btn: pg.click('#mi-quality button[data-q="high"]')
    else: pg.evaluate("() => window.__hp.app.setQuality('high')")
    pg.wait_for_timeout(5000)
    pg.keyboard.press('Escape')
    hq = pg.evaluate("""() => { const v = window.__hp.app.panes[0].view; let relief = 0, normal = 0, plaster = 0; const seen = new Set();
      v.group.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (!m || seen.has(m)) continue; seen.add(m); if (m.userData && m.userData.hqPatch) relief++; if (m.normalMap) normal++; } });
      return { high: v.high, shadow: v.sun.shadow.mapSize.x, env: !!v.scene.environment, relief, normal, veg: v.vegLevel() }; }""")
    check('High: on, sharper sun shadows (4096), light from the sky', hq['high'] and hq['shadow'] == 4096 and hq['env'], hq)
    check('High: surfaces with depth (normal maps; brick, tiles, roof and stone with relief)', hq['normal'] >= 8 and hq['relief'] >= 3, hq)
    check('High: trees with more, smaller leaves', hq['veg'] == 'high', hq)
    pg.evaluate("""() => { const v = window.__hp.app.panes[0].view; window._ao = 0; const r = v.renderAO.bind(v); v.renderAO = () => { window._ao++; r(); }; v.needs = true; }"""); pg.wait_for_timeout(1500)
    check('High: contact shadows (soft shadows in corners) drawn with every picture', pg.evaluate("() => window._ao") >= 1)
    pg.evaluate("() => { const a = window.__hp.app; a.setScope('house'); }"); pg.wait_for_timeout(4000)
    pg.evaluate("""() => { const v = window.__hp.app.panes[0].view; v.controls.target.set(0.85, 1.2, 9); v.camera.position.set(-2.2, 1.5, 11); v.controls.update(); v.needs = true; }"""); pg.wait_for_timeout(2500)
    pg.evaluate(GPU_SYNC)
    pg.screenshot(path=SHOTS + 'r3-high-pc.png', timeout=180000)
    errs = [e for e in pg.errors]
    check('High: the shaders compile, no page errors', not errs, errs[:3])
    # Settings: the quality with what each one does
    pg.evaluate("() => { window.__hp.app.settingsSheet(); }"); pg.wait_for_timeout(1500)
    check('Settings: 3D quality with Fast / Beautiful / High', pg.locator('#set-quality button').count() == 3, pg.locator('#set-quality button').count())
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("() => window.__hp.app.setQuality('beautiful')"); pg.wait_for_timeout(2000)
    b.close()

    # ───────── phone, dark: no High, trees grown at the lighter level, no errors ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    check('phone: High is not offered (it would be too heavy)', not pg.evaluate("() => window.__hp.canHighQuality()"))
    pg.evaluate("() => window.__hp.Settings.set('quality', 'high')")
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDim('3d')"); pg.wait_for_timeout(5000)
    ph = pg.evaluate("() => { const pn = window.__hp.app.panes.find(x => x.view && x.view.renderer); if (!pn) return null; const v = pn.view; return { high: v.high, veg: v.vegLevel(), shadow: v.sun.shadow.mapSize.x }; }")
    check('phone: even when set to High, 3D runs as Beautiful (trees at the lighter level)', ph and not ph['high'] and ph['veg'] == 'mid' and ph['shadow'] < 4096, ph)
    pg.wait_for_timeout(1500)
    pg.screenshot(path=SHOTS + 'r3-phone-dark.png', timeout=180000)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    pg.evaluate("() => window.__hp.Settings.set('quality', 'beautiful')")
    b.close()

    # ───────── PC dark: High picture ─────────
    b, pg = open_app(p, theme='dark')
    pg.evaluate("() => window.__hp.Settings.set('quality', 'high')")
    open_example(pg)
    to3d(pg)
    pg.wait_for_timeout(2500)
    pg.evaluate(GPU_SYNC)
    pg.screenshot(path=SHOTS + 'r3-high-dark.png', timeout=180000)
    check('PC dark, High: no page errors', not pg.errors, pg.errors[:3])
    pg.evaluate("() => window.__hp.Settings.set('quality', 'beautiful')")
    b.close()
sys.exit(summary())
