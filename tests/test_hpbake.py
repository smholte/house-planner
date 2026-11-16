"""Import a bake (.hpbake) and show its light (task 0032), house scene format pinned at v1.0.1.
1. The reader: the format's sample bake and Fresing Render's real Cycles bake of the same made-up house
   (tests/fixtures/sample-house.fresing.hpbake – a copy of smholte/CAD-render-animation tests/data/house/
   sample-house.fresing.hpbake, commit b4e2117, the format's made-up house: no private data) read without an error, and
   both are drawn on that house the way the 3D views draw baked light (hpbPreview: every surface matched, snow in winter,
   the night darker). Broken copies are refused, each with its message: a newer major version, a page with a colour
   chunk, a rectangle off its page, a name with "..", a damaged zip. The sample bake on an app house: "another house".
2. An app house (the made-up house, exported with 0031's Export → For Fresing Render) with a bake made for it
   (tests/hpbake_maker.py, the format's own package): every part matches, a moment shows in 3D, moments switch without
   a build, light maps and light per vertex both reach the screen (a dark and a bright floor), the bar says what changed.
   Out of date: a moved wall, moved furniture (keeps its own light), a deleted and a new piece – the 0.5 m / 0.3 m rules.
   A copied version shares the bake; Library → Remove leaves it; the export with and without baked light; merge.
   Numbers: matching, loading a moment, memory of a moment, draw calls live and baked (test browser, software 3D).
3. Phone, dark: the bar fits 390 px; the moment picker; the sheet (View → 3D: baked light)."""
from common import *
import base64, io, re, struct, sys, time, zipfile, zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hpbake_maker import make_bake, files_of, zip_bytes  # noqa: E402
from hsf.check import check as hsf_check  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE_SCENE = os.path.join(HERE, 'house-scene-format', 'samples', 'sample-house.hpscene')
SAMPLE_BAKE = os.path.join(HERE, 'house-scene-format', 'samples', 'sample-house.hpbake')
FRESING_BAKE = os.path.join(HERE, 'fixtures', 'sample-house.fresing.hpbake')
b64 = lambda data: base64.b64encode(data).decode()
rd = lambda path: open(path, 'rb').read()

CHECK = """async (b) => { const H = window.__hp; const bytes = Uint8Array.from(atob(b), c => c.charCodeAt(0));
  try { const f = await H.hpbUnzip(bytes); const r = H.hpbCheck(f); return { errors: r.errors, warnings: r.warnings, moments: r.doc ? r.doc.moments.length : 0 }; }
  catch (e) { return { errors: [String(e.message || e)], thrown: true }; } }"""
PREVIEW = """async ([s, b, mid, o]) => { const d = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
  const r = await window.__hp.hpbPreview(d(s), d(b), mid, o || {}); return r; }"""
EXPORT = """async (o) => { const a = window.__hp.app; const d = a.hpsceneDefaults(); Object.assign(d, o || {});
  const r = await a.hpsceneMake(d); const buf = new Uint8Array(await r.blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { b64: btoa(s), stats: r.stats, id: r.doc.id }; }"""
IMPORT = """async ([b, name]) => { const bytes = Uint8Array.from(atob(b), c => c.charCodeAt(0));
  window.__impDone = null; window.__hp.app.hpbakeImport(new File([bytes], name)).then(r => { window.__impDone = { r }; }, e => { window.__impDone = { e: String(e) }; }); return true; }"""
# the match as it is now, when it is made for the version as it is now (no build or match still waiting)
MATCHED = """() => { const a = window.__hp.app, v = a.shownVersion(), rec = a.hpbRec(v);
  return !!(rec && a._hpb && a._hpb.M && !a._hpbJob && !a._hpbBusy && a._hpb.key === rec.id + '|' + a.hpbGeoKey(v) && a._hpbMd && a._hpbMd.gen === a._hpb.M.gen); }"""
