"""Thirtieth round (2 Nov, afternoon): the outside doors in the grey of the builder's façade drawing. VK-3.020-C draws the
front door, the back door and the garden doors' leaves in one warm grey (#6B665E – its colours are the model's own: the
red brick there is exactly the model's 130/79/61). The leaves keep the Wood012 grain, now laid over that grey (the
picture's own light and dark, a little stronger), set a little lighter and less warm (#7A7875) so that in the 3D view's
daylight the door next to its white frame looks as in the drawing. PC (light) and phone (dark). (The owner's front door
on the screen, in the shade of his north front, and its white frame: house/tests/test_round30_own.py.)"""
from common import *

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
V = "window.__hp.app.panes.find(p => p.kind === '3d').view"
LEAVES = """() => { const v = %s, out = { n: 0, mats: {}, frames: 0, white: 0 };
  v.scene.traverse(o => { if (!o.isMesh || !o.material || Array.isArray(o.material)) return; const ud = o.userData || {}, pd = (o.parent && o.parent.userData) || {};
    if ((ud.door != null ? ud.door : pd.door) == null) return; const m = o.material;
    if (m.userData.lib === 'Wood012') { out.n++; const k = m.uuid; if (!out.mats[k]) out.mats[k] = { hex: m.color.getHexString(), soft: !!m.userData.soft, detail: !!(m.map && m.map.userData.detail), rot: Math.round((m.map ? m.map.rotation : 0) * 180 / Math.PI), normal: !!m.normalMap }; } });
  out.mats = Object.values(out.mats); return out; }""" % V
with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); a.setMode('view'); a.settings.light = 'day'; a.refreshViews(false); }"); pg.wait_for_timeout(9000); still(pg)
    d = pg.evaluate(LEAVES)
    check('the outside doors\' leaves: Wood012, one material for all (front, back, garden doors)', d['n'] >= 6 and len(d['mats']) == 1, d)
    m = d['mats'][0] if d['mats'] else {}
    check('… in the drawing\'s grey, made for the screen: #7A7875 (the drawing: #6B665E)', m.get('hex') == '7a7875', m)
    check('… the wood\'s own light and dark over it (a tinted picture), the grain upright, with its relief', m.get('soft') and m.get('detail') and m.get('rot') == 90 and m.get('normal'), m)
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.settings.light = 'day'; a.refreshViews(false); }"); pg.wait_for_timeout(9000); still(pg)
    d = pg.evaluate(LEAVES)
    m = d['mats'][0] if d['mats'] else {}
    check('phone: the leaves in the same grey with the grain', d['n'] >= 6 and m.get('hex') == '7a7875' and m.get('soft') and m.get('rot') == 90, d)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
