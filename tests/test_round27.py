"""Twenty-seventh round (2 Nov, night): the 3D view's exposure follows what you look at, like your eyes or a camera. A
dozen rows of the picture (copied on the graphics chip without waiting, back to light values) are measured a moment
after the camera stops; the exposure glides to (0.054 ÷ their log-average light)^0.5 between 1 and 1.8: the overview of the house by day stays as it
was, a close look at the dark roof is brought up, a white room stays as it was (never darker than the normal view: its
rooms are lit evenly, so a light room only means white walls). Not in the evening; Settings → 3D quality → Exposure:
Automatic or Always the same. A photo render gives the exposure back. PC (light) and phone (dark)."""
from common import *

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
V = "window.__hp.app.panes.find(p => p.kind === '3d').view"
AE = "() => { const v = %s; return { k: +(v._aeK || 1).toFixed(4), L: +(v._aeL || 0).toFixed(4), exp: +v.renderer.toneMappingExposure.toFixed(4), on: v.aeOn() }; }" % V
# close above the roof, looking down at its dark tiles
ROOF = """() => { const v = %s, T = window.__hp.THREE; v.home(); v.anim = null; const t = v.controls.target.clone();
  v.setViewState({ kind: '3d', pos: new T.Vector3(t.x + 0.3, t.y + 6.5, t.z + 0.3), target: new T.Vector3(t.x, t.y + 1.5, t.z) }); v.needs = true; }""" % V
WALK_IN = """([yaw]) => { const H = window.__hp, a = H.app, pl = a.shownVersion().plan, r = pl.rooms.find(r => r.name === 'Woonkamer'), c = H.labelPoint(r.poly, H.roomHoles(pl, r));
  const w = a.walker; w.x = c[0]; w.y = c[1]; w.yaw = yaw; w.pitch = -0.05; w.feet = w.groundAt(w.x, w.y, w.feet + 1) ?? w.feet; w.updateCamera(); a.panes[0].view.needs = true; }"""

def settle(pg, ms=6000):
    pg.wait_for_timeout(ms); still(pg)

def settled(pg, cond, secs=40):
    """wait until the exposure meets cond (JS on the AE state a), then read it (a slow test computer glides slowly)"""
    try: pg.wait_for_function("() => { const a = (%s)(); return %s; }" % (AE, cond), timeout=secs * 1000)
    except Exception: pass
    return pg.evaluate(AE)

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    logs = []
    pg.on('console', lambda m: logs.append(m.text[:200]) if m.type == 'error' else None)
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); a.setMode('view'); a.settings.light = 'day'; a.settings.sunDay = 172; a.settings.sunTime = 14 * 60; a.refreshViews(false); }"); settle(pg, 9000)
    pg.evaluate("() => %s.home()" % V); settle(pg)
    h0 = pg.evaluate(AE)
    # (the owner's house by day measures light enough to stay at 1 – 1.1; the made-up overview, more lawn and ditch, a little
    #  darker: 1.27 at the fixed moment 21 June 14:00 (the sun follows the date: 1.25 – 1.33 over the year); band ±0.07 – in both the exposure is (0.054 ÷ the light)^0.5 between 1 and 1.8)
    kr = by_house(pg, (1.2, 1.35), (1.0, 1.1))
    kf = min(1.8, max(1.0, (0.054 / max(h0['L'], 1e-6)) ** 0.5))
    check(f'the overview of the house by day: measured, the exposure as it was ({kr[0]} – {kr[1]})', h0['on'] and h0['L'] > 0 and kr[0] <= h0['k'] <= kr[1] and abs(h0['k'] - kf) < 0.03 and abs(h0['exp'] - h0['k']) < 1e-3, (h0, kf))
    pg.evaluate(ROOF); settle(pg, 7000)
    r0 = settled(pg, 'a.k > 1.3 && Math.abs(a.exp - a.k) < 1e-3')
    check('a close look down at the dark roof: darker, so the exposure is brought up (more than 1.3, at most 1.8)', r0['L'] < h0['L'] and 1.3 < r0['k'] <= 1.8 and abs(r0['exp'] - r0['k']) < 1e-3, (h0, r0))
    pg.screenshot(path=SHOTS + 'r27-roof-auto.png')
    pr = pg.evaluate("async () => { const v = %s, e0 = v.renderer.toneMappingExposure; await window.__hp.renderView3d(v, { W: 64, H: 40, passes: 1 }); return [e0, v.renderer.toneMappingExposure]; }" % V)
    check('a photo render gives the view its exposure back', abs(pr[0] - pr[1]) < 1e-6, pr)
    # Settings: Automatic / Always the same
    pg.evaluate("() => { window.__hp.app.settingsSheet(); }"); pg.wait_for_selector('#set-ae', timeout=30000)
    row = pg.evaluate("() => [...document.querySelectorAll('#set-ae button')].map(b => [b.textContent, b.getAttribute('aria-pressed')])")
    check('Settings → 3D quality: Exposure – Automatic (on) or Always the same', row == [['Automatic', 'true'], ['Always the same', 'false']], row)
    pg.click('#set-ae button[data-k="false"]'); pg.wait_for_timeout(300)
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Done")'); settle(pg, 5000)
    f0 = settled(pg, 'Math.abs(a.exp - 1) < 1e-3')
    check('… Always the same: the exposure back to 1 (kept as a setting)', not f0['on'] and abs(f0['exp'] - 1.0) < 1e-3 and pg.evaluate("() => window.__hp.app.settings.autoExposure") is False, f0)
    pg.screenshot(path=SHOTS + 'r27-roof-fixed.png')
    pg.evaluate("() => window.__hp.Settings.set('autoExposure', true)"); pg.evaluate("() => { const v = %s; v._aeDue = performance.now(); v.needs = true; }" % V); settle(pg)
    check('… Automatic again: brought up again', settled(pg, 'a.k > 1.3')['k'] > 1.3, pg.evaluate(AE))
    # a white room: lit evenly in the normal view – it stays as it was, not darker
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(5000)
    pg.evaluate(WALK_IN, [3.14]); settle(pg, 7000)
    w0 = pg.evaluate(AE)
    check('walking in the living room (white walls, more light than the overview): not made darker – exposure 1', w0['L'] > h0['L'] and abs(w0['k'] - 1.0) < 1e-3 and abs(w0['exp'] - 1.0) < 1e-3, (h0, w0))
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(2500)
    # the evening: the dark is meant
    pg.evaluate("() => { const a = window.__hp.app; a.settings.light = 'evening'; a.refreshViews(false); }"); settle(pg)
    e0 = pg.evaluate(AE)
    check('evening: no automatic exposure (the evening\'s own 1.1)', not e0['on'] and abs(e0['exp'] - 1.1) < 1e-3, e0)
    pg.evaluate("() => { const a = window.__hp.app; a.settings.light = 'day'; a.refreshViews(false); }"); pg.wait_for_timeout(3000)
    check('PC: no page errors, no shader errors', not pg.errors and not [l for l in logs if 'Shader' in l or 'WebGLProgram' in l], (pg.errors[:3], logs[:3]))
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); a.settings.light = 'day'; a.settings.sunDay = 172; a.settings.sunTime = 14 * 60; a.refreshViews(false); }"); settle(pg, 9000)
    pg.evaluate(ROOF); settle(pg, 7000)
    ph = settled(pg, 'a.k > 1.3')
    check('phone: measured too, the close look at the roof brought up', ph['on'] and ph['L'] > 0 and 1.3 < ph['k'] <= 1.8, ph)
    pg.screenshot(path=SHOTS + 'r27-phone-roof.png')
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
