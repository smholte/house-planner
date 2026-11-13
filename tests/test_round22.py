"""Twenty-second round (1 Nov, evening): the sun bar. The sun at its left folds the bar away (to just the sun) and back,
on the phone and the computer; it is open each time the light is set to Sun. A tap on the day opens a month to tap a day
in (arrows for the month; Today, Longest day, Shortest day), a tap on the time opens hours and minutes (Now, Sunrise,
Sun highest, Sunset); the sun follows while choosing, Cancel puts it back. Bars over the view that reach the top right
corner (the sun bar on a phone) push the view cube and the Slice button down below them. PC (light) and phone (dark)."""
from common import *

SUNON = "() => { const a = window.__hp.app; window.__hp.Settings.set('light', 'sun'); a.settings.sunDay = 206; a.settings.sunTime = 580; a.refreshViews(false); a.renderStageOverlays(); }"
SUNOFF = "() => { const a = window.__hp.app; window.__hp.Settings.set('light', 'day'); a.refreshViews(false); a.renderStageOverlays(); }"
BAR = """() => { const b = document.querySelector('.sun-bar'); if (!b) return null; const f = document.querySelector('#sun-fold'), d = document.querySelector('#sun-day');
  const r = b.getBoundingClientRect(); return { folded: b.classList.contains('folded'), exp: f.getAttribute('aria-expanded'), label: f.getAttribute('aria-label'), dayShown: !!(d && d.offsetParent), w: Math.round(r.width), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; }"""
SUN = "() => { const a = window.__hp.app; return [a.settings.sunDay, a.settings.sunTime, document.querySelector('#sun-day-lab').textContent, document.querySelector('#sun-time-lab').textContent, document.querySelector('#sun-readout').textContent, +document.querySelector('#sun-day').value, +document.querySelector('#sun-time').value]; }"
CORNER = """() => { const p = document.querySelector('#stage .pane'), c = p.querySelector(':scope > .viewcube'), s = p.querySelector(':scope > .slice-dock .slice-btn'), b = document.querySelector('.sun-bar');
  const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  return { push: p.style.getPropertyValue('--ov-push'), cube: R(c && c.querySelector('.vc-stage')), slice: R(s), bar: R(b) }; }"""
overlap = lambda a, b: a and b and a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]

