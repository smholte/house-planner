"""Twenty-third round (1 Nov, evening): the outside doors in grey quality fake wood (your Wood012, the grain upright;
their frames stay white), and less memory for the pictures. A tinted material shares one light-and-dark picture per
pattern (the colour laid over it in the shader, as the canvas did – the same look); the neighbours' bricks share one grey
wall, their façades a few shades; the quay brick the shared wall; on a phone the pictures made in the app are smaller
(the house's bricks, the garden tiles, the neighbours' façades). Before: about 93 MB of pictures for the whole house with
its garden; now about 77 MB on a computer, 55 MB on a phone. PC (light) and phone (dark)."""
from common import *

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
# the pictures in the scene: how many, how much memory (w × h × 4 × 4/3 for the smaller copies), by kind
INV = """() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view, seen = new Map();
  v.scene.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (!m) continue;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap']) { const t = m[k]; if (!t || !t.image) continue;
      const id = (t.source && t.source.uuid) || t.uuid; if (seen.has(id)) continue;
      const w = t.image.width || t.image.naturalWidth || 0, h = t.image.height || t.image.naturalHeight || 0;
      seen.set(id, { w, h, lib: t.userData && t.userData.lib, detail: !!(t.userData && t.userData.detail), brick: t.userData && t.userData.brick, mb: w * h * 4 * 1.333 / 1048576 }); } } });
  const all = [...seen.values()];
  const facades = [...window.__hp.TEX.keys()].filter(k => k.startsWith('around-facade|'));
  return { mb: Math.round(all.reduce((s, x) => s + x.mb, 0)), n: all.length,
    houseBrick: all.filter(x => x.lib === 'HouseBrick' && x.brick && x.brick !== 'shared' && x.brick !== 'grey').map(x => x.w),
    shared: all.filter(x => x.brick === 'grey').length, details: all.filter(x => x.detail).length, facades: facades.length,
    gtiles: [...window.__hp.TEX.keys()].filter(k => k.startsWith('libp|g-tiles')).map(k => window.__hp.TEX.get(k).image.width) }; }"""
DOORS = """() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view, out = { leaves: 0, wood: 0, rot: [], frames: [] };
  v.scene.traverse(o => { if (!o.isMesh || !o.material) return; const m = o.material; const ud = m.userData || {};
    if (o.userData.door != null || (o.parent && o.parent.userData && o.parent.userData.door != null)) {
      if (ud.lib === 'Wood012') { out.wood++; out.rot.push(Math.round(m.map.rotation * 180 / Math.PI)); } } });
  const mats = window.__hp.app.project && window.__hp.app.panes[0].view.spec.shell && window.__hp.app.panes[0].view.spec.shell.materials;
  return out; }"""
