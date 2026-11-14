"""One writer and failed saves (task 0027, safety audit findings 2, 4, 7): two tabs on one house – the second shows it
but saves nothing and says so, Take over reads the house again and writes it from then on, the first then stops;
a copy that finds the house written by someone else since it read it stops instead of overwriting; the clean-up at
start leaves young files alone (another copy's photo); a failed save (a full device) says so, tries again and
offers Export now; an emergency copy per house; the undo history capped by size, view state left out of undo;
Restart waits for a save that is being written. PC light and phone dark."""
from common import *
import time

WALLS = "() => window.__hp.app.project.versions.reduce((n, v) => n + ((v.plan && v.plan.walls) || []).length, 0)"
STORED_WALLS = """async (id) => { const p = await window.__hp.DB.get('projects', id); return p.versions.reduce((n, v) => n + ((v.plan && v.plan.walls) || []).length, 0); }"""
ADD = "(x) => window.__hp.app.addWall([x, 0], [x, 4], 0.1, 'interior')"
STATE = "() => [window.__hp.Saver.state, window.__hp.Saver.readonly, window.__hp.Saver.why]"
PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

def bar(pg): return pg.inner_text('#save-bar') if pg.locator('#save-bar').count() else ''
def settle(pg, ms=1200): pg.wait_for_timeout(ms)
def boot(pg):
    pg.goto(BASE); pg.wait_for_function("() => window.__hp && window.__hp.app && window.__hp.app.project", timeout=60000); settle(pg, 800)