def foot(pg, label, phone=False):
    sel = f'.scrim:last-child .dialog .dlg-foot button:has-text("{label}")'
    (pg.tap if phone else pg.click)(sel); pg.wait_for_timeout(500)

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(6000)
    pg.evaluate(SUNON); pg.wait_for_timeout(1500)
    s = pg.evaluate(BAR)
    check('light Sun: the sun bar, open, the sun at its left a button', s and not s['folded'] and s['exp'] == 'true' and s['dayShown'] and s['label'] == 'Fold the sun bar away', s)
    pg.click('#sun-fold'); pg.wait_for_timeout(500)
    s1 = pg.evaluate(BAR)
    check('the sun folds the bar away: only the sun left', s1['folded'] and s1['exp'] == 'false' and not s1['dayShown'] and s1['w'] < 60 and s1['label'] == 'Show the sun bar', s1)
    pg.evaluate("() => window.__hp.app.renderStageOverlays()"); pg.wait_for_timeout(300)
    check('… it stays folded while you work', pg.evaluate(BAR)['folded'])
    pg.click('#sun-fold'); pg.wait_for_timeout(400)
    check('… a tap on the sun opens it again', not pg.evaluate(BAR)['folded'] and pg.evaluate(BAR)['dayShown'])
    pg.click('#sun-fold'); pg.wait_for_timeout(300)
    pg.evaluate(SUNOFF); pg.wait_for_timeout(800); pg.evaluate(SUNON); pg.wait_for_timeout(1200)
    check('folded, light off and Sun again: the bar is open (standard on)', not pg.evaluate(BAR)['folded'])
    # the day picker
    s0 = pg.evaluate(SUN)
    pg.click('#sun-day-lab'); pg.wait_for_timeout(600)
    dp = pg.evaluate("() => [document.querySelector('#dp-head').textContent, document.querySelector('#dp-month').textContent, document.querySelectorAll('#dp-grid .dp-day').length, document.querySelectorAll('#dp-grid .dp-wk').length, (document.querySelector('#dp-grid .dp-day[aria-pressed=\"true\"]') || {}).textContent]")
    check('a tap on the day: a month to tap a day in (the day shown, the week from Monday)', 'July' in dp[0] and '25' in dp[0] and dp[1] == 'July' and dp[2] == 31 and dp[3] == 7 and dp[4] == '25', dp)
    pg.click('#dp-next'); pg.wait_for_timeout(200)
    check('… arrows for the month', pg.inner_text('#dp-month') == 'August' and pg.locator('#dp-grid .dp-day').count() == 31)
    pg.click('#dp-grid .dp-day[data-doy="227"]'); pg.wait_for_timeout(500)
    s1 = pg.evaluate(SUN)
    check('… tap a day: the sun follows straight away (bar, slider, words)', s1[0] == 227 and s1[2] == '15 Aug' and s1[5] == 227 and s1[4] != s0[4], s1)
    foot(pg, 'Cancel')
    check('… Cancel puts the day back', pg.evaluate(SUN)[0] == s0[0] and pg.evaluate(SUN)[2] == s0[2], pg.evaluate(SUN))
    pg.click('#sun-day-lab'); pg.wait_for_timeout(500)
    pg.click('.dp-quick .chip:has-text("Longest day")'); pg.wait_for_timeout(400)
    foot(pg, 'OK')
    s2 = pg.evaluate(SUN)
    check('… Longest day, OK: 21 June kept', s2[0] == 172 and s2[2] == '21 Jun' and pg.evaluate("() => window.__hp.app.settings.sunDay") == 172, s2)
    # the time picker
    pg.click('#sun-time-lab'); pg.wait_for_timeout(500)
    tp = pg.evaluate("() => [document.querySelector('#tp-head').textContent, document.querySelectorAll('#tp-hours .tp-btn').length, document.querySelectorAll('#tp-mins .tp-btn').length, (document.querySelector('#tp-hours [aria-pressed=\"true\"]') || {}).textContent, (document.querySelector('#tp-mins [aria-pressed=\"true\"]') || {}).textContent]")
    check('a tap on the time: hours 04–23 and minutes in fives, the time shown', tp == ['09:40', 20, 12, '09', ':40'], tp)
    pg.click('#tp-hours .tp-btn[data-h="15"]'); pg.wait_for_timeout(200)
    pg.click('#tp-mins .tp-btn[data-m="30"]'); pg.wait_for_timeout(400)
    s3 = pg.evaluate(SUN)
    check('… 15 and :30: the sun at 15:30 straight away', s3[1] == 930 and s3[3] == '15:30' and s3[6] == 930, s3)
    pg.click('#tp-hours .tp-btn[data-h="23"]'); pg.wait_for_timeout(200)
    check('… 23 is the last hour (23:00, as the slider)', pg.evaluate("() => [window.__hp.app.settings.sunTime, document.querySelectorAll('#tp-mins .tp-btn[disabled]').length]") == [1380, 11])
    pg.click('.dp-quick .chip:has-text("Sunrise")'); pg.wait_for_timeout(300)
    rise = pg.evaluate("() => window.__hp.app.settings.sunTime")
    foot(pg, 'OK')
    check('… Sunrise, OK: the time of sunrise (21 June: before six)', 240 <= rise < 360 and pg.evaluate(SUN)[1] == rise, rise)
    pg.click('#sun-time-lab'); pg.wait_for_timeout(500)
    pg.click('#tp-hours .tp-btn[data-h="12"]'); pg.wait_for_timeout(200)
    pg.click('.scrim:last-child .dialog .dlg-head button[aria-label="Close"]'); pg.wait_for_timeout(400)
    check('… closed with ×: the time back as it was', pg.evaluate(SUN)[1] == rise)
    # in Dutch: the month's name
    pg.evaluate("() => window.__hp.setLang('nl')")
    pg.click('#sun-day-lab'); pg.wait_for_timeout(500)
    nl = pg.inner_text('#dp-month')
    pg.click('.scrim:last-child .dialog .dlg-foot button >> nth=0'); pg.wait_for_timeout(400)
    pg.evaluate("() => window.__hp.setLang('en')")
    check('in Dutch: the months in Dutch (juni)', nl.lower() == 'juni', nl)
    # the corner: on a wide screen nothing to push; a narrow window: the bar wraps under the cube → pushed down
    c = pg.evaluate(CORNER)
    check('this window (1280): the bar wraps to the corner – the cube and Slice below it, not covered, not pushed further than needed', not overlap(c['bar'], c['cube']) and not overlap(c['bar'], c['slice']) and (c['push'] in ('', '0px') or int(c['push'][:-2]) < 140), c)
    pg.set_viewport_size({'width': 2000, 'height': 1080}); pg.wait_for_timeout(1500)
    # (the push follows the bar's new size at the next frame – a busy test computer draws the wider 3D view slowly)
    try: pg.wait_for_function("() => ['', '0px'].includes(document.querySelector('#stage .pane').style.getPropertyValue('--ov-push'))", timeout=30000)
    except Exception: pass
    c = pg.evaluate(CORNER)
    check('a wide screen (2000, like yours): the bar on one line, clear of the corner – nothing moved', c['push'] in ('', '0px') and not overlap(c['bar'], c['cube']) and not overlap(c['bar'], c['slice']), c)
    pg.set_viewport_size({'width': 700, 'height': 800}); pg.wait_for_timeout(1500)
    # (as above: measured once the page has drawn the narrower view – on a busy test computer seconds later)
    try: pg.wait_for_function("() => !['', '0px'].includes(document.querySelector('#stage .pane').style.getPropertyValue('--ov-push'))", timeout=30000)
    except Exception: pass
    c = pg.evaluate(CORNER)
    check('narrow window: where the bar reaches the corner, the cube and Slice go below it', not overlap(c['bar'], c['cube']) and not overlap(c['bar'], c['slice']), c)
    pg.screenshot(path=SHOTS + 'r22-narrow.png')
    pg.set_viewport_size({'width': 1280, 'height': 800}); pg.wait_for_timeout(800)
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); }"); pg.wait_for_timeout(6000)
    pg.evaluate(SUNON); pg.wait_for_timeout(1500)
    c = pg.evaluate(CORNER)
    check('phone, sun bar open: the Slice button and the cube moved down below it (not covered)', c['push'] not in ('', '0px') and not overlap(c['bar'], c['slice']) and not overlap(c['bar'], c['cube']), c)
    pg.screenshot(path=SHOTS + 'r22-phone-sunbar.png')
    pg.tap('#sun-fold'); pg.wait_for_timeout(800)
    c2 = pg.evaluate(CORNER)
    check('phone, folded: just the sun; the cube and Slice back up', pg.evaluate(BAR)['folded'] and c2['push'] in ('', '0px') and not overlap(c2['bar'], c2['cube']), c2)
    pg.tap('#sun-fold'); pg.wait_for_timeout(600)
    pg.tap('#sun-day-lab'); pg.wait_for_timeout(600)
    fit = pg.evaluate("() => { const d = document.querySelector('.scrim:last-child .dialog').getBoundingClientRect(), b = document.querySelector('#dp-grid .dp-day').getBoundingClientRect(); return [d.left >= 0 && d.right <= innerWidth + 1, Math.round(b.height), Math.round(b.width)]; }")
    check('phone: the month fits the screen, days big enough to tap', fit[0] and fit[1] >= 36 and fit[2] >= 30, fit)
    pg.screenshot(path=SHOTS + 'r22-phone-day.png')
    pg.tap('#dp-grid .dp-day[data-doy="200"]'); pg.wait_for_timeout(300)
    foot(pg, 'OK', True)
    check('phone: the day chosen', pg.evaluate("() => window.__hp.app.settings.sunDay") == 200)
    pg.tap('#sun-time-lab'); pg.wait_for_timeout(500)
    pg.screenshot(path=SHOTS + 'r22-phone-time.png')
    pg.tap('#tp-hours .tp-btn[data-h="18"]'); pg.wait_for_timeout(200)
    foot(pg, 'OK', True)
    check('phone: the time chosen', pg.evaluate("() => Math.floor(window.__hp.app.settings.sunTime / 60)") == 18)
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