STATE = """() => { const a = window.__hp.app, M = a._hpb.M, v3 = a.panes.find(p => p.kind === '3d');
  const st = {}; M.surfaces.forEach((S, i) => { st[S.id] = M.state[i]; });
  return { states: [0, 1, 2, 3].map(k => M.state.filter(x => x === k).length), changes: M.changes.map(c => [c.id, c.how]), near: M.near, nearIds: M.nearIds, st, gen: M.gen, ms: M.ms,
    hit: v3 ? v3.view._hpbHit : 0, status: a.hpbStatusText() }; }"""


def import_bake(pg, data, name='house.hpbake', dialog_ok=False, confirm=False):
    pg.evaluate(IMPORT, [b64(data), name])
    if dialog_ok or confirm:
        pg.wait_for_selector('.dialog', timeout=300000)
        txt = pg.inner_text('.dialog')
        pg.click('.dialog .btn.primary' if dialog_ok or confirm else '.dialog .btn')
        pg.wait_for_function("() => window.__impDone", timeout=300000)
        return txt, pg.evaluate("() => window.__impDone")
    pg.wait_for_function("() => window.__impDone", timeout=300000)
    return None, pg.evaluate("() => window.__impDone")


def wait_match(pg):
    pg.wait_for_function(MATCHED, timeout=300000)
    pg.wait_for_timeout(400)
    return pg.evaluate(STATE)


def png_with_chunk(png, kind=b'gAMA', body=b'\x00\x00\xb1\x8f'):
    """a copy of a PNG with one more chunk after IHDR"""
    ch = struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)
    return png[:33] + ch + png[33:]


def raw_zip(entries):
    """a zip with names as given (Python's zipfile would clean '..' away)"""
    out, cen = bytearray(), bytearray()
    for name, data in entries:
        nm = name.encode()
        crc = zlib.crc32(data) & 0xffffffff
        hdr = struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0x800, 0, 0, 0, crc, len(data), len(data), len(nm), 0)
        cen += struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 20, 20, 0x800, 0, 0, 0, crc, len(data), len(data), len(nm), 0, 0, 0, 0, 0, len(out)) + nm
        out += hdr + nm + data
    end = struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(entries), len(entries), len(cen), len(out), 0)
    return bytes(out + cen + end)


def mean_at(pg, pt, r=5):
    from PIL import Image
    shot = pg.screenshot(clip={'x': pt[0] - r, 'y': pt[1] - r, 'width': 2 * r, 'height': 2 * r})
    im = Image.open(io.BytesIO(shot)).convert('RGB')
    px = list(im.getdata())
    return sum(sum(p) / 3 for p in px) / len(px)


SCREEN = """([x, y, z]) => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view, T = window.__hp.THREE;
  const P = new T.Vector3(x, y, z).project(v.camera), r = v.renderer.domElement.getBoundingClientRect();
  return [r.left + (P.x + 1) / 2 * r.width, r.top + (1 - P.y) / 2 * r.height]; }"""