def run(phone, theme):
    tag = 'phone dark' if phone else 'PC light'
    b, A = open_app(p, phone=phone, theme=theme)
    ctx = A.context
    A.click('#btn-new'); A.wait_for_timeout(400)
    A.fill('.dialog input', 'Two tabs'); A.click('.dialog .btn.primary'); A.wait_for_function("() => window.__hp.app.project", timeout=30000)
    hid = A.evaluate("() => window.__hp.app.project.id")
    settle(A)
    A.evaluate(ADD, 1); settle(A)
    check(f'[{tag}] tab A writes the house (holds the writer lock)', A.evaluate(STATE)[:2] == ['saved', False] and A.evaluate(STORED_WALLS, hid) == 1, A.evaluate(STATE))

    # ───── a second tab on the same house ─────
    B = ctx.new_page(); B.set_default_timeout(90000); B.errors = []; B.on('pageerror', lambda e: B.errors.append(str(e)))
    boot(B)
    check(f'[{tag}] tab B opens the same house by itself, read only', B.evaluate("() => window.__hp.app.project.id") == hid and B.evaluate(STATE)[:2] == ['elsewhere', True], B.evaluate(STATE))
    t = bar(B)
    check(f'[{tag}] tab B says so: “This house is open in another window – changes here are not saved.” + Take over',
          'open in another window' in t and 'not saved' in t and B.locator('#save-takeover').is_visible(), t)
    check(f'[{tag}] tab B: the save status reads “Not saved”', B.get_attribute('#save-status', 'data-state') == 'elsewhere')
    B.screenshot(path=SHOTS + f'onewriter_readonly_{"phone" if phone else "pc"}.png')
    A.evaluate(ADD, 2); settle(A)
    B.evaluate(ADD, 3); B.evaluate(ADD, 3.5); settle(B, 1500)
    B.evaluate("() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); }"); settle(B, 600)
    check(f'[{tag}] B\'s changes do not overwrite A\'s house (stored: A\'s 2 walls)', B.evaluate(STORED_WALLS, hid) == 2 and A.evaluate(WALLS) == 2, (B.evaluate(STORED_WALLS, hid), B.evaluate(WALLS)))
    check(f'[{tag}] B writes no emergency copy (it would bring its older house back)', not B.evaluate(f"() => Object.keys(localStorage).some(k => k.startsWith('house-planner.emergency'))"))

    # A adds a photo to a note; B (which never saw it) runs the clean-up of a start
    aid = A.evaluate("""async (png) => { const id = await window.__hp.Assets.put(png, 1, 1);
      window.__hp.app.mutate(p => { p.notes = p.notes || []; p.notes.push({ id: 'n_t27', text: 'photo', photos: [id], storeyId: p.storeys[0].id, x: 1, y: 1 }); }, { project: true });
      return id; }""", PNG)
    settle(A)
    young = B.evaluate("async (png) => { const id = 'as_young27'; await window.__hp.DB.put('assets', { id, dataUrl: png, w: 1, h: 1, created: Date.now() }); return id; }", PNG)
    oldid = B.evaluate("async (png) => { const id = 'as_old27'; await window.__hp.DB.put('assets', { id, dataUrl: png, w: 1, h: 1, created: Date.now() - 2 * 864e5 }); return id; }", PNG)
    B.evaluate(ADD, 4); settle(B)
    B.evaluate("() => window.__hp.Assets.collectGarbage()"); settle(B, 600)
    keys = B.evaluate("() => window.__hp.DB.allKeys('assets')")
    check(f'[{tag}] the clean-up keeps A\'s photo (B saved nothing over it)', aid in keys and B.evaluate("async (id) => (await window.__hp.DB.get('projects', id)).notes.some(n => n.id === 'n_t27')", hid))
    check(f'[{tag}] the clean-up keeps a file nothing refers to yet when it is younger than a day', young in keys, keys)
    check(f'[{tag}] the clean-up deletes a file nothing refers to that is two days old', oldid not in keys, keys)

    # ───── Take over ─────
    B.click('#save-takeover')
    B.wait_for_function("() => !window.__hp.Saver.readonly && window.__hp.Saver.state !== 'elsewhere'", timeout=30000); settle(B)
    check(f'[{tag}] Take over: B writes now, its house read again from storage (A\'s 2 walls and the note, B\'s unsaved walls gone)',
          B.evaluate(WALLS) == 2 and B.evaluate("() => (window.__hp.app.project.notes || []).some(n => n.id === 'n_t27')") and not bar(B), (B.evaluate(WALLS), bar(B)))
    A.wait_for_function("() => window.__hp.Saver.state === 'elsewhere'", timeout=30000); settle(A, 300)
    check(f'[{tag}] Take over: tab A stops writing and says so', A.evaluate(STATE)[:2] == ['elsewhere', True] and 'another window' in bar(A), (A.evaluate(STATE), bar(A)))
    A.evaluate(ADD, 5); settle(A)
    B.evaluate(ADD, 6); settle(B)
    check(f'[{tag}] after Take over: B\'s change stored, A\'s not', B.evaluate(STORED_WALLS, hid) == 3, B.evaluate(STORED_WALLS, hid))
    snap = B.evaluate("""async (id) => (await window.__hp.Snapshots.list(id)).filter(s => s.name === 'Unsaved changes from another window').map(s => s.project.versions.reduce((n, v) => n.concat(((v.plan && v.plan.walls) || []).map(w => w.a ? w.a[0] : (w.p1 || w.points || [[0]])[0])), []))""", hid)
    check(f'[{tag}] Take over keeps what B had not saved as an automatic backup', len(snap) >= 1, snap)
    # a stale copy cannot be written over the house the other tab writes (a merge or import in the read-only tab, a rename from an old list)
    r = A.evaluate("""async (id) => { const old = await window.__hp.DB.get('projects', id); old.name = 'Stale'; try { await window.__hp.DB.put('projects', old); return 'written'; } catch (e) { return e.code; } }""", hid)
    check(f'[{tag}] the read-only tab cannot write the house in any other way either (merge, import, rename: refused)', r == 'HP_ELSEWHERE' and B.evaluate("async (id) => (await window.__hp.DB.get('projects', id)).name", hid) != 'Stale', r)
    # A takes it back: its unsaved wall is kept as a backup; then A goes to the projects page and B writes again by itself
    A.click('#save-takeover')
    A.wait_for_function("() => !window.__hp.Saver.readonly", timeout=30000); settle(A)
    n = A.evaluate("""async (id) => (await window.__hp.Snapshots.list(id)).filter(s => s.name === 'Unsaved changes from another window').length""", hid)
    check(f'[{tag}] A takes it back: A\'s unsaved change is kept as a backup too ({n} backups), B stops', n >= 2 and B.evaluate(STATE)[:2] == ['elsewhere', True], (n, B.evaluate(STATE)))
    A.click('#btn-back'); A.wait_for_selector('#home:not([hidden])')
    B.wait_for_function("() => !window.__hp.Saver.readonly && window.__hp.Saver.state !== 'elsewhere'", timeout=30000); settle(B)
    check(f'[{tag}] the other tab leaves the house: B writes it again by itself (bar gone, the stored house)', not bar(B) and B.evaluate(WALLS) == B.evaluate(STORED_WALLS, hid) == 3, (bar(B), B.evaluate(WALLS)))
    A.click('.pcard .pcard-actions .btn.primary'); A.wait_for_function("() => window.__hp.app.project", timeout=30000); settle(A)
    check(f'[{tag}] A opens it again: read only now', A.evaluate(STATE)[:2] == ['elsewhere', True], A.evaluate(STATE))

    # ───── written by someone else in between (a copy without the lock, a frozen tab) ─────
    B.evaluate("""async (id) => { const p = await window.__hp.DB.get('projects', id); p.name = 'Written elsewhere'; p.updated = Date.now() + 5; await window.__hp.DB.put('projects', p); }""", hid)
    B.evaluate(ADD, 7); settle(B, 1500)
    st = B.evaluate(STATE)
    check(f'[{tag}] a house written by another copy since B read it is not overwritten', B.evaluate("async (id) => (await window.__hp.DB.get('projects', id)).name", hid) == 'Written elsewhere' and B.evaluate(STORED_WALLS, hid) == 3)
    check(f'[{tag}] … and B says so: “This house was changed in another window”', st == ['elsewhere', True, 'changed'] and 'changed in another window' in bar(B), (st, bar(B)))
    B.click('#save-takeover')
    B.wait_for_function("() => !window.__hp.Saver.readonly", timeout=30000); settle(B)
    check(f'[{tag}] Take over after that: the other copy\'s house is shown (its name)', B.evaluate("() => window.__hp.app.project.name") == 'Written elsewhere')

    # ───── a save that fails ─────
    B.evaluate("""() => { const S = window.__hp.Saver, D = window.__hp.DB; S.retryMs = 1200; window.__failSave = true; window.__tries = 0;
      const put = D.putProject.bind(D); D.putProject = (v, base) => { window.__tries++; if (window.__failSave) return Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError')); return put(v, base); }; }""")
    B.evaluate(ADD, 8)
    B.wait_for_selector('#save-bar', timeout=10000); settle(B, 200)
    t = bar(B)
    check(f'[{tag}] a failed save (a full device) shows a message, not only the dot: “Not saved – this device is full. Trying again …”',
          'device is full' in t and 'Trying again' in t and B.locator('#save-bar').is_visible(), t)
    check(f'[{tag}] … the save status reads “Not saved”', B.get_attribute('#save-status', 'data-state') == 'error')
    check(f'[{tag}] … the emergency copy of this house is written', B.evaluate("(id) => !!localStorage.getItem('house-planner.emergency.' + id)", hid))
    B.screenshot(path=SHOTS + f'onewriter_failed_{"phone" if phone else "pc"}.png')
    B.wait_for_function("() => window.__tries >= 3", timeout=20000); settle(B, 300)
    t = bar(B)
    check(f'[{tag}] it tries again by itself ({B.evaluate("() => window.__tries")} tries); still failing: “Export a copy now” with Export now',
          'Export a copy now' in t and B.locator('#save-export').is_visible(), t)
    with B.expect_download(timeout=30000) as dl:
        B.click('#save-export')
    check(f'[{tag}] Export now: one tap saves a copy of the house', dl.value.suggested_filename.endswith('.gz') or '.house' in dl.value.suggested_filename, dl.value.suggested_filename)
    B.evaluate("() => { window.__failSave = false; }")
    B.wait_for_function("() => window.__hp.Saver.state === 'saved'", timeout=20000); settle(B, 300)
    check(f'[{tag}] the next try saves it: message gone, the change stored, no emergency copy left',
          not bar(B) and B.evaluate(STORED_WALLS, hid) == 4 and not B.evaluate("(id) => !!localStorage.getItem('house-planner.emergency.' + id)", hid), (bar(B), B.evaluate(STORED_WALLS, hid)))
    tr = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'i18n', 'translations.json'), encoding='utf-8'))
    texts = ['This house is open in another window – changes here are not saved.', 'This house was changed in another window – changes here are not saved.', 'Take over',
             'Not saved – this device is full.', 'Not saved – the browser did not store the change.', 'Trying again every 30 seconds.',
             'Still not saved. Export a copy now so nothing is lost.', 'Export now', 'Saved again.', 'This window saves the house now.',
             'The other window still has this house. Close it there, then try again.']
    check(f'[{tag}] the new texts in Dutch and Norwegian', all(k in tr and len(tr[k]) == 2 and all(tr[k]) for k in texts), [k for k in texts if k not in tr])

    # ───── undo: capped by size, view state left out ─────
    cap = B.evaluate("() => window.__hp.undoCap()")
    check(f'[{tag}] undo cap without a test value: {"15 MB on a phone" if phone else "60 MB on a computer"}', cap == (15 if phone else 60) * 1024 * 1024, cap)
    one = B.evaluate("() => window.__hp.undoBytes(JSON.stringify(window.__hp.app.project))")
    B.evaluate("(c) => { window.__hpUndoCap = c; }", int(one * 4.5))
    t0 = B.evaluate("() => Date.now()")
    for i in range(10): B.evaluate(ADD, 10 + i * 0.3)
    U = B.evaluate("() => [window.__hp.app.undoStack.length, window.__hp.app.undoSize(), window.__hp.app.undoStack[0].t]")
    check(f'[{tag}] undo history kept under its size (cap 4.5 steps: {U[0]} steps, {U[1]} of {int(one * 4.5)} bytes), the oldest dropped', 3 <= U[0] <= 4 and U[1] <= one * 4.5 + 1 and U[2] > t0, U)
    n0 = B.evaluate(WALLS)
    B.evaluate("() => window.__hp.app.undo()")
    check(f'[{tag}] undo still works after trimming', B.evaluate(WALLS) == n0 - 1)
    B.evaluate("() => { window.__hpUndoCap = 0; }")
    B.evaluate(ADD, 20)
    B.evaluate("() => { const a = window.__hp.app, p = a.project; p.doorState = { d27: 'closed' }; p.viewSettings = Object.assign({}, p.viewSettings, { ghost: true }); window.__hp.Saver.markDirty(); }")
    B.evaluate("() => window.__hp.app.undo()")
    ds = B.evaluate("() => [window.__hp.app.project.doorState, (window.__hp.app.project.viewSettings || {}).ghost]")
    check(f'[{tag}] undo leaves what was saved without an undo step alone (a door closed, a view setting)', ds[0] == {'d27': 'closed'} and ds[1] is True, ds)
    settle(B)

    # ───── Restart waits for a save that is being written ─────
    B.evaluate("""() => { const D = window.__hp.DB; const put = D.putProject.bind(D);
      D.putProject = async (v, base) => { await new Promise(r => setTimeout(r, 1500)); const ok = await put(v, base); window.__putDone = Date.now(); return ok; }; }""")
    B.evaluate(ADD, 21)
    B.evaluate("() => { window.__hp.Saver.flush(); }")   # a write is under way
    B.wait_for_timeout(100)
    r = B.evaluate("""async () => { await window.__hp.app.restartForUpdate({ postMessage: () => { window.__posted = Date.now(); } }, null); return [window.__posted || 0, window.__putDone || 0]; }""")
    check(f'[{tag}] Restart waits for the save under way before the new version takes over', r[1] and r[0] >= r[1], r)
    B.wait_for_function("() => !window.__posted && window.__hp && window.__hp.app && window.__hp.app.project", timeout=60000); settle(B)
    want = A.evaluate(STORED_WALLS, hid)
    A.wait_for_function("() => !window.__hp.Saver.readonly", timeout=30000); settle(A, 300)
    check(f'[{tag}] after the restart the house has that change ({want} walls); A (which waited) writes now, B shows it read only – one writer',
          B.evaluate(WALLS) == want and want >= 5 and A.evaluate(STATE)[1] is False and B.evaluate(STATE)[:2] == ['elsewhere', True], (B.evaluate(WALLS), want, A.evaluate(STATE), B.evaluate(STATE)))

    # ───── emergency copies: one per house, never one of a house another copy has open ─────
    B.evaluate("""(id) => { const p = JSON.parse(JSON.stringify(window.__hp.app.project)); p.name = 'From the emergency copy'; p.updated = Date.now() + 1000;
      localStorage.setItem('house-planner.emergency.' + id, JSON.stringify({ id, updated: p.updated, project: p })); }""", hid)
    C = ctx.new_page(); C.set_default_timeout(90000); C.errors = []; C.on('pageerror', lambda e: C.errors.append(str(e)))
    boot(C)
    check(f'[{tag}] a new tab does not bring back the emergency copy of a house another tab has open',
          C.evaluate("async (id) => (await window.__hp.DB.get('projects', id)).name", hid) == 'Written elsewhere' and C.evaluate("(id) => !!localStorage.getItem('house-planner.emergency.' + id)", hid))
    C.close(); B.close()
    A.reload(); A.wait_for_function("() => window.__hp && window.__hp.app && window.__hp.app.project", timeout=60000); settle(A)
    check(f'[{tag}] alone again: the emergency copy comes back at start (and A writes again)',
          A.evaluate("() => window.__hp.app.project.name") == 'From the emergency copy' and A.evaluate(STATE)[:2] == ['saved', False], (A.evaluate("() => window.__hp.app.project.name"), A.evaluate(STATE)))
    check(f'[{tag}] no page error', not A.errors and not B.errors and not C.errors, A.errors + B.errors + C.errors)
    b.close()

with sync_playwright() as p:
    run(False, 'light')
    run(True, 'dark')
sys.exit(summary())
