"""Task 0033 (I25): photos of the bare walls. On a building visit the owner photographs each wall before it is closed
(pipes, cables, boxes) and attaches the photo to that wall: Add photo in the wall views and in room details → the open
wall (the camera directly on a phone, the gallery second; a file picker on the PC), several per wall with the date
(from the photo's EXIF, else today) and a short text; thumbnails, full screen with swipe and delete (asks first);
a camera mark on walls with photos in room details and a wall's details, "k of n walls" per room; seen in every
version with that wall (they belong to the house); made smaller (≤ 1600 px) with a thumbnail; in the wall views
PDF; kept by export → import, merge and the viewer copy. PC (light) and phone (dark)."""
from common import *
import re, struct, tempfile, json

FX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures') + os.sep
tmp = tempfile.mkdtemp()
SELROOM = "(n) => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === n && r.storey === a.view.storeyId); a.select({ type: 'room', id: r.id, storey: r.storey }); }"
PHOTOS = "() => JSON.parse(JSON.stringify(window.__hp.app.project.wallPhotos || []))"


def with_exif(src, dst, when=b'2026:09:14 10:31:05'):
    """the sample JPEG with an EXIF block: DateTimeOriginal = when (the date the photo was taken)"""
    data = open(src, 'rb').read()
    assert data[:2] == b'\xff\xd8'
    s = when + b'\x00'                                     # 20 bytes
    # TIFF (little endian): IFD0 at 8 with one entry (ExifIFD pointer) → ExifIFD at 26 with one entry (DateTimeOriginal)
    tiff = b'II*\x00' + struct.pack('<I', 8)
    tiff += struct.pack('<H', 1) + struct.pack('<HHII', 0x8769, 4, 1, 26) + struct.pack('<I', 0)
    tiff += struct.pack('<H', 1) + struct.pack('<HHII', 0x9003, 2, len(s), 44) + struct.pack('<I', 0)
    tiff += s
    app1 = b'Exif\x00\x00' + tiff
    open(dst, 'wb').write(data[:2] + b'\xff\xe1' + struct.pack('>H', len(app1) + 2) + app1 + data[2:])


def big_picture(pg, path, w=4000, h=3000):
    """a large photo (as from a phone camera), made in the page"""
    b64 = pg.evaluate("""([w, h]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#b55'); gr.addColorStop(1, '#5b5'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1]; }""", [w, h])
    import base64
    open(path, 'wb').write(base64.b64decode(b64))


EXIF = os.path.join(tmp, 'wall-exif.jpg'); with_exif(FX + 'sample-tile.jpg', EXIF)
BIG = os.path.join(tmp, 'wall-big.jpg')


def open_views(pg, room, phone=False):
    pg.evaluate(SELROOM, room); pg.wait_for_timeout(700)
    pg.locator('#f-wall-views').scroll_into_view_if_needed()
    (pg.tap if phone else pg.click)('#f-wall-views'); pg.wait_for_timeout(1500)