with sync_playwright() as p:
    # ── 1. the reader, the samples ──
    b, pg = open_app(p)
    open_example(pg)
    sc = b64(rd(SAMPLE_SCENE))
    for label, path in (('the format\'s sample bake', SAMPLE_BAKE), ('Fresing Render\'s Cycles bake of the sample', FRESING_BAKE)):
        bk = b64(rd(path))
        r = pg.evaluate(CHECK, bk)
        check(f'{label}: read and checked without an error', not r['errors'] and r['moments'] == 4, r)
        day = pg.evaluate(PREVIEW, [sc, bk, 'summer-morning', {}])
        snow = pg.evaluate(PREVIEW, [sc, bk, 'winter-noon', {}])
        night = pg.evaluate(PREVIEW, [sc, bk, 'winter-night', {}])
        print(f'  {label}:', {k: v for k, v in day.items() if k != 'png'}, 'winter', snow.get('snow'), snow.get('mean'), 'night', night.get('mean'))
        check(f'{label}: shown on its house – every surface matched', day.get('matched') == day.get('surfaces') == 51, {k: v for k, v in day.items() if k != 'png'})
        check(f'{label}: winter has its snow layers, the night is dark', snow.get('snow', 0) >= 2 and night.get('night') and night['mean'] < day['mean'] / 2, (snow.get('snow'), night.get('mean'), day.get('mean')))
        for nm, rr in (('summer-morning', day), ('winter-noon', snow), ('winter-night', night)):
            open(SHOTS + f'hpbake-{"fresing" if "Fresing" in label else "sample"}-{nm}.png', 'wb').write(base64.b64decode(rr['png'].split(',')[1]))
    # broken copies
    base = files_of(rd(SAMPLE_BAKE))
    doc = json.loads(base['bake.json'])
    def broken(change):
        f = dict(base); d = json.loads(json.dumps(doc)); change(f, d); f['bake.json'] = json.dumps(d).encode(); return zip_bytes(f)
    cases = [
        ('a newer major version (2.0)', broken(lambda f, d: d.update(version='2.0')), 'newer Fresing Render'),
        ('a page with a colour chunk (gAMA)', broken(lambda f, d: f.update({d['pages'][0]['file']: png_with_chunk(f[d['pages'][0]['file']])})), 'gAMA'),
        ('a light map off its page', broken(lambda f, d: next(iter(d['moments'][0]['maps'].values())).update(rect=[1000, 1000, 55, 88])), 'does not lie on its page'),
        ('a vertex range past its file', broken(lambda f, d: next(r for r in d['moments'][0]['maps'].values() if 'vertex' in r).update(count=99999)), 'outside its file'),
        ('a missing page', broken(lambda f, d: f.pop(d['pages'][1]['file'])), 'missing'),
        ('NaN in bake.json', zip_bytes({**base, 'bake.json': base['bake.json'].replace(b'"exposure":0.0', b'"exposure":NaN', 1).replace(b'"exposure": 0.0', b'"exposure": NaN', 1)}), 'cannot be read'),
        ('a name with ".."', raw_zip([('../bake.json', base['bake.json'])]), 'not allowed'),
        ('a damaged zip', rd(SAMPLE_BAKE)[: len(rd(SAMPLE_BAKE)) // 2], 'damaged'),
    ]
    for label, data, want in cases:
        r = pg.evaluate(CHECK, b64(data))
        check(f'refused: {label}', r['errors'] and any(want in e for e in r['errors']), r['errors'][:3])
    # the sample bake on the app's own made-up house: another house
    pg.evaluate("() => { const a = window.__hp.app; a.setDim && a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(1500)
    txt, res = import_bake(pg, rd(SAMPLE_BAKE), 'sample-house.hpbake', dialog_ok=True)
    check('the sample bake on an app house: refused as another house, nothing kept', 'Another house' in txt and res.get('r') is False and not pg.evaluate("() => !!window.__hp.app.hpbRec()"), (txt[:200], res))
    check('no JavaScript errors (reader)', not pg.errors, pg.errors[:3])
    b.close()

    # ── 2. an app house with a bake made for it ──
    b, pg = open_app(p)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setMode && a.setMode('build'); a.setDim && a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(2000)
    rooms0 = pg.evaluate("""() => { const a = window.__hp.app, st = window.__hp.sortedStoreys(a.project)[0];
      return a.shownVersion().plan.rooms.filter(r => r.storey === st.id).map(r => ({ id: r.id, name: r.name, poly: r.poly })); }""")
    big = sorted(rooms0, key=lambda r: -abs(sum(r['poly'][i][0] * r['poly'][i - 1][1] - r['poly'][i - 1][0] * r['poly'][i][1] for i in range(len(r['poly'])))))
    dark, ref = big[0], big[1]
    t0 = time.time()
    ex = pg.evaluate(EXPORT, {'moments': ['morning', 'afternoon', 'night'], 'pageSize': 1024})
    scene = base64.b64decode(ex['b64'])
    print('  export of the made-up house:', round(time.time() - t0, 1), 's', ex['id'], ex['stats']['pages'], 'pages')
    check('the scene id carries the layout settings (density, page, groups)', re.search(r'_t[0-9.]+_p1024_i[a-z]+', ex['id']), ex['id'])
    F = lambda sid, mid: (0.12 if mid == 'summer-morning' else 1.6) if sid == f'floor:{dark["id"]}' else None
    bake = make_bake(scene, F=F, problems=['Test: nothing was really baked.'])
    sp, bp = os.path.join(SHOTS, 'made-up-house-for-bake.hpscene'), os.path.join(SHOTS, 'made-up-house.hpbake')
    open(sp, 'wb').write(scene); open(bp, 'wb').write(bake)
    rep = hsf_check(bp, scene=sp)
    check('the test\'s bake passes the format\'s checker against the scene', not rep.errors, rep.errors[:4])
    t0 = time.time()
    _, res = import_bake(pg, bake, 'made-up-house.hpbake')
    st = wait_match(pg)
    t_import = round(time.time() - t0, 1)
    print('  import + first picture:', t_import, 's;', {k: v for k, v in st.items() if k not in ('st', 'nearIds', 'changes')})
    check('Import bake: kept with the version, a day moment shown', res.get('r') is True and pg.evaluate("() => { const a = window.__hp.app; return a.hpbOn() && a.settings.bakeMoment === 'summer-afternoon'; }"), res)
    check('every part matches the bake, nothing out of date', st['states'][3] == 0 and st['states'][1] > 200 and not st['changes'] and st['status'] == 'Every part matches the bake.', (st['states'], st['changes'][:4]))
    check('the 3D view shows baked light on most surfaces', st['hit'] > 0.85 * st['states'][1], (st['hit'], st['states']))
    rec = pg.evaluate("() => { const r = window.__hp.app.hpbRec(); return { id: r.id, file: r.file, moments: r.moments.map(m => [m.id, m.label, m.night, !!m.sun]), files: Object.keys(r.files).length, json: r.json, problems: r.problems }; }")
    check('the record: file name, six moments with names and their sun (night known), the Fresing problems', rec['file'] == 'made-up-house.hpbake' and len(rec['moments']) == 6
          and ['summer-night', 'Summer · Night', True, True] in rec['moments'] and rec['problems'] == ['Test: nothing was really baked.'], rec)
    view_info = """() => { const a = window.__hp.app, v = a.panes.find(p => p.kind === '3d').view, md = a._hpbMd;
      return { calls: v.renderer.info.render.calls, tris: v.renderer.info.render.triangles, ms: md && md.ms, bytes: md && md.bytes, pages: md && md.pages.length, snow: md && md.snow.length, transfer: v._hpbMs, gen: a._hpb.M.gen }; }"""
    still(pg)
    on = pg.evaluate(view_info)
    pg.screenshot(path=SHOTS + 'hpbake-house-pc.png')
    # moments switch without building again
    builds = "() => window.__hp.app.panes.find(p => p.kind === '3d').view._hpbBuilds || 0"
    pg.evaluate("() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; v._hpbBuilds = 0; const b0 = v.build; v.build = function (...x) { this._hpbBuilds++; return b0.apply(this, x); }; }")
    t0 = time.time()
    pg.select_option('#bake-moment', 'winter-night'); pg.wait_for_function("() => window.__hp.app._hpbMd && window.__hp.app._hpbMd.id === 'winter-night'")
    t_night = round((time.time() - t0) * 1000)
    night = pg.evaluate(view_info)
    pg.wait_for_timeout(500); still(pg)
    pg.screenshot(path=SHOTS + 'hpbake-house-night-pc.png')
    pg.select_option('#bake-moment', 'winter-afternoon'); pg.wait_for_function("() => window.__hp.app._hpbMd && window.__hp.app._hpbMd.id === 'winter-afternoon'")
    snow_n = pg.evaluate("() => (window.__hp.app.panes.find(p => p.kind === '3d').view._hpbSnowMeshes || []).length")
    check('moments switch without a 3D build (night, then winter with its snow on the plot)', pg.evaluate(builds) == 0 and snow_n == 1, (pg.evaluate(builds), snow_n))
    print('  moment: load', on['ms'], 'ms (night', night['ms'], 'ms, switch', t_night, 'ms in all), memory', round(on['bytes'] / 1e6, 1), 'MB,', on['pages'], 'pages; transfer', on['transfer'], 'ms; draw calls', on['calls'])
    # live: the draw calls do not rise
    pg.select_option('#bake-moment', '')
    pg.wait_for_function("() => !window.__hp.app.hpbOn()"); pg.wait_for_timeout(1500); still(pg)
    live = pg.evaluate("() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; return { calls: v.renderer.info.render.calls, tris: v.renderer.info.render.triangles }; }")
    print('  draw calls live', live['calls'], 'baked', on['calls'], '; triangles', live['tris'], on['tris'])
    check('draw calls: baked light adds none (or a few)', on['calls'] <= live['calls'] + 6, (live, on))
    check('Live light: the bar is gone, the sun bar can come back', not pg.is_visible('#bake-bar'))

    # light maps reach the screen: a floor baked dark in the morning, bright in the afternoon (All light: no live sun)
    ex2 = pg.evaluate(EXPORT, {'moments': ['morning', 'afternoon'], 'seasons': {'summer': {'on': True, 'date': '2026-06-21'}, 'winter': {'on': False, 'date': '2026-01-15'}}, 'pageSize': 1024, 'light': 'ALL', 'groups': ['house']})
    bake2 = make_bake(base64.b64decode(ex2['b64']), F=F, snow=False)
    pg.evaluate("() => { const a = window.__hp.app; a.createVersionFrom(a.shownVersion().id, 'Bake test'); }"); pg.wait_for_timeout(1500)
    _, res2 = import_bake(pg, bake2, 'all-light.hpbake', confirm=True)
    pg.evaluate("() => { window.__hp.Settings.set('furniture', false); window.__hp.Settings.set('labels', false); const a = window.__hp.app; const st = window.__hp.sortedStoreys(a.project)[0]; a.setScope('storey', st.id); }")
    wait_match(pg)
    pg.evaluate("() => window.__hp.app.hpbSetMoment('summer-morning')"); wait_match(pg); still(pg)
    cen = lambda r: [sum(q[0] for q in r['poly']) / len(r['poly']), sum(q[1] for q in r['poly']) / len(r['poly'])]
    pd, pr = pg.evaluate(SCREEN, [cen(dark)[0], 0.02, cen(dark)[1]]), pg.evaluate(SCREEN, [cen(ref)[0], 0.02, cen(ref)[1]])
    m_dark, m_ref = mean_at(pg, pd), mean_at(pg, pr)
    pg.screenshot(path=SHOTS + 'hpbake-floors-morning.png')
    pg.evaluate("() => window.__hp.app.hpbSetMoment('summer-afternoon')"); wait_match(pg); still(pg)
    a_dark, a_ref = mean_at(pg, pd), mean_at(pg, pr)
    pg.screenshot(path=SHOTS + 'hpbake-floors-afternoon.png')
    print(f'  floor {dark["name"]}: morning {m_dark:.0f}, afternoon {a_dark:.0f}; floor {ref["name"]}: {m_ref:.0f}, {a_ref:.0f}')
    check(f'light maps on screen: the floor of {dark["name"]} dark in the morning, bright in the afternoon (against {ref["name"]})', m_dark < m_ref * 0.8 and a_dark > a_ref * 1.1 and a_dark > m_dark * 1.6, (m_dark, m_ref, a_dark, a_ref))
    # replacing the bake of a version asked first, the old one kept 30 days in Save points
    check('a second bake on the same version: asked, the old one in Save points', res2.get('r') is True and pg.evaluate("async () => (await window.__hp.Snapshots.list(window.__hp.app.project.id)).some(s => s.kind === 'backup' && /bake/.test(s.name))"))
    pg.evaluate("() => { window.__hp.Settings.set('furniture', true); const a = window.__hp.app; a.setActiveVersion(a.project.versions.find(v => v.name === 'Plan – study').id); a.setScope('house'); }")
    pg.wait_for_timeout(1500)

    # ── out of date ──
    vname = pg.evaluate("() => window.__hp.app.shownVersion().name")
    pg.evaluate("() => window.__hp.app.hpbSetMoment('summer-afternoon')")
    base_st = wait_match(pg)
    check(f'back on “{vname}”: its own bake, all parts match', base_st['states'][3] == 0 and not base_st['changes'], (vname, base_st['states'], base_st['changes'][:3]))
    # a moved wall: an inside wall of the ground floor 30 cm to the side
    wall = pg.evaluate("""() => { const a = window.__hp.app, st = window.__hp.sortedStoreys(a.project)[0], pl = a.shownVersion().plan;
      const w = pl.walls.filter(w => w.storey === st.id && w.kind === 'interior' && !pl.openings.some(o => o.wall === w.id)).sort((x, y) => Math.hypot(y.b[0] - y.a[0], y.b[1] - y.a[1]) - Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1]))[0];
      return w ? { id: w.id, a: w.a, b: w.b } : null; }""")
    pg.evaluate("""(id) => { const a = window.__hp.app; a.mutate(pl => { const w = pl.walls.find(x => x.id === id); const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], l = Math.hypot(...d);
      const n = [-d[1] / l * 0.3, d[0] / l * 0.3]; w.a = [w.a[0] + n[0], w.a[1] + n[1]]; w.b = [w.b[0] + n[0], w.b[1] + n[1]]; }); }""", wall['id'])
    s1 = wait_match(pg)
    wid = wall['id']
    mine = [c for c in s1['changes'] if c[0].startswith(f'wall:{wid}:')]
    print('  moved wall:', len(s1['changes']), 'changed,', s1['near'], 'near –', s1['changes'][:6], s1['nearIds'][:6])
    check('a moved wall: its sides are out of date (changed), parts within 0.5 m too, far parts keep their light',
          mine and all(h == 'changed' for _, h in mine) and s1['near'] > 0 and s1['states'][1] > 0.6 * base_st['states'][1], (mine, s1['near'], s1['states']))
    check('the bar says so: “… parts changed since the bake – bake again”, and Which? lists them', 'changed since the bake' in s1['status'] and pg.is_visible('#bake-which'), s1['status'])
    pg.click('#bake-which'); pg.wait_for_selector('#bake-which-list')
    which = pg.inner_text('#bake-which-list')
    check('Which?: the changed parts in words', 'Wall' in which and 'changed' in which, which[:200])
    pg.click('.dialog .btn.primary')
    pg.evaluate("() => window.__hp.app.undo()")
    s0 = wait_match(pg)
    check('Undo: everything matches again', not s0['changes'] and s0['states'][3] == 0, s0['changes'][:3])
    # moved furniture: keeps its own light; what is within 0.3 m of its old and new place is out of date
    item = pg.evaluate("""() => { const a = window.__hp.app, st = window.__hp.sortedStoreys(a.project)[0];
      const it = a.activeLayout().items.find(f => f.storey === st.id && !/rug|carpet|kleed/i.test(f.type) && (f.w || 0) > 0.4 && (f.d || 0) > 0.4) || a.activeLayout().items[0]; return { id: it.id, type: it.type }; }""")
    pg.evaluate("(id) => window.__hp.app.mutate((pl, p) => { const f = window.__hp.app.activeLayout().items.find(x => x.id === id); f.x += 0.5; }, { project: true })", item['id'])
    s2 = wait_match(pg)
    fid = [k for k in s2['st'] if k.startswith(f'furniture:{item["id"]}:') or k == f'furniture:{item["id"]}:0']
    print('  moved', item, ':', s2['changes'][:5], 'near', s2['near'], s2['nearIds'][:6])
    check('moved furniture keeps its own light (moved), parts within 0.3 m of its old and new place are out of date',
          fid and s2['st'][fid[0]] == 2 and [fid[0], 'moved'] in s2['changes'] and s2['near'] > 0 and not any(h != 'moved' for _, h in s2['changes']), (fid, s2['changes'][:4], s2['near']))
    check('the bar: “1 pieces moved (their own light kept)”', 'moved' in s2['status'], s2['status'])
    pg.evaluate("() => window.__hp.app.undo()"); wait_match(pg)
    # a deleted piece and a new one
    pg.evaluate("(id) => window.__hp.app.mutate((pl, p) => { const L = window.__hp.app.activeLayout(); L.items = L.items.filter(x => x.id !== id); }, { project: true })", item['id'])
    s3 = wait_match(pg)
    check('a deleted piece: gone from the bake, what was near it out of date', [fid[0], 'deleted'] in s3['changes'] and s3['near'] > 0, (s3['changes'][:4], s3['near']))
    pg.evaluate("() => window.__hp.app.undo()"); wait_match(pg)
    pg.evaluate("""(id) => window.__hp.app.mutate((pl, p) => { const L = window.__hp.app.activeLayout(), f = L.items.find(x => x.id === id);
      L.items.push({ ...JSON.parse(JSON.stringify(f)), id: 'f_hpb_new', x: f.x + 0.2, y: f.y + 0.2 }); }, { project: true })""", item['id'])
    s4 = wait_match(pg)
    newid = [k for k in s4['st'] if k.startswith('furniture:f_hpb_new')]
    check('a new piece: live light (out of date), and what is near it', newid and s4['st'][newid[0]] == 3 and [newid[0], 'new'] in s4['changes'] and s4['near'] > 0, (newid, s4['changes'][:3]))
    pg.evaluate("() => window.__hp.app.undo()"); wait_match(pg)

    # a copied version shares the bake; Library → Remove leaves it; exports with and without; merge
    share = pg.evaluate("""() => { const a = window.__hp.app, v = a.shownVersion(); const c = a.createVersionFrom(v.id, 'Copy with bake');
      const out = { same: !!(c.bake && c.bake.id === v.bake.id && c.bake.json === v.bake.json), on: a.hpbOn() }; return out; }""")
    check('a copied version shares the bake (the same files), and shows it', share['same'], share)
    wait_match(pg)
    lib = pg.evaluate("""async () => { const H = window.__hp, r = H.app.hpbRec(); for (const n of [...H.LIB.libs.keys()]) { try { await H.libRemove(n); } catch (e) { /* none */ } }
      await H.Assets.collectGarbage(); return { rec: !!H.app.hpbRec(), json: !!(await H.Assets.getRecord(r.json)), all: (await Promise.all(Object.values(r.files).map(id => H.Assets.getRecord(id)))).every(Boolean) }; }""")
    check('Library → Remove (and the clean-up) leave the bake and its files', lib['rec'] and lib['json'] and lib['all'], lib)
    exp = pg.evaluate("""async () => { const a = window.__hp.app, p = a.project, ids = new Set(); for (const v of p.versions) if (v.bake) for (const id of Object.values(v.bake.files)) ids.add(id);
      const no = JSON.parse(await a.buildExport([p], false)), yes = JSON.parse(await a.buildExport([p], false, true));
      const k = o => Object.keys(o.assets).filter(id => ids.has(id)).length;
      return { n: ids.size, without: k(no), with: k(yes), kinds: [...new Set(Object.values(yes.assets).filter(x => x.kind === 'bake').map(x => x.kind))], rec: !!no.projects[0].project.versions.find(v => v.bake),
        sizeNo: JSON.stringify(no).length, sizeYes: JSON.stringify(yes).length }; }""")
    print('  export:', exp)
    check('export without baked light: none of its files (the record stays); with: all of them', exp['without'] == 0 and exp['with'] == exp['n'] > 0 and exp['kinds'] == ['bake'] and exp['rec'], exp)
    mg = pg.evaluate("""() => { const H = window.__hp, a = H.app, mine = JSON.parse(JSON.stringify(a.project)), theirs = JSON.parse(JSON.stringify(a.project));
      for (const v of mine.versions) delete v.bake; return H.mergeChanges(mine, theirs).filter(c => /Baked light/.test(c.label)).map(c => [c.label, c.tag, c.on]); }""")
    check('merge: baked light taken as a whole, per version', mg and all(t == 'new' and on for _, t, on in mg), mg)
    mg2 = pg.evaluate("""async () => { const H = window.__hp, a = H.app, mine = JSON.parse(JSON.stringify(a.project));
      const theirs = JSON.parse(await a.buildExport([a.project], false)).projects[0].project; for (const v of mine.versions) delete v.bake;
      return H.mergeChanges(mine, theirs).filter(c => /Baked light/.test(c.label)).map(c => [c.label, c.on]); }""")
    check('merge of a file exported without baked light: offered unticked, “its files are not in this file”', mg2 and all(not on and 'not in this file' in lab for lab, on in mg2), mg2)
    where = pg.evaluate("async () => { const H = window.__hp, r = H.app.hpbRec(); return { assets: !!(await H.DB.get('assets', r.json)), bake: !!(await H.Assets.getRecord(r.json)) }; }")
    check('the bake\'s files are in a database of their own (an older app\'s clean-up never sees them)', not where['assets'] and where['bake'], where)
    # the export dialog: "With baked light" ticked and saved at once – the file has the baked light
    pg.evaluate("() => { window.__hp.app.exportDialog(); }")
    pg.wait_for_selector('#ex-bakes')
    pg.click('#ex-bakes')
    with pg.expect_download(timeout=180000) as dl:
        pg.click('.dialog .btn:has-text("Save file")')
    import gzip
    raw = open(dl.value.path(), 'rb').read()
    data = json.loads(gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw)
    kinds = sum(1 for a in data['assets'].values() if a.get('kind') == 'bake')
    check('Export → “With baked light” ticked and saved at once: the file holds the baked light', kinds >= exp['n'], (kinds, exp['n']))
    check('no JavaScript errors (PC)', not pg.errors, pg.errors[:3])
    b.close()

    # ── 3. phone, dark ──
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim && a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(2000)
    _, res = import_bake(pg, bake, 'made-up-house.hpbake')
    st = wait_match(pg)
    check('phone: imported and shown, every part matches', res.get('r') is True and st['states'][3] == 0 and st['hit'] > 0, (res, st['states']))
    still(pg)
    fit = pg.evaluate("() => { const e = document.querySelector('#bake-bar'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.right, document.documentElement.scrollWidth]; }")
    check('phone: the bar fits the 390 px screen', fit and fit[0] >= 0 and fit[1] <= 391 and fit[2] <= 391, fit)
    pg.screenshot(path=SHOTS + 'hpbake-phone.png')
    pg.select_option('#bake-moment', 'winter-morning'); pg.wait_for_function("() => window.__hp.app._hpbMd && window.__hp.app._hpbMd.id === 'winter-morning'")
    md = pg.evaluate("() => { const m = window.__hp.app._hpbMd; return { ms: m.ms, bytes: m.bytes, pages: m.pages.length, w: m.pages[0] && m.pages[0].image.width }; }")
    print('  phone moment:', md)
    check('phone: a moment holds 1024 px pages', md['w'] and md['w'] <= 1024, md)
    pg.click('#bake-more'); pg.wait_for_selector('.bake-sheet')
    wide = pg.evaluate("() => { const d = document.querySelector('.dialog'); const r = d.getBoundingClientRect(); return [r.left, r.right, [...d.querySelectorAll('button')].filter(e => { const q = e.getBoundingClientRect(); return q.width && (q.right > innerWidth + 1 || q.left < -1); }).length]; }")
    check('phone: the sheet (moments, file, Import, Remove) fits', wide[0] >= 0 and wide[1] <= 391 and wide[2] == 0 and pg.is_visible('#bake-remove'), wide)
    pg.screenshot(path=SHOTS + 'hpbake-sheet-phone.png')
    pg.click('#bake-m-live'); pg.wait_for_function("() => !window.__hp.app.hpbOn()")
    check('phone: Live light from the sheet', not pg.is_visible('#bake-bar'))
    check('no JavaScript errors (phone)', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
