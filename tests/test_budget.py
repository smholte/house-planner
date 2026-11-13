"""Budget: categories with planned and paid amounts, items of your own (a tool that is not in the house: name, photo,
link, price, paid), materials taken from the quantities (their amount follows the version), an item only in one
version, the difference with another version, budgets per category and in total, the furniture from the shopping
list, the spreadsheet, kept in the house file; on a phone too."""
from common import *
from PIL import Image, ImageDraw

PHOTO = SHOTS + 'sprayer.jpg'
im = Image.new('RGB', (600, 450), (240, 240, 236)); d = ImageDraw.Draw(im)
d.rectangle([180, 120, 420, 380], fill=(210, 40, 40)); d.rectangle([250, 60, 350, 130], fill=(60, 60, 60)); im.save(PHOTO, quality=88)

BUD = "() => { const a = window.__hp.app; const R = window.__hp.budgetFor(a.project, a.shownVersion()); return { planned: R.planned, paid: R.paid, cats: R.cats.map(c => ({ id: c.id, planned: c.planned, paid: c.paid, n: c.lines.length })) }; }"
BUDV = "(vid) => { const a = window.__hp.app; const v = a.project.versions.find(x => x.id === vid); const R = window.__hp.budgetFor(a.project, v); return R.planned; }"

