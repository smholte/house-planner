"""Side by side with any two versions (task 0034): a picker on each side (the Original included), swap, the pair
remembered per house, the ways in from Versions and the Changes details; both sides fitted to the storey on the PC and
the phone (portrait: one above the other, landscape: next to each other, refitted when the phone turns).
PC light and phone dark."""
from common import *

FIT = """() => window.__hp.app.panes.map(pn => { const v = pn.view, en = v.spec.entries.find(e => !e.wallsOnly), bb = en.bbox;
  const p0 = v.toScreen([bb.minX, bb.minY]), p1 = v.toScreen([bb.maxX, bb.maxY]), r = pn.el.getBoundingClientRect();
  return { W: v.W, H: v.H, x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1], left: r.left, top: r.top, w: r.width, h: r.height }; })"""
PAIR = "() => { const a = window.__hp.app; return [a.baseVersion().name, a.shownVersion().name]; }"
OPEN = "() => { const p = window.__hp.app.project; return p.versions.find(v => v.id === p.activeVersionId).name; }"
LABELS = "() => [...document.querySelectorAll('.pane-pick .pp-name')].map(e => e.textContent)"


def names(pg):
    """the Original, the open version and another planned one (made when the house has only one)"""
    pg.evaluate("""() => { const a = window.__hp.app, p = a.project; if (p.versions.filter(v => v.kind !== 'original').length < 2) {
      const open = p.activeVersionId; a.createVersionFrom(open, 'Plan – test'); p.activeVersionId = open; a.setupPanes(true); } }""")
    pg.wait_for_timeout(600)
    return pg.evaluate("""() => { const p = window.__hp.app.project, o = p.versions.find(v => v.kind === 'original'), s = p.versions.find(v => v.id === p.activeVersionId);
      return [o.name, s.name, p.versions.find(v => v.kind !== 'original' && v.id !== s.id && v.status !== 'disabled').name]; }""")


def fitted(pg, what):
    """both sides show the whole storey (inside the pane) and use most of the room there is"""
    out = pg.evaluate(FIT)
    ok = len(out) == 2
    for f in out:
        inside = f['x0'] >= -1 and f['y0'] >= -1 and f['x1'] <= f['W'] + 1 and f['y1'] <= f['H'] + 1
        big = (f['x1'] - f['x0']) >= 0.6 * f['W'] or (f['y1'] - f['y0']) >= 0.6 * f['H']
        ok = ok and inside and big
    return check(what, ok, out)


def pick(pg, role, name, tap=False):
    (pg.tap if tap else pg.click)(f'.pane-pick[data-role="{role}"]'); pg.wait_for_selector('.menu .mi')
    (pg.tap if tap else pg.click)(f'.menu .mi:has-text("{name}")'); pg.wait_for_timeout(700)