def close_dialog(pg, phone=False):
    (pg.tap if phone else pg.click)('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(500)


with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    big_picture(pg, BIG)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(800)
    # an old house: no wallPhotos field at all
    check('an old house has no wall photos field: the wall views open without it', pg.evaluate("() => window.__hp.app.project.wallPhotos === undefined"))
    open_views(pg, 'Keuken')
    n_cards = pg.locator('.wv-card:not(.wv-floor)').count()   # the walls (a tiled floor has a card of its own, 0036)
    check('wall views: a photo strip under every wall', pg.locator('.wv-card .wp-strip').count() == n_cards and n_cards >= 3, n_cards)
    check('… “No photo of the bare wall yet” and an Add photo button (PC: a file picker)', pg.locator('.wv-card').first.locator('.wp-add').count() == 1 and 'No photo' in pg.locator('.wv-card .wp-title').first.inner_text())
    # add two photos to wall A: one with an EXIF date, one big without
    with pg.expect_file_chooser() as fc:
        pg.locator('.wv-card').first.locator('.wp-add').click()
    check('… the picker takes pictures, several at once, no camera on the PC', fc.value.is_multiple() and pg.evaluate("() => { const i = document.querySelector('input.wp-input'); return !!i && i.accept === 'image/*' && !i.hasAttribute('capture'); }"))
    fc.value.set_files([EXIF, BIG])
    pg.wait_for_function("() => (window.__hp.app.project.wallPhotos || []).length === 2", timeout=30000)
    pg.wait_for_function("() => document.querySelectorAll('.wv-card')[0].querySelectorAll('.wp-th img').length === 2", timeout=10000)
    ph = pg.evaluate(PHOTOS)
    A = pg.evaluate("() => { const a = window.__hp.app; const r = a.selection && a.shownVersion().plan.rooms.find(x => x.id === a.selection.id); const f = window.__hp.roomFaces(a.shownVersion().plan, r)[0]; return { wall: f.wall.id, side: f.side, room: r.id }; }")
    check('two photos stored with the house, on wall A: its wall, side and room', len(ph) == 2 and all(x['wall'] == A['wall'] and x['side'] == A['side'] and x['room'] == A['room'] for x in ph), ph)
    taken = pg.evaluate("() => new Date(2026, 8, 14, 10, 31, 5).getTime()")
    dates = sorted(x['date'] for x in ph)
    check('… the date from the photo (EXIF: 14 Sep 2026), the other without one: today', dates[0] == taken and abs(dates[1] - pg.evaluate("Date.now()")) < 600000, dates)
    sizes = pg.evaluate("(ph) => ph.map(x => { const a = window.__hp.Assets.get(x.asset), t = window.__hp.Assets.get(x.thumb); return [a.w, a.h, t.w, t.h, a.url.length, a.url.slice(0, 15)]; })", ph)
    big = max(sizes, key=lambda s: s[0])
    check('… made smaller before storing: the 4000 × 3000 photo at 1600 × 1200, JPEG, under 600 kB', big[0] == 1600 and big[1] == 1200 and big[5] == 'data:image/jpeg' and big[4] < 800000, sizes)
    check('… with a small thumbnail (≤ 320 px) for the strip', all(max(s[2], s[3]) <= 320 for s in sizes), sizes)
    th_src = pg.evaluate("() => [...document.querySelectorAll('.wv-card')[0].querySelectorAll('.wp-th img')].map(i => i.src.length)")
    check('… the strip shows the thumbnails, not the big photos', all(x < 60000 for x in th_src), th_src)
    check('… the strip says “Photos of the bare wall (2)” and each thumbnail its date', '(2)' in pg.locator('.wv-card').first.locator('.wp-title').inner_text() and pg.locator('.wv-card').first.locator('.wp-date').count() == 2)
    # full screen: swipe, text, delete
    pg.locator('.wv-card').first.locator('.wp-th').first.click(); pg.wait_for_timeout(700)
    check('tap a thumbnail: the photo full size, “1 / 2”, the wall and the date', pg.locator('.wp-viewer .wp-big').count() == 1 and '1 / 2' in pg.inner_text('.wp-viewer .wp-meta'), pg.inner_text('.wp-viewer .wp-meta'))
    full = pg.evaluate("() => document.querySelector('.wp-viewer .wp-big').src.length")
    check('… the big photo is loaded only now (not the thumbnail)', full > max(th_src), (full, th_src))
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(400)
    check('… arrow right: the second photo', '2 / 2' in pg.inner_text('.wp-viewer .wp-meta'))
    box = pg.locator('.wp-stage').bounding_box()
    pg.mouse.move(box['x'] + box['width'] * 0.3, box['y'] + box['height'] / 2); pg.mouse.down()
    pg.mouse.move(box['x'] + box['width'] * 0.8, box['y'] + box['height'] / 2, steps=5); pg.mouse.up(); pg.wait_for_timeout(400)
    check('… swipe to the right: back to the first', '1 / 2' in pg.inner_text('.wp-viewer .wp-meta'))
    pg.click('.wp-viewer .wp-edit'); pg.wait_for_timeout(400)
    pg.fill('.scrim:last-child .dialog input', 'kabel naar de schakelaar op 1,10 m')
    pg.press('.scrim:last-child .dialog input', 'ArrowRight')
    pg.click('.scrim:last-child .dialog .dlg-foot .primary'); pg.wait_for_timeout(500)
    check('… arrow keys while typing the text do not turn the photo underneath', '1 / 2' in pg.inner_text('.wp-viewer .wp-meta'))
    check('… a short text with the photo, shown under it', 'schakelaar' in pg.inner_text('.wp-viewer .wp-text') and any(x['text'] == 'kabel naar de schakelaar op 1,10 m' for x in pg.evaluate(PHOTOS)))
    pg.screenshot(path=SHOTS + 'wallphotos-viewer-pc.png')
    pg.click('.wp-viewer .wp-del'); pg.wait_for_timeout(400)
    check('… delete asks first', pg.locator('.scrim').count() >= 3 and 'every version' in pg.inner_text('.scrim:last-child .dialog'))
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Cancel")'); pg.wait_for_timeout(300)
    check('… Cancel: both photos still there', len(pg.evaluate(PHOTOS)) == 2)
    close_dialog(pg)
    check('the strip in the wall view shows the text’s photo still', pg.locator('.wv-card').first.locator('.wp-th').count() == 2)
    pg.screenshot(path=SHOTS + 'wallphotos-views-pc.png')
    # the PDF: an extra page with the photos for wall A
    with pg.expect_download(timeout=120000) as dl:
        pg.click('.scrim:last-child .dialog button:has-text("PDF for the tiler")')
    path = os.path.join(SHOTS, 'wallphotos.pdf'); dl.value.save_as(path)
    data = open(path, 'rb').read()
    pages = len(re.findall(rb'/Type\s*/Page[^s]', data))
    n_floor = 1 if pg.locator('.wv-card.wv-floor').count() else 0   # a tiled floor: a page of its own (0036)
    check('PDF: a page per wall and one more with wall A’s photos (date and text under each)', pages == n_cards + 1 + n_floor and data.count(b'/Subtype /Image') >= n_cards + 2, (pages, n_cards))
    close_dialog(pg)
    # room details: the mark, the count, the strip in the open wall
    pg.evaluate(SELROOM, 'Keuken'); pg.wait_for_timeout(700)
    rows = pg.evaluate("() => [...document.querySelectorAll('.face-list .face-row')].map(r => [r.querySelector('.face-letter').textContent, !!r.querySelector('.wp-mark')])")
    check('room details → Each wall: a camera mark on wall A only', rows and rows[0] == ['A', True] and not any(m for _, m in rows[1:]), rows)
    check(f'… “1 of {n_cards} walls have photos of the bare wall”', f'1 of {n_cards} walls' in pg.inner_text('#wp-count'), pg.inner_text('#wp-count'))
    pg.locator('.face-list .face-row').first.click(); pg.wait_for_timeout(700)
    check('… open wall A: its photos and Add photo in its details', pg.locator('.face-list .wp-strip .wp-th').count() == 2 and pg.locator('.face-list .wp-strip .wp-add').count() == 1)
    pg.screenshot(path=SHOTS + 'wallphotos-room-pc.png')
    # the 2D plan's wall pick: the wall's details
    pg.evaluate("(wid) => { const a = window.__hp.app; const w = a.shownVersion().plan.walls.find(w => w.id === wid); a.select({ type: 'wall', id: w.id, storey: w.storey }); }", A['wall']); pg.wait_for_timeout(700)
    check('the wall picked on the plan: a camera mark on the side with photos', pg.locator('.inspector .face-row[data-room] .wp-mark').count() == 1)
    # every version: a new version made from this one still shows them; the Original too
    pg.evaluate("() => { const a = window.__hp.app; a.createVersionFrom(a.shownVersion().id, 'Wall photo test'); }"); pg.wait_for_timeout(1000)
    open_views(pg, 'Keuken')
    check('a new version: the same photos on wall A (they belong to the house)', pg.locator('.wv-card').first.locator('.wp-th').count() == 2 and pg.evaluate("() => window.__hp.app.shownVersion().name") == 'Wall photo test')
    close_dialog(pg)
    pg.evaluate("() => { const a = window.__hp.app; const o = a.project.versions.find(v => v.kind === 'original'); a.project.activeVersionId = o.id; a.renderEditorChrome(); a.setupPanes(false); }"); pg.wait_for_timeout(800)
    open_views(pg, 'Keuken')
    check('… and in the Original (locked) – where photos can still be added', pg.locator('.wv-card').first.locator('.wp-th').count() == 2 and pg.locator('.wv-card').first.locator('.wp-add').count() == 1)
    close_dialog(pg)
    # export → import (as another house): photos and their pictures come along
    exp = pg.evaluate("""async () => { const A = window.__hp.app; const d = JSON.parse(await A.buildExport([A.project], false)); const p = d.projects[0].project;
      const ids = (p.wallPhotos || []).flatMap(x => [x.asset, x.thumb]);
      return { n: (p.wallPhotos || []).length, assets: ids.every(id => d.assets[id] && d.assets[id].dataUrl) }; }""")
    check('export: the photos and their pictures are in the file', exp['n'] == 2 and exp['assets'], exp)
    imp = pg.evaluate("""async () => { const A = window.__hp.app; const d = JSON.parse(await A.buildExport([A.project], false));
      d.projects[0].project.id = 'p_wallphotos_copy'; d.projects[0].project.name = 'Wall photo copy'; return JSON.stringify(d); }""")
    jf = os.path.join(tmp, 'copy.house.json'); open(jf, 'w').write(imp)
    with pg.expect_file_chooser() as fc:
        pg.evaluate("() => { window.__hp.app.importFlow(); }")
    fc.value.set_files(jf); pg.wait_for_timeout(3000)
    pg.evaluate("async () => { const A = window.__hp.app; if (A.project.id !== 'p_wallphotos_copy') await A.openProject('p_wallphotos_copy'); }"); pg.wait_for_timeout(2500)
    got = pg.evaluate("() => { const p = window.__hp.app.project; return [p.id, (p.wallPhotos || []).length, (p.wallPhotos || []).every(x => window.__hp.Assets.get(x.asset) && window.__hp.Assets.get(x.thumb))]; }")
    check('import: the copy has both photos with their pictures', got == ['p_wallphotos_copy', 2, True], got)
    # merge: their copy has a third photo
    mc = pg.evaluate("""async () => { const A = window.__hp.app; const mine = JSON.parse(JSON.stringify(A.project)); const theirs = JSON.parse(JSON.stringify(A.project));
      theirs.wallPhotos.push({ ...theirs.wallPhotos[0], id: 'wp_theirs', text: 'their photo', created: Date.now() });
      const ch = window.__hp.mergeChanges(mine, theirs); return ch.filter(c => c.group === window.__hp.t('Photos of the bare walls')).map(c => [c.label, c.tag, c.on]); }""")
    check('merge: a photo only in their copy is listed and ticked', len(mc) == 1 and mc[0][1] == 'new' and mc[0][2] and 'their photo' in mc[0][0], mc)
    # the viewer copy: the photos come along; there they can be looked at, not changed
    vc = pg.evaluate("""async () => { const A = window.__hp.app; const d = await A.buildViewerData(A.project, { from: 'Test', version: '__all', layout: '__all', notes: true, drawings: true });
      const p = d.projects[0].project; return [(p.wallPhotos || []).length, (p.wallPhotos || []).every(x => d.assets[x.asset] && d.assets[x.thumb])]; }""")
    check('viewer copy: the photos and their pictures are in it', vc == [2, True], vc)
    pg.evaluate("() => { window.__hp.app.project.viewer = { sourceId: 'x', from: 'Test' }; }")
    open_views(pg, 'Keuken')
    check('… in a viewer copy: thumbnails, no Add photo', pg.locator('.wv-card').first.locator('.wp-th').count() == 2 and pg.locator('.wp-add, .wp-camera').count() == 0)
    pg.locator('.wv-card').first.locator('.wp-th').first.click(); pg.wait_for_timeout(600)
    check('… full screen without Delete', pg.locator('.wp-viewer .wp-big').count() == 1 and pg.locator('.wp-del').count() == 0)
    close_dialog(pg); close_dialog(pg)
    pg.evaluate("() => { delete window.__hp.app.project.viewer; }")
    # a delete, confirmed
    open_views(pg, 'Keuken')
    pg.locator('.wv-card').first.locator('.wp-th').first.click(); pg.wait_for_timeout(600)
    pg.click('.wp-viewer .wp-del'); pg.wait_for_timeout(300)
    pg.click('.scrim:last-child .dialog .dlg-foot .danger'); pg.wait_for_timeout(600)
    check('delete, confirmed: one photo left, the viewer shows “1 / 1”', len(pg.evaluate(PHOTOS)) == 1 and '1 / 1' in pg.inner_text('.wp-viewer .wp-meta'))
    check('… the photo’s pictures are no longer used by the house (cleaned up later)', pg.evaluate("() => { const ids = new Set(window.__hp.app.project.wallPhotos.flatMap(x => [x.asset, x.thumb])); return ids.size === 2; }"))
    check('no page errors (PC)', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone, dark ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    open_views(pg, 'Toilet', phone=True)
    card = pg.locator('.wv-card').first
    check('phone: Take photo (camera) first, From the gallery second', card.locator('.wp-camera').count() == 1 and card.locator('.wp-gallery').count() == 1)
    hb = pg.evaluate("() => [...document.querySelectorAll('.wv-card')[0].querySelectorAll('.wp-acts .btn')].map(b => b.getBoundingClientRect().height)")
    check('… buttons big enough to tap', all(x >= 36 for x in hb), hb)
    card.locator('.wp-camera').scroll_into_view_if_needed()
    with pg.expect_file_chooser() as fc:
        card.locator('.wp-camera').tap()
    cam = pg.evaluate("() => { const i = document.querySelector('input.wp-input'); return i && [i.getAttribute('capture'), i.multiple]; }")
    check('… Take photo opens the camera directly (capture = environment, one photo)', cam == ['environment', False], cam)
    fc.value.set_files(EXIF)
    pg.wait_for_function("() => (window.__hp.app.project.wallPhotos || []).length === 1", timeout=30000)
    pg.wait_for_function("() => document.querySelectorAll('.wv-card')[0].querySelectorAll('.wp-th img').length === 1", timeout=10000)
    fit = pg.evaluate("() => { const d = document.querySelector('.scrim:last-child .dialog').getBoundingClientRect(); return [d.left >= 0, d.right <= innerWidth + 1, document.documentElement.scrollWidth <= innerWidth + 1]; }")
    check('phone: the wall views with the photo strip fit the screen', all(fit), fit)
    card.locator('.wp-strip').scroll_into_view_if_needed()
    pg.screenshot(path=SHOTS + 'wallphotos-phone.png')
    card.locator('.wp-th').first.tap(); pg.wait_for_timeout(700)
    fit = pg.evaluate("() => { const d = document.querySelector('.scrim:last-child .dialog').getBoundingClientRect(), i = document.querySelector('.wp-big').getBoundingClientRect(); return [d.left >= 0, d.right <= innerWidth + 1, i.width > 200, i.bottom <= innerHeight + 1]; }")
    check('phone: the photo full screen, wide and fits', all(fit), fit)
    pg.screenshot(path=SHOTS + 'wallphotos-phone-viewer.png')
    close_dialog(pg, True); close_dialog(pg, True)
    pg.evaluate(SELROOM, 'Toilet'); pg.wait_for_timeout(700)
    pg.locator('#wp-count').scroll_into_view_if_needed()
    check('phone: room details count “1 of 4 walls”', '1 of 4 walls' in pg.inner_text('#wp-count'), pg.inner_text('#wp-count'))
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
