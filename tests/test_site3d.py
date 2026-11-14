"""A lighter site in 3D (task 0029): the trees, shrubs and grasses of the garden, the street and the park are one shape
drawn many times (InstancedMesh), not copied into the merged meshes; trees far from the camera are drawn in a lighter
version (and only the trees in view); their shadows come from a fixed set the sun's shadow cameras see. Nothing is kept
hidden for tapping: a tap on a tree finds the tree drawn (the garden's own plant by its id). The site's triangles and
draw calls stay within a budget; the Show buttons off leave nothing of it held. The photo render gets plain meshes for
the trees. PC (light) and phone (dark). The owner's street, park and houses around: house/tests/test_site3d_own.py."""
from common import *

V = "window.__hp.app.panes[0].view"
# the site of the 3D view: its trees drawn many times, hidden copies, shapes held, triangles (each tree in the version
# for its distance from the camera, in view or not), and the site alone as drawn
SITE = """() => { const v = %s, r = v.renderer, G = v.group.children.find(c => c.userData.garden); if (!G) return null;
  const tri = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const out = { inst: 0, shadowInst: 0, trees: 0, vegHidden: 0, vegMeshes: 0, tri: 0, held: v.vegHeld(), groups: v.vegLod ? v.vegLod.length : 0 };
  G.traverse(o => { if (!o.isMesh) return; const u = o.userData;
    if (u.vegShadow) out.shadowInst++; else if (u.vegInst) out.inst++;
    else if (u.veg && !u.gline) { out.vegMeshes++; if (!o.visible) out.vegHidden++; }
    if (o.visible && !o.isInstancedMesh) out.tri += tri(o.geometry); });
  if (v.vegLod) { const gp = v.vegLod.G.position, c = v.camera.position; for (const g of v.vegLod) for (const it of g.list) { out.trees++; const d = it.c.clone().add(gp).distanceTo(c); out.tri += tri(g.ims[d < 32 ? 0 : d < 90 ? 1 : 2].geometry); } }
  const hid = []; for (const c of v.group.children) if (c !== G && c.visible) { c.visible = false; hid.push(c); }
  r.render(v.scene, v.camera); out.calls = r.info.render.calls; out.drawn = r.info.render.triangles;
  for (const c of hid) c.visible = true; v.needs = true;
  out.tri = Math.round(out.tri); return out; }""" % V
# per version (full, light, far) how many trees draw now (the trees that have lighter versions)
LEVELS = """() => { const v = %s, out = [0, 0, 0]; for (const g of v.vegLod || []) { if (g.ims[0] === g.ims[1]) continue; const seen = new Set(); g.ims.forEach((im, i) => { if (seen.has(im)) return; seen.add(im); out[i] += im.count; }); } return out; }""" % V
# the trees' shapes: full against the lighter versions (triangles), for the trees that have them
SHAPES = """() => { const v = %s, tri = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
  return (v.vegLod || []).filter(g => g.ims[0] !== g.ims[1]).map(g => g.ims.map(im => tri(im.geometry))); }""" % V
CAM = "([t, c]) => { const v = %s; v.anim = null; v.controls.target.set(...t); v.camera.position.set(...c); v.controls.update(); v.needs = true; }" % V
# the screen point of a street tree's crown (the one nearest a point), the camera put in front of it
AIM = """([near, dist]) => { const v = %s, A = window.__hp; let best = null;
  for (const g of v.vegLod || []) for (const it of g.list) { if (it.pick) continue; const d = Math.hypot(it.c.x - near[0], it.c.z - near[1]); if (!best || d < best.d) best = { d, c: it.c.clone().add(v.vegLod.G.position) }; }
  const c = best.c; v.anim = null; v.controls.target.copy(c); v.camera.position.set(c.x - dist * 0.6, c.y + dist * 0.35, c.z + dist * 0.72); v.controls.update(); v.camera.updateMatrixWorld(); v.needs = true;
  return [c.x, c.y, c.z]; }""" % V
TO_SCREEN = """(p) => { const v = %s, A = window.__hp; v.camera.updateMatrixWorld(); const q = new A.THREE.Vector3(...p).project(v.camera); const rc = v.renderer.domElement.getBoundingClientRect();
  return [rc.left + (q.x + 1) / 2 * rc.width, rc.top + (1 - q.y) / 2 * rc.height]; }""" % V
