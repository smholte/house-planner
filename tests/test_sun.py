"""Sun and north: the sun for a date and time at the house (its latitude and longitude, north from the site plan) with its light and
shadows in 3D, the sun bar (day, time, play the day), and Sun hours: when the sun shines into each room and how
many hours the garden gets, for a day. PC and phone."""
from common import *
import math

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    # the formulas: Utrecht (52.09 N, 5.12 E), 21 June 13:41 (summer time) and 21 December 12:37 (NOAA: 61.4° and 14.5°)
    s1 = pg.evaluate("() => { const H = window.__hp; return H.sunPosition(52.0907, 5.1214, H.sunMoment(172, 13 * 60 + 41)); }")
    s2 = pg.evaluate("() => { const H = window.__hp; return H.sunPosition(52.0907, 5.1214, H.sunMoment(355, 12 * 60 + 37)); }")
    check('sun at noon in June: south, 61° high', abs(s1['az'] - 180) < 2 and abs(s1['el'] - 61.4) < 1, s1)
    check('sun at noon in December: south, 14.5° high', abs(s2['az'] - 180) < 2 and abs(s2['el'] - 14.5) < 1, s2)
    # the day at the house's own place: its length and its noon from the latitude and longitude (sunrise at −0.833°)
    site = pg.evaluate("() => { const s = window.__hp.app.project.site; return [s.lat, s.lon]; }")
    la, dl = math.radians(site[0]), math.radians(23.44)
    day_len = 2 * math.degrees(math.acos((math.sin(math.radians(-0.833)) - math.sin(la) * math.sin(dl)) / (math.cos(la) * math.cos(dl)))) * 4
    noon = 13 * 60 + (15 - site[1]) * 4 + 1.3
    tm = pg.evaluate("() => window.__hp.sunTimes(window.__hp.app.project.site, 172)")
    check(f'21 June: a day of about {int(day_len // 60)} h {int(day_len % 60)} min, around noon at {int(noon // 60)}:{int(noon % 60):02d} (summer time)', abs(tm['set'] - tm['rise'] - day_len) <= 10 and abs((tm['rise'] + tm['set']) / 2 - noon) <= 3, (tm, day_len, noon))
    # the light "Sun" from the View menu
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(500)
    pg.evaluate("() => { const a = window.__hp.app; a.settings.sunDay = 172; a.settings.sunTime = 8 * 60; a.setScope('house'); }"); pg.wait_for_timeout(3000)
    pg.click('#btn-viewopts'); pg.wait_for_timeout(300)
    pg.click('.menu button:has-text("Sun")'); pg.wait_for_timeout(2500); still(pg)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check('the sun bar shows in 3D', pg.is_visible('.sun-bar') and pg.is_visible('#sun-day') and pg.is_visible('#sun-time'))
    r1 = pg.inner_text('#sun-readout')
    pos1 = pg.evaluate("() => window.__hp.app.panes[0].view.sun.position.toArray()")
    check('8:00 in June: the sun in the east', 'east' in r1, r1)
    pg.evaluate("() => { const e = document.querySelector('#sun-time'); e.value = '1140'; e.dispatchEvent(new Event('input')); }"); pg.wait_for_timeout(600)
    r2 = pg.inner_text('#sun-readout')
    pos2 = pg.evaluate("() => window.__hp.app.panes[0].view.sun.position.toArray()")
    check('19:00: the sun in the west, and the light moved', 'west' in r2 and sum((a - b) ** 2 for a, b in zip(pos1, pos2)) > 1, (r2, pos1, pos2))
    still(pg)
    pg.screenshot(path=SHOTS + 'sun-evening.png')
    pg.evaluate("() => { const d = document.querySelector('#sun-day'); d.value = '355'; d.dispatchEvent(new Event('input')); const e = document.querySelector('#sun-time'); e.value = '1320'; e.dispatchEvent(new Event('input')); }"); pg.wait_for_timeout(500)
    check('22:00 in December: the sun is down', 'down' in pg.inner_text('#sun-readout') and pg.evaluate("() => window.__hp.app.panes[0].view.sun.intensity") == 0)
    pg.evaluate("() => { const d = document.querySelector('#sun-day'); d.value = '172'; d.dispatchEvent(new Event('input')); const e = document.querySelector('#sun-time'); e.value = '600'; e.dispatchEvent(new Event('input')); }"); pg.wait_for_timeout(300)
    pg.click('#sun-play')
    # (the test browser draws a frame of the whole house with sun shadows in about 3 s: give it a few frames)
    t2 = 0
    for _ in range(40):
        pg.wait_for_timeout(500); t2 = pg.evaluate("() => window.__hp.app.settings.sunTime")
        if t2 > 640: break
    pg.click('#sun-play'); pg.wait_for_timeout(200)
    check('play the day: the time runs on', t2 > 640, t2)
    # sun hours
    pg.click('#sun-hours')
    pg.wait_for_selector('.sunh-res', timeout=240000)
    R = pg.evaluate("() => Object.fromEntries(window.__hp.app._sunHours.rooms.map(r => [r.room.name + '|' + r.storey.name, r.hours]))")
    g = pg.evaluate("() => { const G = window.__hp.app._sunHours.garden; return [G.length, G.reduce((s, q) => s + q.hours, 0) / G.length]; }")
    check('21 June: the living room gets sun (more than 3 hours)', R.get('Woonkamer|Begane grond', 0) > 3, R.get('Woonkamer|Begane grond'))
    check('the meter cupboard (no window) gets none', R.get('Meterkast|Begane grond', 1) == 0)
    check('the garden: points all over the plot, about 8 or more hours on average', g[0] > 300 and g[1] > 7, g)
    check('the table and the garden map are shown', pg.evaluate("() => document.querySelectorAll('.sunh-row').length > 10 && !!document.querySelector('.sunh-map')"))
    pg.screenshot(path=SHOTS + 'sun-hours.png')
    pg.select_option('#sunh-day', index=3)   # 21 December
    pg.wait_for_function("() => window.__hp.app._sunHours && window.__hp.app._sunHours.doy > 350 && !!document.querySelector('.sunh-res')", timeout=240000)
    R2 = pg.evaluate("() => Object.fromEntries(window.__hp.app._sunHours.rooms.map(r => [r.room.name + '|' + r.storey.name, r.hours]))")
    g2 = pg.evaluate("() => { const G = window.__hp.app._sunHours.garden; return G.reduce((s, q) => s + q.hours, 0) / G.length; }")
    check('21 December: less sun in the garden than in June', g2 < g[1] - 3, (g2, g[1]))
    pg.click('.scrim:last-child .dialog .dlg-head button[aria-label="Close"]'); pg.wait_for_timeout(600)
    check('closed: the hidden view is gone', pg.evaluate("() => !document.querySelector('.drawing-host')"))
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.settings.light = 'sun'; a.settings.sunDay = 172; a.settings.sunTime = 15 * 60; a.setScope('house'); }"); pg.wait_for_timeout(3500); still(pg)
    check('phone: the sun bar in 3D', pg.is_visible('.sun-bar'))
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth, document.querySelector('.sun-bar').getBoundingClientRect().right]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1] and vw[2] <= vw[1] + 1, vw)
    pg.screenshot(path=SHOTS + 'sun-phone-dark.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
