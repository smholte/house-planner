"""The place of the house (task 0048): Site → Place – latitude and longitude typed, a pasted map link (Google, OpenStreetMap,
Apple), "Use where I am now" (the browser's location, granted and refused); the sun, the sun hours and the export for Fresing
Render follow; the times are the clock at the house (Europe's zones with summer time, elsewhere a chosen zone). The sun is
worked out at fixed days (21 June, 21 December) – never the real date. PC (light) and phone (dark)."""
from common import *

FIXED = "() => { const a = window.__hp.app; a.settings.sunDay = 172; a.settings.sunTime = 12 * 60; }"
SUN_AT = "([lat, lon, tz, doy, min]) => { const H = window.__hp, pl = { lat, lon, tz }; const s = H.sunPosition(lat, lon, H.sunMoment(doy, min, pl)); return { az: s.az, el: s.el, times: H.sunTimes(pl, doy) }; }"
PLACE = "() => { const a = window.__hp.app, p = window.__hp.placeOf(a.project); return { lat: p.lat, lon: p.lon, set: p.set, tz: p.tz, stored: a.project.place || null }; }"

def run(p, phone, theme):
    tag = 'phone dark' if phone else 'PC light'
    b, pg = open_app(p, phone=phone, theme=theme)
    ctx = pg.context
    open_example(pg)
    pg.evaluate(FIXED)
    # ── the pure rules ──
    P = lambda s: pg.evaluate("(s) => window.__hp.parsePlace(s)", s)
    near = lambda r, la, lo: r and abs(r.get('lat', 99) - la) < 1e-6 and abs(r.get('lon', 99) - lo) < 1e-6
    check(f'{tag}: a Google link with @', near(P('https://www.google.com/maps/place/Utrecht/@52.0907,5.1214,15z/data=!4m5'), 52.0907, 5.1214))
    check(f'{tag}: a Google link with the pin (!3d !4d) beats the view', near(P('https://www.google.com/maps/place/X/@50.0,4.0,15z/data=!3m1!4b1!4m5!3d52.5!4d6.25'), 52.5, 6.25))
    check(f'{tag}: a Google ?q= link', near(P('https://maps.google.com/?q=69.6496,18.9560'), 69.6496, 18.956))
    check(f'{tag}: an OpenStreetMap link (#map=)', near(P('https://www.openstreetmap.org/#map=17/59.9139/10.7522'), 59.9139, 10.7522))
    check(f'{tag}: an OpenStreetMap marker (mlat / mlon)', near(P('https://www.openstreetmap.org/?mlat=38.7223&mlon=-9.1393#map=12/38.7/-9.1'), 38.7223, -9.1393))
    check(f'{tag}: an Apple Maps link (ll=)', near(P('https://maps.apple.com/?ll=40.4168,-3.7038&q=Madrid'), 40.4168, -3.7038))
    check(f'{tag}: plain numbers', near(P('52.09, 5.12'), 52.09, 5.12))
    check(f'{tag}: degrees, minutes, seconds', (lambda r: r and abs(r['lat'] - 52.0907) < 0.001 and abs(r['lon'] - 5.1214) < 0.001)(P('52°05\'26.5"N 5°07\'17.0"E')))
    check(f'{tag}: a short link says so, nonsense is nothing', P('https://maps.app.goo.gl/abc123') == {'short': True} and P('hello') is None and P('95, 5') is None)
    # the clock: noon in Oslo and Lisbon in June is 10:00 and 11:00 UTC (summer time), in December 11:00 and 12:00
    mom = lambda la, lo, d, m: pg.evaluate("([la, lo, d, m]) => { const H = window.__hp, pl = { lat: la, lon: lo }; return H.sunMoment(d, m, pl).getUTCHours(); }", [la, lo, d, m])
    check(f'{tag}: noon in Oslo / Lisbon in June is 10 / 11 UTC', (mom(59.9, 10.75, 172, 720), mom(38.7, -9.1, 172, 720)) == (10, 11), (mom(59.9, 10.75, 172, 720), mom(38.7, -9.1, 172, 720)))
    check(f'{tag}: noon in Oslo / Lisbon in December is 11 / 12 UTC', (mom(59.9, 10.75, 355, 720), mom(38.7, -9.1, 355, 720)) == (11, 12))
    zones = {n: pg.evaluate("([la, lo]) => window.__hp.guessZone(la, lo)", [la, lo]) for n, la, lo in [('NL', 52.1, 5.1), ('NO', 69.65, 18.96), ('ES', 40.4, -3.7), ('UK', 51.5, -0.1), ('PL', 52.2, 21), ('Tokyo', 35.7, 139.7)]}
    check(f'{tag}: the zone guessed from the place', zones['NL'] == 'Europe/Amsterdam' and zones['NO'] == 'Europe/Oslo' and zones['ES'] == 'Europe/Madrid' and zones['UK'] == 'Europe/London' and zones['PL'] == 'Europe/Warsaw' and zones['Tokyo'] == 'UTC+9', zones)
    # ── the sun at other places ──
    tr = pg.evaluate(SUN_AT, [69.65, 18.96, '', 355, 12 * 60])
    check(f'{tag}: Tromsø in December – the sun stays below the horizon at noon, no sunrise', tr['el'] < 0 and tr['times']['rise'] is None, tr)
    md = pg.evaluate(SUN_AT, [40.4, -3.7, '', 172, 14 * 60 + 15])
    nl = pg.evaluate(SUN_AT, [52.1, 5.1, '', 172, 13 * 60 + 40])
    check(f'{tag}: Madrid in June – higher sun at its noon than at the made-up place', md['el'] > nl['el'] + 8, (md['el'], nl['el']))
    check(f'{tag}: the same clock time, the sun is elsewhere', abs(pg.evaluate(SUN_AT, [59.9, 10.75, '', 172, 720])['az'] - pg.evaluate(SUN_AT, [38.7, -9.1, '', 172, 720])['az']) > 5)
    # ── the made-up example has its invented place; the panel ──
    pl = pg.evaluate(PLACE)
    first = pl
    check(f'{tag}: the made-up example stands at an invented place in the Netherlands', pl['set'] and abs(pl['lat'] - 52.1) < 0.5 and abs(pl['lon'] - 5.1) < 0.5, pl)
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('build'); a.setDim('3d'); a.settings.light = 'sun'; a.setScope('house'); }"); pg.wait_for_timeout(2500)
    pg.evaluate("() => window.__hp.app.select({ type: 'plot' })"); pg.wait_for_timeout(600)
    check(f'{tag}: Site shows the place fields, the link box, Use where I am now and the zone', all(pg.is_visible(s) for s in ('#f-lat', '#f-lon', '#f-place-link', '#b-place-here', '#f-zone')))
    before = pg.evaluate("() => window.__hp.app.sunNow()")
    # typing
    pg.fill('#f-lat', '69.65'); pg.press('#f-lat', 'Enter'); pg.wait_for_timeout(500)
    pg.fill('#f-lon', '18.96'); pg.press('#f-lon', 'Enter'); pg.wait_for_timeout(600)
    pl = pg.evaluate(PLACE)
    check(f'{tag}: typed latitude and longitude are stored', abs(pl['lat'] - 69.65) < 1e-6 and abs(pl['lon'] - 18.96) < 1e-6, pl)
    after = pg.evaluate("() => window.__hp.app.sunNow()")
    check(f'{tag}: the sun in 3D follows at once', abs(after['el'] - before['el']) > 3, (before, after))
    check(f'{tag}: the 3D view\'s sun is the new one', abs(pg.evaluate("() => { const v = window.__hp.app.panes.find(q => q.kind === '3d').view; return v.sunInfo.el; }") - after['el']) < 1e-6)
    zone_txt = pg.inner_text('#place-clock')
    check(f'{tag}: the clock line names the guessed zone (Oslo)', 'Oslo' in zone_txt, zone_txt)
    # undo
    pg.evaluate("() => window.__hp.app.undo()"); pg.wait_for_timeout(800)
    pl2 = pg.evaluate(PLACE)
    check(f'{tag}: undo takes the last change of the place back', abs(pl2['lon'] - first['lon']) < 1e-4 and abs(pl2['lat'] - 69.65) < 1e-6, pl2)
    pg.evaluate("() => window.__hp.app.undo()"); pg.wait_for_timeout(800)
    pl3 = pg.evaluate(PLACE)
    check(f'{tag}: undo twice – the first place again', abs(pl3['lat'] - first['lat']) < 1e-4 and abs(pl3['lon'] - first['lon']) < 1e-4, pl3)
    # a pasted link
    pg.evaluate("() => window.__hp.app.select({ type: 'plot' })"); pg.wait_for_timeout(500)
    pg.fill('#f-place-link', 'https://www.google.com/maps/@40.4168,-3.7038,12z'); pg.click('#b-place-link'); pg.wait_for_timeout(700)
    check(f'{tag}: a pasted Google link sets the place', near(pg.evaluate(PLACE), 40.4168, -3.7038), pg.evaluate(PLACE))
    pg.evaluate("() => window.__hp.app.select({ type: 'plot' })"); pg.wait_for_timeout(500)
    pg.fill('#f-place-link', 'https://www.openstreetmap.org/#map=17/38.7223/-9.1393'); pg.click('#b-place-link'); pg.wait_for_timeout(700)
    check(f'{tag}: a pasted OpenStreetMap link sets the place', near(pg.evaluate(PLACE), 38.7223, -9.1393))
    pg.evaluate("() => window.__hp.app.select({ type: 'plot' })"); pg.wait_for_timeout(500)
    pg.fill('#f-place-link', 'not a place'); pg.click('#b-place-link'); pg.wait_for_timeout(400)
    check(f'{tag}: a link it cannot read says so and changes nothing', 'no place I can read' in pg.inner_text('#place-msg') and near(pg.evaluate(PLACE), 38.7223, -9.1393))
    # the zone chosen in the panel
    pg.select_option('#f-zone', 'Europe/London'); pg.wait_for_timeout(600)
    check(f'{tag}: a chosen zone is stored and used', pg.evaluate(PLACE)['tz'] == 'Europe/London' and pg.evaluate("() => window.__hp.sunMoment(172, 720, window.__hp.placeOf(window.__hp.app.project)).getUTCHours()") == 11)
    pg.evaluate("() => window.__hp.app.select({ type: 'plot' })"); pg.wait_for_timeout(400)
    pg.select_option('#f-zone', ''); pg.wait_for_timeout(500)
    # the sun hours and the sun bar use the place
    tm = pg.evaluate("() => window.__hp.sunTimes(window.__hp.app.placeNow(), 172)")
    check(f'{tag}: sunrise 6:12 / sunset 21:05 in June at Lisbon (summer time there)', 365 <= tm['rise'] <= 380 and 1255 <= tm['set'] <= 1275, tm)
    # Use where I am now – granted
    ctx.grant_permissions(['geolocation']); ctx.set_geolocation({'latitude': 63.43, 'longitude': 10.39})
    pg.evaluate("() => window.__hp.app.select({ type: 'plot' })"); pg.wait_for_timeout(500)
    pg.click('#b-place-here'); pg.wait_for_function("() => Math.abs(window.__hp.placeOf(window.__hp.app.project).lat - 63.43) < 1e-4", timeout=20000)
    check(f'{tag}: Use where I am now (allowed) sets the place', near(pg.evaluate(PLACE), 63.43, 10.39), pg.evaluate(PLACE))
    # refused
    # (the browser's answer "not allowed" / "no position" is played back: a real refusal may stay pending in a test browser)
    for code, word in ((1, 'not allowed'), (2, 'could not find')):
        pg.evaluate("(c) => { navigator.geolocation.getCurrentPosition = (ok, err) => setTimeout(() => err({ code: c }), 50); }", code)
        pg.evaluate("() => window.__hp.app.select({ type: 'plot' })"); pg.wait_for_timeout(500)
        pg.click('#b-place-here'); pg.wait_for_function("(w) => ((document.querySelector('#place-msg') || {}).textContent || '').includes(w)", arg=word, timeout=20000)
        check(f'{tag}: Use where I am now ({word}) says so and keeps the place', near(pg.evaluate(PLACE), 63.43, 10.39), pg.inner_text('#place-msg'))
    # the export for Fresing Render
    rec = pg.evaluate("""() => { const a = window.__hp.app; const d = a.hpsceneDefaults(); d.seasons = { summer: { on: true, date: '2026-06-21' }, winter: { on: true, date: '2026-12-21' } };
      const r = a.hpsRecipe(d, { tpm: 1, byGroup: {}, pageSize: 1024 }, { storeys: [], groups: ['house'] }, false);
      return { place: r.place, moments: r.recipe.moments.map(m => [m.id, m.utc_offset, m.sun.elevation]) }; }""")
    check(f'{tag}: the export names the place', abs(rec['place']['latitude'] - 63.43) < 1e-6 and abs(rec['place']['longitude'] - 10.39) < 1e-6, rec['place'])
    offs = {m[0]: m[1] for m in rec['moments']}
    check(f'{tag}: the export\'s clock offsets are the zone\'s (Trondheim: +02:00 summer, +01:00 winter)', offs.get('summer-afternoon') == '+02:00' and offs.get('winter-afternoon') == '+01:00', offs)
    # a house without a place
    pg.evaluate("() => { const a = window.__hp.app; delete a.project.place; a.project.site.lat = 52.1; a.project.site.lon = 5.1; delete a.project.site.from; }")
    pl = pg.evaluate(PLACE)
    check(f'{tag}: no place – the middle of the Netherlands', not pl['set'] and pl['lat'] == 52.1 and pl['lon'] == 5.1, pl)
    pg.evaluate("() => window.__hp.app.select({ type: 'plot' })"); pg.wait_for_timeout(500)
    check(f'{tag}: the panel says so', 'No place set' in pg.inner_text('#place-none'))
    # a site plan's place is shown and kept
    pg.evaluate("() => { const s = window.__hp.app.project.site; s.lat = 60.1; s.lon = 11.1; s.from = 'a site plan'; }")
    pl = pg.evaluate(PLACE)
    check(f'{tag}: the site plan\'s place counts and is not copied', pl['set'] and pl['lat'] == 60.1 and pl['stored'] is None, pl)
    # read-only: nothing changes
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('view'); a.setPlace(10, 10); }"); pg.wait_for_timeout(300)
    check(f'{tag}: a read-only view cannot change the place', pg.evaluate(PLACE)['lat'] == 60.1)
    check(f'{tag}: no page errors', not pg.errors, pg.errors)
    b.close()

with sync_playwright() as p:
    run(p, False, 'light')
    run(p, True, 'dark')
sys.exit(summary())