def add_item(pg, name, cat, qty, price, status=None, paid=None, ver=None, photo=None, link=None):
    pg.click('#bud-add'); pg.wait_for_selector('#bi-name')
    pg.fill('#bi-name', name); pg.select_option('#bi-cat', cat)
    if qty is not None: pg.fill('#bi-qty', qty)
    pg.fill('#bi-price', price)
    if status: pg.click(f'#bi-status button[data-k="{status}"]')
    if paid: pg.fill('#bi-paid', paid)
    if ver: pg.select_option('#bi-ver', ver)
    if link: pg.fill('#bi-link', link)
    if photo:
        with pg.expect_file_chooser() as fc:
            pg.click('#bi-photo-add')
        fc.value.set_files(photo); pg.wait_for_timeout(900)
    pg.click('.scrim:last-child .dialog .dlg-foot .btn.primary:has-text("Save")'); pg.wait_for_timeout(600)

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    # (since round 38 the example has a budget line for your floor: taken out here, this file tests the budget itself)
    had = pg.evaluate("() => { const a = window.__hp.app, n = ((a.project.budget || {}).items || []).filter(i => window.__hp.ownId(i.id)).length; a.mutate(p => { if (p.budget) p.budget.items = p.budget.items.filter(i => !window.__hp.ownId(i.id)); }, { project: true }); return n; }")
    # (… and your PVC floor lies in this plan: here the oak floor it had before, to price per m²)
    pg.evaluate("() => { const a = window.__hp.app; for (const r of a.shownVersion().plan.rooms) if (r.floor && r.floor.photo && window.__hp.ownId(r.floor.photo.img)) r.floor = { material: 'oak', color: '#C49A6C' }; a.refreshViews(false); }")
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(600)
    pg.click('#btn-budget'); pg.wait_for_timeout(700)
    # (the example's furniture is on the shopping list; nothing has been added to the budget yet)
    check('the example came with the line for your floor (round 38; the owner\'s house – none in the made-up one)', had == by_house(pg, 0, 1), had)
    check('the budget opens, nothing added yet', pg.is_visible('.bud-sum') and pg.evaluate("() => ((window.__hp.app.project.budget || {}).items || []).length") == 0)
    R0 = pg.evaluate(BUD)
    add_item(pg, 'Graco GX 21 paint sprayer', 'tools', '1', '1.249,00', status='ordered', paid='500', photo=PHOTO, link='https://www.graco.com')
    it = pg.evaluate("() => window.__hp.app.project.budget.items[0]")
    check('a tool that is not in the house: name, price, paid, photo, link', it['name'] == 'Graco GX 21 paint sprayer' and it['price'] == 1249 and it['paid'] == 500 and it['status'] == 'ordered' and it['photo'] and it['link'].startswith('https://'), it)
    check('its photo is shown', pg.evaluate("() => !!document.querySelector('.bud-line .bud-thumb img')"))
    R = pg.evaluate(BUD)
    check('planned € 1.249 more, paid € 500 more', R['planned'] - R0['planned'] == 1249 and R['paid'] - R0['paid'] == 500 and (R0['planned'] or pg.inner_text('#bud-planned') == '€ 1.249'), (R0, R['planned'], pg.inner_text('#bud-planned')))
    # materials from the quantities
    pg.click('#bud-add-mat'); pg.wait_for_selector('.bud-mats')
    keys = pg.evaluate("() => [...document.querySelectorAll('.bud-mats input[data-key]')].map(i => i.dataset.key)")
    fk = next(k for k in keys if k.startswith('floor|oak'))
    pk = next(k for k in keys if k.startswith('paint|'))
    pg.check(f'.bud-mats input[data-key="{fk}"]'); pg.check(f'.bud-mats input[data-key="{pk}"]')
    pg.click('.scrim:last-child .dialog .btn.primary:has-text("Add to the budget")'); pg.wait_for_timeout(700)
    items = pg.evaluate("() => window.__hp.app.project.budget.items.map(i => [i.name, i.mat, i.cat])")
    check('two materials taken over, in Floors and Walls', len(items) == 3 and sorted((x[1], x[2]) for x in items[1:]) == sorted([(fk, 'floors'), (pk, 'walls')]), items)
    # give the oak floor a price per m²
    pg.click(f'.bud-line[data-item]:has-text("Wood")'); pg.wait_for_selector('#bi-price')
    check('a material: the amount comes from the quantities', pg.is_visible('.bi-mat'))
    pg.wait_for_timeout(400)
    pg.fill('#bi-price', '42,50'); pg.click('.scrim:last-child .dialog .btn.primary:has-text("Save")')
    # (a busy test browser can be slow to save: wait until the price is in)
    pg.wait_for_function("(k) => window.__hp.app.project.budget.items.some(i => i.mat === k && i.price === 42.5)", arg=fk, timeout=20000); pg.wait_for_timeout(300)
    oak = pg.evaluate("(k) => window.__hp.houseQuantities(window.__hp.app.project, window.__hp.app.shownVersion().plan).materials.find(m => m.key === k).amount", fk)
    R = pg.evaluate(BUD)
    floors = next(c for c in R['cats'] if c['id'] == 'floors')
    check('oak floor: m² of this version × € 42,50', near(floors['planned'], oak * 42.5, 0.01), (floors['planned'], oak))
    # a kitchen only in this version
    vid = pg.evaluate("() => window.__hp.app.shownVersion().id")
    add_item(pg, 'Kitchen: IKEA Metod, oak fronts', 'kitchen', '1', '12000', ver=vid)
    # category and total budgets
    pg.click('.bud-cat[data-cat="kitchen"] .bud-cat-budget'); pg.wait_for_selector('#dlg-input')
    pg.fill('#dlg-input', '10.000'); pg.click('.scrim:last-child .dialog .btn.primary'); pg.wait_for_timeout(600)
    check('kitchen budget € 10.000: over it is marked', pg.evaluate("() => window.__hp.app.project.budget.cats.find(c => c.id === 'kitchen').budget") == 10000 and pg.is_visible('.bud-cat.over[data-cat="kitchen"]'))
    pg.fill('#bud-total', '50000'); pg.press('#bud-total', 'Tab'); pg.wait_for_timeout(600)
    check('total budget € 50.000', pg.evaluate("() => window.__hp.app.project.budget.total") == 50000)
    # compare with the original
    orig = pg.evaluate("() => window.__hp.app.project.versions.find(v => v.kind === 'original').id")
    pg.select_option('#bud-cmp', orig); pg.wait_for_timeout(600)
    a, o = pg.evaluate(BUD)['planned'], pg.evaluate(BUDV, orig)
    txt = pg.inner_text('.bud-diff')
    check('compared with the original: the kitchen and the oak floor are only in this plan', a - o >= 12000 + oak * 42.5 - 0.5 and 'more than' in txt, (a, o, txt))
    check('the categories show the difference', pg.evaluate("() => document.querySelectorAll('.bud-delta').length") >= 2)
    pg.screenshot(path=SHOTS + 'budget.png')
    # furniture from the shopping list
    pg.evaluate("() => { const a = window.__hp.app; a.mutate(p => { const l = p.furniture.layouts.find(x => x.id === p.furniture.activeLayoutId); l.items.push({ id: 'f_test_sofa', type: 'sofa', storey: p.storeys[0].id, x: 3, y: 11, rot: 0, w: 2.2, d: 0.9, h: 0.8, color: '#777777', shop: { price: 899, status: 'bought' } }); }, { project: true }); }")
    pg.select_option('#bud-cmp', ''); pg.wait_for_timeout(300)
    pg.fill('#bud-total', '50000'); pg.press('#bud-total', 'Tab'); pg.wait_for_timeout(600)
    R = pg.evaluate(BUD)
    fur = next(c for c in R['cats'] if c['id'] == 'furniture')
    check('furniture from the shopping list counts (bought = paid)', fur['planned'] >= 899 and fur['paid'] >= 899 and pg.is_visible('.bud-line.furn'), fur)
    with pg.expect_download() as dl:
        pg.click('.dlg-foot button:has-text("Spreadsheet")')
    csv = open(dl.value.path(), encoding='utf-8-sig').read().splitlines()
    check('spreadsheet: a line per item and the totals', any('Graco GX 21' in l and '1249' in l for l in csv) and any(l.startswith('"Planned"') for l in csv), csv[:3])
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    data = json.loads(text)
    pr = data['projects'][0]['project']
    check('kept in the house file, with the photo', len(pr['budget']['items']) == 4 and pr['budget']['items'][0]['photo'] in json.dumps(data.get('assets', data['projects'][0].get('assets', {}))), list(data.keys()))
    vb = pg.evaluate("async () => (await window.__hp.app.buildViewerData(window.__hp.app.project, { version: '__all', layout: '__all', notes: true, drawings: false })).projects[0].project.budget || null")
    check('a viewer copy (family, suppliers) has no budget', vb is None, vb)
    # delete
    pg.click('#btn-budget') if pg.is_visible('#btn-budget') else None
    pg.wait_for_timeout(500)
    if not pg.is_visible('.bud-list'):
        pg.evaluate("() => window.__hp.app.budgetSheet()"); pg.wait_for_timeout(500)
    pg.click('.bud-line[data-item]:has-text("Graco")'); pg.wait_for_selector('#bi-name')
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Delete")'); pg.wait_for_timeout(600)
    check('an item can be deleted', len(pg.evaluate("() => window.__hp.app.project.budget.items")) == 3)
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    # (since round 38 the example has a budget line for your floor: taken out here, this file tests the budget itself)
    had = pg.evaluate("() => { const a = window.__hp.app, n = ((a.project.budget || {}).items || []).filter(i => window.__hp.ownId(i.id)).length; a.mutate(p => { if (p.budget) p.budget.items = p.budget.items.filter(i => !window.__hp.ownId(i.id)); }, { project: true }); return n; }")
    pg.tap('#btn-menu'); pg.wait_for_timeout(400)
    pg.tap('.menu button:has-text("Budget")'); pg.wait_for_timeout(800)
    pg.tap('#bud-add'); pg.wait_for_selector('#bi-name')
    pg.fill('#bi-name', 'Ladder'); pg.select_option('#bi-cat', 'tools'); pg.fill('#bi-price', '89,95')
    pg.tap('.scrim:last-child .dialog .btn.primary:has-text("Save")'); pg.wait_for_timeout(700)
    check('phone: an item added', pg.evaluate("() => window.__hp.app.project.budget.items[0].price") == 89.95)
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'budget-phone.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