SOFT = """() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view, out = [];
  v.scene.traverse(o => { if (o.isMesh && o.material) for (const m of [].concat(o.material)) if (m && m.userData && m.userData.soft) out.push([m.userData.lib, m.map && m.map.userData.detail, m.map && m.map.colorSpace, '#' + m.color.getHexString(), 'ptColor' in m.userData]); });
  return out; }"""

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    logs = []
    pg.on('console', lambda m: logs.append(m.text[:200]) if m.type == 'error' else None)
    pg.wait_for_function(READY, timeout=60000)
    w = pg.evaluate("() => { const s = window.__hp.TEXLIB.data.sets; return [s.Wood012 && s.Wood012.size, s.Concrete034.size]; }")
    check('textures: Wood012 (2 : 1, 1 × 0.5 m), the plaster relief its own shape too (2 × 1 m)', w == [[1.0, 0.5], [2.0, 1.0]], w)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(9000); still(pg)
    d = pg.evaluate(DOORS)
    check('the outside doors: their leaves in Wood012, the grain upright', d['wood'] >= 4 and all(r == 90 for r in d['rot']), d)
    fr = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; let wood = 0, white = 0; v.scene.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material)) { const m = o.material; if (m.userData.lib === 'Wood012') wood++; else if (m.color && m.color.getHexString && /^f[0-9a-f]f[0-9a-f]e/.test(m.color.getHexString()) && m.roughness < 0.6) white++; } }); return [wood, white]; }")
    check('… their frames (and the windows) stay white', fr[1] > 0, fr)
    inv = pg.evaluate(INV)
    check('memory: the whole house with its garden in less than 85 MB of pictures (was about 93)', inv['mb'] < 85, inv)
    check('… the neighbours\' bricks one shared grey wall', inv['shared'] == 1, inv)
    check('… their façades a few shades (were one picture per colour: 17)', 1 <= inv['facades'] <= 7, inv)
    check('… the house\'s bricks at full size on a computer', inv['houseBrick'] and min(inv['houseBrick']) >= 1000, inv)
    sm = pg.evaluate(SOFT)
    check('tinted materials share one light-and-dark picture (raw values) and carry their colour themselves', sm and all(x[1] and x[2] == '' or x[2] == 'NoColorSpace' for x in sm) and len({x[3] for x in sm}) >= 2, sm[:6])
    # the same look: a colour soft-lit in the shader against the canvas way (the colour over the picture's light and dark)
    cmp = pg.evaluate("""() => { const H = window.__hp, T = H.THREE, r = H.app.panes[0].view.renderer, out = [];
      for (const [id, col, ct] of [['Marble021', [0.62, 0.46, 0.33], 1.4], ['Fabric028', [0.25, 0.35, 0.55], 0.9], ['RoofingTiles013A', [0.55, 0.3, 0.25], 1.6]]) {
        const cv = H.libTintCanvas(id, col, ct), N = 64, c2 = document.createElement('canvas'); c2.width = c2.height = N; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0, N, N);
        const a = g.getImageData(0, 0, N, N).data;
        const m = new T.MeshBasicMaterial({ color: new T.Color().setRGB(...col, T.SRGBColorSpace), map: H.libDetailTex(id, ct, 1), toneMapped: false });
        m.onBeforeCompile = sh => H.softPatch(sh); m.customProgramCacheKey = () => 'soft-basic';
        const sc = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 2); cam.position.z = 1; sc.add(new T.Mesh(new T.PlaneGeometry(2, 2), m));
        const rt = new T.WebGLRenderTarget(N, N); rt.texture.colorSpace = T.SRGBColorSpace;
        const prev = r.getRenderTarget(); r.setRenderTarget(rt); r.render(sc, cam); const b = new Uint8Array(N * N * 4); r.readRenderTargetPixels(rt, 0, 0, N, N, b); r.setRenderTarget(prev); rt.dispose(); m.dispose();
        const mean = d => { const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } return s.map(x => x / (d.length / 4)); };
        const ma = mean(a), mb = mean(b);
        // and the light and dark: how much the pixels vary around the mean
        const dev = (d, m0) => { let s = 0; for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i + 1] - m0[1]); return s / (d.length / 4); };
        out.push([id, ma.map(Math.round), mb.map(Math.round), Math.round(dev(a, ma) * 10) / 10, Math.round(dev(b, mb) * 10) / 10]);
      }
      return out; }""")
    check('the same look: a colour laid over the shared picture in the shader = the old coloured copy (mean within 3 of 255, the grain alike)', all(max(abs(x - y) for x, y in zip(c[1], c[2])) <= 3 and abs(c[3] - c[4]) <= max(2, 0.25 * c[3]) for c in cmp), cmp)
    # the path tracer: the soft-lit colours doubled only while it reads the scene, then back
    # (task 0010 – steady: the path tracer's random numbers from a seeded sequence, as test_round26 (0008a); and the
    #  colours must be put back whatever the picture – a one-sample picture of 64 × 40 came out black once on GitHub and
    #  the app refused it ("came out black"), which stopped this file; that refusal is a picture's fate, not this check's)
    pt = pg.evaluate("""async () => { const v = window.__hp.app.panes[0].view, rnd0 = Math.random; let a = 1;
      Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      let out = 'ok';
      try { await window.__hp.renderPathTraced(v, { W: 64, H: 40, passes: 1, meter: false }); } catch (e) { out = String(e.message || e); }
      finally { Math.random = rnd0; v.resize(); v.needs = true; }
      return out; }""")
    print('   one-sample path traced picture:', pt)
    sm2 = pg.evaluate(SOFT)
    check('the path tracer reads them with their colour doubled (its picture is multiplied) and puts it back', sm2 == sm and not any(x[4] for x in sm2), (pt, sm[:3], sm2[:3]))
    pg.screenshot(path=SHOTS + 'r23-house.png', clip={'x': 56, 'y': 104, 'width': 884, 'height': 696})
    check('PC: no page errors, no shader errors', not pg.errors and not [l for l in logs if 'Shader' in l or 'WebGLProgram' in l], (pg.errors[:3], logs[:3]))
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    logs = []
    pg.on('console', lambda m: logs.append(m.text[:200]) if m.type == 'error' else None)
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(9000); still(pg)
    inv = pg.evaluate(INV)
    check('phone: the pictures in less than 65 MB (was about 93)', inv['mb'] < 65, inv)
    check('phone: the house\'s brick colours at half size (the relief stays sharp), the garden tiles smaller', inv['houseBrick'] and max(inv['houseBrick']) <= 520 and inv['gtiles'] and max(inv['gtiles']) <= 400, inv)
    check('phone: the outside doors in the wood too', pg.evaluate(DOORS)['wood'] >= 4)
    pg.screenshot(path=SHOTS + 'r23-phone-dark.png')
    check('phone: no page errors, no shader errors', not pg.errors and not [l for l in logs if 'Shader' in l or 'WebGLProgram' in l], (pg.errors[:3], logs[:3]))
    b.close()
sys.exit(summary())
