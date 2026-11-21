"""Projects page (task 0049): Hide no longer hides the steps for good, the example is always reachable, and the Fresing
top bar (logo -> fresing.nl, House Planner, More tools, Help). PC light and phone dark."""
from common import *

def run(phone, theme):
    tag = ('phone dark: ' if phone else 'PC light: ')
    with sync_playwright() as p:
        b, pg = open_app(p, phone=phone, theme=theme)
        pg.evaluate("() => window.__hp.Settings.set('introDismissed', false)")
        pg.evaluate("() => window.__hp.app.showHome()"); pg.wait_for_timeout(500)
        tap = (lambda s: pg.tap(s)) if phone else (lambda s: pg.click(s))
        # the bar
        r = pg.evaluate("() => { const f = document.querySelector('#fbar'); const w = document.documentElement; return { vis: !!f.offsetHeight, scroll: w.scrollWidth - w.clientWidth, href: document.querySelector('.fbar-logo').href, target: document.querySelector('.fbar-logo').target, logo: document.querySelector('.fbar-logo img').currentSrc.slice(0, 26), bg: getComputedStyle(f).backgroundColor }; }")
        check(tag + 'the Fresing bar is on the projects page, dark', r['vis'] and r['bg'] == 'rgb(26, 32, 39)', r)
        check(tag + 'the logo links to fresing.nl in a new tab', r['href'].startswith('https://fresing.nl') and r['target'] == '_blank' and r['logo'].startswith('data:image/svg+xml'), r)
        check(tag + 'the bar fits the width (no sideways scroll)', r['scroll'] <= 0, r)
        if phone:
            check(tag + 'the phone gets the compact logo', pg.evaluate("() => document.querySelector('.fbar-logo img').currentSrc") == pg.evaluate("() => document.querySelector('.fbar-logo source').srcset"))
        check(tag + 'House Planner is marked as the current tool', 'House Planner' in pg.inner_text('.ftool.here') or phone)
        # More tools
        tap('#fmore summary'); pg.wait_for_timeout(200)
        links = pg.evaluate("() => [...document.querySelectorAll('#fmore-list a')].map(a => [a.textContent, a.href, a.target])")
        check(tag + 'More tools opens and lists Fresing Render (new tab)', pg.evaluate("() => document.querySelector('#fmore').open") and len(links) == 1 and 'Fresing Render' in links[0][0] and links[0][1].startswith('https://smholte.github.io/CAD-render-animation') and links[0][2] == '_blank', links)
        inside = pg.evaluate("() => { const r = document.querySelector('#fmore-list').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }")
        check(tag + 'the menu stays on the screen', inside)
        (pg.touchscreen.tap(8, 800) if phone else pg.mouse.click(5, 700)); pg.wait_for_timeout(200)
        check(tag + 'a tap elsewhere closes it', not pg.evaluate("() => document.querySelector('#fmore').open"))
        # Help
        tap('#fbar-help'); pg.wait_for_timeout(500)
        check(tag + 'Help opens the help overlay', pg.is_visible('#help-ov'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        # the editor has no bar
        # Hide → steps gone → example still reachable
        check(tag + 'the steps show at first and the example button is in them', pg.is_visible('#intro') and pg.is_visible('#btn-example') and not pg.is_visible('#btn-example-home'))
        tap('#btn-hide-intro'); pg.wait_for_timeout(300)
        check(tag + 'Hide hides the steps', not pg.is_visible('#intro') and pg.is_visible('#btn-show-intro'))
        check(tag + 'the example button sits beside New project', pg.is_visible('#btn-example-home'))
        pg.evaluate("() => window.__hp.app.showHome()"); pg.wait_for_timeout(500)
        check(tag + 'hidden steps stay hidden after a reload of the page', not pg.is_visible('#intro'))
        # Show steps link
        tap('#btn-show-intro'); pg.wait_for_timeout(300)
        check(tag + 'the link brings the steps back', pg.is_visible('#intro') and not pg.is_visible('#btn-show-intro') and not pg.evaluate("() => window.__hp.Settings.get ? window.__hp.Settings.get('introDismissed') : window.__hp.app.settings.introDismissed"))
        # Settings route
        tap('#btn-hide-intro'); pg.wait_for_timeout(200)
        tap('#btn-settings'); pg.wait_for_timeout(500)
        tap('#set-show-intro'); pg.wait_for_timeout(300)
        pg.evaluate("() => { const d = document.querySelector('.scrim .btn.primary'); if (d) d.click(); }"); pg.wait_for_timeout(300)
        check(tag + 'Settings > Show the getting-started steps brings them back', pg.is_visible('#intro'))
        # the example with the steps hidden, and after the example was deleted
        tap('#btn-hide-intro'); pg.wait_for_timeout(200)
        tap('#btn-example-home')
        pg.wait_for_function("() => window.__hp.app.project", timeout=90000); pg.wait_for_timeout(1500)
        n1 = pg.evaluate("() => window.__hp.app.project.name")
        check(tag + 'the example opens with the steps hidden', bool(n1) and not pg.is_visible('#fbar'), n1)
        pg.evaluate("async () => { const a = window.__hp.app; const id = a.project.id; await a.showHome(); await window.__hp.DB.del('projects', id); await a.showHome(); }"); pg.wait_for_timeout(500)
        left = pg.evaluate("async () => (await window.__hp.DB.all('projects')).length")
        check(tag + 'the example project is gone', left == 0, left)
        tap('#btn-settings'); pg.wait_for_timeout(500)
        tap('#set-example')
        pg.wait_for_function("() => window.__hp.app.project", timeout=90000); pg.wait_for_timeout(1500)
        check(tag + 'Settings > Open example house makes it again', pg.evaluate("() => !!window.__hp.app.project") and not pg.is_visible('#fbar'))
        check(tag + 'no page errors', not pg.errors, pg.errors)
        b.close()

for phone, theme in ((False, 'light'), (True, 'dark')):
    run(phone, theme)
raise SystemExit(summary())