def pc(p):
    b, pg = open_app(p, theme='light')
    open_example(pg)
    ORIG, STUDY, KITCHEN = names(pg)
    pg.click('#btn-compare'); pg.wait_for_selector('.pane-pick'); pg.wait_for_timeout(600)
    check('side by side: Original left, the open version right', pg.evaluate(PAIR) == [ORIG, STUDY] and pg.evaluate(LABELS) == [ORIG, STUDY], pg.evaluate(LABELS))
    fitted(pg, 'PC: both sides fitted to the storey')
    f = pg.evaluate(FIT)
    check('PC: the two sides next to each other', abs(f[0]['top'] - f[1]['top']) < 2 and f[1]['left'] > f[0]['left'] + 100, f)
    # any two versions in two taps
    pg.click('.pane-pick[data-role="base"]'); pg.wait_for_selector('.menu .mi')
    items = pg.evaluate("() => [...document.querySelectorAll('.menu .mi')].map(e => e.textContent.trim())")
    check('the left picker lists the versions, the Original included', {ORIG, STUDY, KITCHEN} <= set(items), items)
    pg.click(f'.menu .mi:has-text("{KITCHEN}")'); pg.wait_for_timeout(700)
    check('two taps: open kitchen | study', pg.evaluate(PAIR) == [KITCHEN, STUDY] and pg.evaluate(LABELS) == [KITCHEN, STUDY], pg.evaluate(LABELS))
    check('… the Changes details list this pair', pg.evaluate("() => document.querySelector('#f-compare-base').selectedOptions[0].textContent") == KITCHEN and STUDY in pg.inner_text('.inspector'))
    diff = pg.evaluate("() => window.__hp.app.currentDiff && window.__hp.app.currentDiff.count")
    check('… the differences marked (walls, rooms)', bool(diff) and pg.query_selector('.legend') is not None, diff)
    pick(pg, 'main', ORIG)
    check('the right side can show the Original', pg.evaluate(PAIR) == [KITCHEN, ORIG])
    check('… the open version stays open', pg.evaluate(OPEN) == STUDY)
    pick(pg, 'main', KITCHEN)
    check('picking the other side\'s version swaps the two', pg.evaluate(PAIR) == [ORIG, KITCHEN], pg.evaluate(PAIR))
    pg.click('.pane-swap'); pg.wait_for_timeout(700)
    check('⇄ swaps the sides', pg.evaluate(PAIR) == [KITCHEN, ORIG] and pg.evaluate(LABELS) == [KITCHEN, ORIG])
    first = pg.evaluate("() => window.__hp.app.view.storeyId")
    pg.click('#storey-tabs button >> nth=1'); pg.wait_for_timeout(1200)
    check('another storey shown', pg.evaluate("() => window.__hp.app.view.storeyId") != first)
    fitted(pg, 'another storey: both sides fitted again')
    pg.click('#storey-tabs button >> nth=0'); pg.wait_for_timeout(1200)
    pick(pg, 'base', STUDY); pick(pg, 'main', KITCHEN)
    pg.screenshot(path=SHOTS + 'sbs-pc.png', clip={'x': 0, 'y': 60, 'width': 960, 'height': 600})
    # remembered: closed and opened again, and after a restart
    pg.click('#btn-compare'); pg.wait_for_timeout(800)
    check('closed: one pane, Plan – study still open', len(pg.evaluate("() => window.__hp.app.panes")) == 1 and pg.evaluate(OPEN) == STUDY and pg.evaluate("() => window.__hp.app.shownVersion().name") == STUDY)
    pg.click('#btn-compare'); pg.wait_for_selector('.pane-pick'); pg.wait_for_timeout(600)
    check('opened again: the last pair', pg.evaluate(PAIR) == [STUDY, KITCHEN], pg.evaluate(PAIR))
    pg.reload(); pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__hp.app.openProject(window.__hp.app.settings.lastProject)"); pg.wait_for_timeout(2500)
    pg.click('#btn-compare'); pg.wait_for_selector('.pane-pick'); pg.wait_for_timeout(600)
    check('after a restart: the pair kept for this house', pg.evaluate(PAIR) == [STUDY, KITCHEN], pg.evaluate(PAIR))
    fitted(pg, '… fitted')
    pg.click('#btn-compare'); pg.wait_for_timeout(800)
    # the way in from Versions: ⋯ → Compare with the open version
    pg.click('#btn-version'); pg.wait_for_selector(f'[aria-label="More for {KITCHEN}"]')
    pg.click(f'[aria-label="More for {KITCHEN}"]'); pg.wait_for_timeout(300)
    pg.click('.menu .mi:has-text("Compare with the open version")'); pg.wait_for_selector('.pane-pick'); pg.wait_for_timeout(800)
    check('Versions → ⋯ → Compare: side by side with that pair', pg.evaluate("() => window.__hp.app.sideBySide") and pg.evaluate(PAIR) == [KITCHEN, STUDY], pg.evaluate(PAIR))
    # the Changes details pick the left side
    pg.select_option('#f-compare-base', label=ORIG + ' (original)'); pg.wait_for_timeout(800)
    check('the Changes details change the left side', pg.evaluate(LABELS) == [ORIG, STUDY], pg.evaluate(LABELS))
    check('… and that pair is remembered', pg.evaluate("() => JSON.parse(localStorage.getItem('house-planner.ui.' + window.__hp.app.project.id)).pair.length") == 2)
    check('PC: no page errors', not pg.errors, pg.errors)
    b.close()


def phone(p):
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    ORIG, STUDY, KITCHEN = names(pg)
    pg.tap('#btn-display'); pg.wait_for_selector('.menu .mi')
    pg.tap('.menu .mi:has-text("Side by side")'); pg.wait_for_selector('.pane-pick'); pg.wait_for_timeout(800)
    f = pg.evaluate(FIT)
    check('phone portrait: one side above the other', len(f) == 2 and f[1]['top'] > f[0]['top'] + 100 and abs(f[0]['left'] - f[1]['left']) < 2, f)
    fitted(pg, 'phone portrait: both sides fitted to the storey')
    lab = pg.evaluate("() => [...document.querySelectorAll('.pane-pick')].map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return [r.width, r.height, parseFloat(s.fontSize)]; })")
    check('phone: the pickers readable and big enough to tap', all(w > 80 and h >= 36 and fs >= 13 for w, h, fs in lab), lab)
    pick(pg, 'base', KITCHEN, tap=True)
    check('phone: two taps pick the left side', pg.evaluate(PAIR) == [KITCHEN, STUDY], pg.evaluate(PAIR))
    pg.tap('.pane-swap'); pg.wait_for_timeout(700)
    check('phone: ⇄ swaps', pg.evaluate(PAIR) == [STUDY, KITCHEN])
    pg.screenshot(path=SHOTS + 'sbs-phone.png')
    # the phone turned: next to each other, fitted again
    pg.set_viewport_size({'width': 844, 'height': 390})
    pg.wait_for_function("() => { const p = window.__hp.app.panes; return p.length === 2 && Math.abs(p[0].view.H - p[1].view.H) < 2 && p[0].view.W > p[0].view.H; }")
    pg.wait_for_timeout(800)
    f = pg.evaluate(FIT)
    check('phone landscape: the two sides next to each other', abs(f[0]['top'] - f[1]['top']) < 2 and f[1]['left'] > f[0]['left'] + 100, f)
    fitted(pg, 'phone landscape: both sides fitted again')
    pg.screenshot(path=SHOTS + 'sbs-phone-landscape.png')
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.wait_for_function("() => { const p = window.__hp.app.panes; return p.length === 2 && p[0].view.H > p[0].view.W * 0.7; }")
    pg.wait_for_timeout(800)
    fitted(pg, 'phone turned back: fitted again')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()


with sync_playwright() as p:
    pc(p)
    phone(p)
sys.exit(summary())