HIT = """([x, y]) => { const v = %s; const h = v.firstHit({ clientX: x, clientY: y }); if (!h) return null; const u = h.object.userData;
  return { veg: !!u.veg, inst: !!h.object.isInstancedMesh, merged: !!u.merged, around: !!u.around, pick: u.picks && h.instanceId != null ? u.picks[h.instanceId] : null, p: h.point.toArray() }; }""" % V

def to_3d(pg, phone=False):
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('view'); a.setDim('3d'); a.settings.light = 'day'; a.setScope('house'); a.refreshViews(false); }")
    pg.wait_for_timeout(5000); still(pg)

def show(pg, on):
    pg.evaluate("(on) => { const a = window.__hp.app; for (const k of ['garden', 'street', 'houses', 'park']) a.settings[k] = on; a.refreshViews(false); }", on)
    pg.wait_for_timeout(4000); still(pg)

def tap_tree(pg, phone=False):
    """a street tree from 14 m: the tap finds the tree drawn (one shape drawn many times), on its crown"""
    c = pg.evaluate(AIM, [[0, 0], 14]); pg.wait_for_timeout(800); still(pg)
    pt = pg.evaluate(TO_SCREEN, c)
    # (a few spots on the crown: the leaves are cards with gaps)
    for dx, dy in [(0, 0), (6, -8), (-8, 4), (10, 10), (-4, -14)]:
        h = pg.evaluate(HIT, [pt[0] + dx, pt[1] + dy])
        if h and h['veg']: break
    return h, c

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    open_example(pg)
    to_3d(pg)
    s = pg.evaluate(SITE)
    check('the plants are drawn as shapes drawn many times (instanced), with a fixed set for their shadows', s and s['inst'] > 0 and s['shadowInst'] > 0 and s['trees'] >= 5, s)
    check('no hidden copies of trees, shrubs or grasses kept for tapping', s and s['vegHidden'] == 0, s)
    lv = pg.evaluate(SHAPES)
    tot = [sum(f[i] for f in lv) for i in range(3)] if lv else [0, 0, 0]
    check('the trees have a light and a far version: at most ½ and ⅕ of their triangles', lv and tot[1] <= tot[0] / 2 and tot[2] <= tot[0] / 5, tot)
    # budget (the made-up site: a plot, two streets, 4 trees and 3 shrubs; before task 0029 18k triangles, 321 draw calls whole house)
    calls = pg.evaluate("() => { const v = %s, r = v.renderer; r.render(v.scene, v.camera); v.needs = true; return r.info.render.calls; }" % V)
    # (the owner's house: its own budget in house/tests/test_site3d_own.py)
    T, C = by_house(pg, (20000, 330), (170000, 470))
    check(f'budget: the site within {T // 1000}k triangles, the whole house within {C} draw calls', s['tri'] <= T and calls <= C, [s, calls])
    # far away all trees light; close by the tree in view full
    pg.evaluate(CAM, [[10, 0, 10], [-140, 120, 180]]); pg.wait_for_timeout(1200); still(pg)
    far = pg.evaluate(LEVELS)
    check('from 250 m: every tree in view in its far version', far[0] == 0 and far[2] > 0, far)
    h, c = tap_tree(pg)
    near = pg.evaluate(LEVELS)
    check('close by: the tree in front of you in its full version', near[0] >= 1, near)
    check('tapping a street tree finds the tree drawn (one shape drawn many times), on its crown', h and h['veg'] and h['inst'] and not h['merged'] and abs(h['p'][0] - c[0]) < 5 and abs(h['p'][2] - c[2]) < 5, [h, c])
    # the garden's own tree: found by its id
    gp = pg.evaluate("() => { const a = window.__hp.app; const pl = a.shownVersion().plan.garden.plants.find(x => x.kind === 'tree'); return pl && [pl.id, pl.x, pl.y]; }")
    pg.evaluate("""([x, y]) => { const v = %s, o = v.vegLod.G.position; v.anim = null; v.controls.target.set(x + o.x, 3, y + o.z); v.camera.position.set(x + o.x - 6, 9, y + o.z + 9); v.controls.update(); v.needs = true; }""" % V, gp[1:])
    pg.wait_for_timeout(1000); still(pg)
    pt = pg.evaluate(TO_SCREEN, pg.evaluate("([x, y]) => { const o = %s.vegLod.G.position; return [x + o.x, 3, y + o.z]; }" % V, gp[1:]))
    hits = [pg.evaluate(HIT, [pt[0] + dx, pt[1] + dy]) for dx, dy in [(0, 0), (8, -6), (-6, 8), (12, 4), (-10, -10)]]
    gh = next((x for x in hits if x and x['pick']), None)
    check("tapping the garden's own tree finds that plant", gh and gh['pick'] == {'plant': gp[0]}, hits)
    pg.screenshot(path=SHOTS + 'site3d-garden-tree.png')
    # the photo render: the trees as plain meshes while it renders, then back
    fl = pg.evaluate("""() => { const v = %s, G = v.vegLod.G; const n0 = G.children.length; const back = v.vegFlatten();
      let plain = 0, shown = 0; G.traverse(o => { if (o.userData.vegInst && o.visible) shown++; }); for (const c of G.children) if (c.isMesh && !c.isInstancedMesh && c.material && c.material.type === 'MeshLambertMaterial' && c.castShadow) plain++;
      const added = G.children.length - n0; back(); let after = 0; G.traverse(o => { if (o.userData.vegInst && o.visible) after++; });
      return { added, shown, after, n: G.children.length - n0 }; }""" % V)
    check('photo render: the trees become plain meshes for the path tracer and come back after', fl['added'] > 0 and fl['shown'] == 0 and fl['after'] > 0 and fl['n'] == 0, fl)
    # an edit elsewhere keeps the garden (reuse.js) with its trees drawn
    pg.evaluate("() => { const a = window.__hp.app; a.settings.light = 'evening'; a.refreshViews(false); }"); pg.wait_for_timeout(3000); still(pg)
    ev = pg.evaluate(SITE)
    check('evening light: the trees still drawn many times', ev and ev['inst'] > 0 and ev['groups'] == s['groups'], ev)
    pg.evaluate("() => { const a = window.__hp.app; a.settings.light = 'day'; a.refreshViews(false); }"); pg.wait_for_timeout(3000); still(pg)
    # Show buttons off: nothing of the site held
    show(pg, False)
    off = pg.evaluate("() => { const v = %s; return { garden: !!v.group.children.find(c => c.userData.garden), held: v.vegHeld(), lod: !!v.vegLod }; }" % V)
    check('Garden, Street, Neighbours and Water & park off: no site in 3D and no tree shapes held', off == {'garden': False, 'held': 0, 'lod': False}, off)
    show(pg, True)
    on = pg.evaluate(SITE)
    check('switched on again: the trees are back', on and on['inst'] == s['inst'] and on['held'] > 0, on)
    # the views that make drawings keep one mesh per plant (not merged)
    dv = pg.evaluate("""() => { window.__hpNoBatch = true; window.__hp.app.refreshViews(false); return true; }""")
    pg.wait_for_timeout(3500); still(pg)
    nb = pg.evaluate(SITE)
    check('a view that is not merged: one mesh per plant, no instances', nb and nb['inst'] == 0 and nb['vegMeshes'] > 0 and not pg.evaluate("() => !!%s.vegLod" % V), nb)
    pg.evaluate("() => { window.__hpNoBatch = false; window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(3500); still(pg)
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    to_3d(pg, True)
    s = pg.evaluate(SITE)
    check('phone: the plants drawn many times, no hidden copies', s and s['inst'] > 0 and s['vegHidden'] == 0, s)
    h, c = tap_tree(pg, True)
    check('phone: a tap on a street tree finds it', h and h['veg'] and h['inst'], [h, c])
    pg.screenshot(path=SHOTS + 'site3d-phone-tree.png')
    show(pg, False)
    off = pg.evaluate("() => { const v = %s; return { garden: !!v.group.children.find(c => c.userData.garden), held: v.vegHeld() }; }" % V)
    check('phone: the site switched off holds no tree shapes', off == {'garden': False, 'held': 0}, off)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()

sys.exit(summary())
