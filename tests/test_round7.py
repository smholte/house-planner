"""Seventh round (29 Oct, night): "Above the floor" of a piece can go below zero (e.g. -5 cm), to lower an imported
model that floats; a minus sign typed as − or with a comma works too; too far down (below -500 cm) is refused;
empty goes back to normal; undo; in 3D the piece goes down; the phone gets a keyboard with a minus sign. PC and phone."""
from common import *

FZ = "(id) => { const f = window.__hp.app.activeLayout().items.find(x => x.id === id); return f.z === undefined ? null : f.z; }"
Y3 = """(id) => { let y = null; window.__hp.app.panes[0].view.group.traverse(o => { if (y === null && o.userData && o.userData.furn === id && o.parent && !(o.parent.userData && o.parent.userData.furn === id)) y = +o.position.y.toFixed(3); }); return y; }"""

def setz(pg, val):
    pg.fill('#f-furn-z', val); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)

for phone in (False, True):
    tag = ' (phone)' if phone else ''
    with sync_playwright() as p:
        b, pg = open_app(p, phone=phone, theme='dark' if phone else 'light')
        open_example(pg)
        (pg.tap if phone else pg.click)('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(1500)
        # a 3D model of the example (a cupboard on the 1e verdieping)
        fid = pg.evaluate("""() => { const a = window.__hp.app, f = a.activeLayout().items.find(x => x.type === 'model'); a.setScope('storey', f.storey); a.select({ type: 'furn', ids: [f.id] }); if (a.toggleInspector) a.toggleInspector(true); return f.id; }""")
        pg.wait_for_timeout(1200)
        check('a model\'s details have "Above the floor"' + tag, pg.is_visible('#f-furn-z'))
        mode = pg.get_attribute('#f-furn-z', 'inputmode')
        check('it opens a keyboard with a minus sign' + tag, mode == 'text', mode)
        z0 = pg.evaluate(FZ, fid)
        setz(pg, '-5')
        check('-5 cm: the model goes 5 cm into the floor' + tag, pg.evaluate(FZ, fid) == -0.05, pg.evaluate(FZ, fid))
        check('the field shows -5' + tag, pg.input_value('#f-furn-z') in ('-5', '-5,0'), pg.input_value('#f-furn-z'))
        setz(pg, '−12,5')
        check('a minus typed as − with a comma: -12,5 cm' + tag, abs(pg.evaluate(FZ, fid) + 0.125) < 1e-9, pg.evaluate(FZ, fid))
        setz(pg, '-900')
        check('below -500 cm is refused (stays -12,5)' + tag, abs(pg.evaluate(FZ, fid) + 0.125) < 1e-9, pg.evaluate(FZ, fid))
        if not phone:
            pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000); still(pg)
            y = pg.evaluate(Y3, fid)
            check('3D: the model stands 12,5 cm lower', y is not None and abs(y + 0.125) < 0.002, y)
            pg.keyboard.press('Control+z'); pg.wait_for_timeout(1200)
            check('undo: back to -5 cm', pg.evaluate(FZ, fid) == -0.05, pg.evaluate(FZ, fid))
            pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(1500)
            pg.evaluate("(id) => { const a = window.__hp.app; a.select({ type: 'furn', ids: [id] }); }", fid); pg.wait_for_timeout(800)
        setz(pg, '')
        check('empty: back to normal (on the floor)' + tag, pg.evaluate(FZ, fid) is None and z0 is None, [z0, pg.evaluate(FZ, fid)])
        if not phone:
            # a piece that is not a model can go down too (a box), and outside (a car on the parking) it is counted from the garden
            cid = pg.evaluate("""() => { const a = window.__hp.app, st = [...a.project.storeys].sort((x, y) => x.level - y.level)[0], T = window.__hp.FURN_TYPES.find(t => t.id === 'car_208');
              const it = { id: 'f_testcar', type: 'car_208', storey: st.id, x: 16.0, y: 10.5, rot: 0, w: T.w, d: T.d, h: T.h, color: T.color, z: -0.03 };
              a.setScope('storey', st.id); a.mutate(() => { a.activeLayout().items.push(it); }, { project: true }); return it.id; }""")
            pg.wait_for_timeout(1000)
            pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000); still(pg)
            yc = pg.evaluate(Y3, cid)
            check('outside: a car at -3 cm sits 3 cm into the parking (garden 15 cm below the floor)', yc is not None and abs(yc - (-0.15 + 0.02 - 0.03)) < 0.002, yc)
        pg.screenshot(path=SHOTS + ('r7-phone.png' if phone else 'r7-pc.png'))
        check('no page errors' + tag, not pg.errors, pg.errors[:3])
        b.close()
sys.exit(summary())
