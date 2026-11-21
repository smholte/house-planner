"""Task 0047 – cheap gaps closed: the ⋯ menu's entries, the projects page's buttons and the 3D view cube's menu,
each pressed once on the made-up house: it opens, shows the right thing, closes again (PC light + phone dark).

    python3 tests/test_cover_menus.py
"""
import sys
from common import *

DLG = '#sheet-root .scrim:last-child .dialog'
N_DLG = "() => document.querySelectorAll('#sheet-root .scrim').length"


def press(pg, phone, sel):
    (pg.tap if phone else pg.click)(sel)


def menu_entry(pg, phone, label, anchor='#btn-menu'):
    "open a menu and press its entry (by its English text, or #id)"
    press(pg, phone, anchor); pg.wait_for_selector('body > .menu .mi')
    sel = label if label.startswith('#') else f'body > .menu .mi:has-text("{label}")'
    pg.locator(sel).first.scroll_into_view_if_needed()
    press(pg, phone, sel)
    pg.wait_for_timeout(500)


def dialog_title(pg):
    return pg.evaluate("() => { const d = document.querySelectorAll('#sheet-root .scrim .dialog'); return d.length ? d[d.length - 1].getAttribute('aria-label') || '' : null; }")


def close_dialog(pg):
    n = pg.evaluate(N_DLG)
    pg.keyboard.press('Escape')
    pg.wait_for_function(f"() => document.querySelectorAll('#sheet-root .scrim').length < {n}", timeout=20000)


def fits(pg):
    return pg.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")


# covers: menu:Versions…, menu:New version from this one, menu:Make a save point, menu:Save points and autosaves…
# covers: menu:Export for viewing (family, suppliers)…, #mi-export, #mi-hpscene, #mi-kparts, #mi-docs
# covers: menu:Task board…, menu:Drawings: façades and sections…, menu:Plans as PDF, to scale…, menu:Storeys…
# covers: menu:Rename project, menu:Undo history
MENU = [  # (the entry, words in the dialog's title)
    ('Versions…', 'ersion'),
    ('New version from this one', 'ersion'),
    ('Make a save point', 'save point'),
    ('Save points and autosaves…', 'ave'),
    ('Export for viewing (family, suppliers)…', ''),
    ('#mi-export', 'xport'),
    ('#mi-hpscene', 'Fresing'),
    ('#mi-kparts', 'itchen'),
    ('#mi-docs', 'ocument'),
    ('Task board…', ''),
    ('Drawings: façades and sections…', ''),
    ('Plans as PDF, to scale…', 'PDF'),
    ('Storeys…', 'torey'),
    ('Rename project', 'ename'),
    ('Undo history', ''),
]


def editor_menu(p, phone, theme):
    tag = 'phone dark' if phone else 'PC light'
    b, pg = open_app(p, phone=phone, theme=theme)
    open_example(pg)
    for entry, words in MENU:
        menu_entry(pg, phone, entry)
        title = dialog_title(pg)
        check(f'{tag}: ⋯ {entry} opens its window' + (f' ("{words}" in its title)' if words else ''),
              title is not None and words.lower() in title.lower(), title)
        if title is not None:
            check(f'{tag}: … it fits the screen', fits(pg))
            close_dialog(pg)
        check(f'{tag}: … and closes again', pg.evaluate(N_DLG) == 0)
    # covers: menu:Help: what each button does
    menu_entry(pg, phone, 'Help: what each button does')
    check(f'{tag}: ⋯ Help: the help labels over the buttons', pg.locator('.help-ov').count() == 1)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    if pg.locator('.help-ov').count():
        pg.locator('.help-ov').click(position={'x': 5, 'y': 5}); pg.wait_for_timeout(400)
    check(f'{tag}: … and they go again', pg.locator('.help-ov').count() == 0)
    # covers: #btn-project-name, #btn-savepoint, #btn-fit
    if pg.is_visible('#btn-project-name'):
        press(pg, phone, '#btn-project-name'); pg.wait_for_timeout(400)
        check(f'{tag}: the project name in the top bar asks for a new name', pg.locator(DLG + ' #dlg-input').count() == 1)
        close_dialog(pg)
    else:
        check(f'{tag}: the project name is left out of the narrow top bar (Rename project is in ⋯, tested above)', phone)
    if pg.is_visible('#btn-savepoint'):
        press(pg, phone, '#btn-savepoint'); pg.wait_for_timeout(400)
        check(f'{tag}: Save point asks for its name', pg.locator(DLG + ' #dlg-input').count() == 1, dialog_title(pg))
        close_dialog(pg)
    else:
        check(f'{tag}: Save point is in the ⋯ menu on a phone (hide-sm)', phone)
    v0 = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.cam.ty += 300; v.applyCam(); return v.cam.ty; }")
    if pg.is_visible('#btn-fit'):
        press(pg, phone, '#btn-fit')
    else:      # the phone's bar has no room for it: Home view is in the Show menu there
        menu_entry(pg, phone, 'Home view', anchor='#btn-display')
    pg.wait_for_timeout(600)
    check(f'{tag}: Home view brings the plan back', pg.evaluate("() => window.__hp.app.panes[0].view.cam.ty") != v0)
    # covers: menu:All projects
    menu_entry(pg, phone, 'All projects')
    check(f'{tag}: ⋯ All projects: the projects page', pg.is_visible('#project-list') and not pg.is_visible('#btn-menu'))
    check(f'{tag}: no page errors', not pg.errors, pg.errors[:3])
    b.close()


def projects_page(p, phone, theme):
    tag = 'phone dark' if phone else 'PC light'
    b, pg = open_app(p, phone=phone, theme=theme)
    open_example(pg)
    menu_entry(pg, phone, 'All projects')
    pg.wait_for_selector('#project-list .pcard')
    cards = lambda: pg.locator('#project-list .pcard').count()  # noqa: E731
    n0 = cards()
    # covers: #btn-settings, #btn-trash, #btn-backup
    # covers: #btn-backup
    pg.locator('#btn-backup').scroll_into_view_if_needed()
    with pg.expect_download(timeout=120000) as dl:
        press(pg, phone, '#btn-backup')
    name = dl.value.suggested_filename
    check(f'{tag}: projects page Back up everything: a backup file of all houses', name.startswith('house-planner-backup_'), name)
    for sel, words in (('#btn-settings', 'ettings'), ('#btn-trash', 'rash')):
        pg.locator(sel).scroll_into_view_if_needed()
        press(pg, phone, sel); pg.wait_for_timeout(600)
        title = dialog_title(pg)
        check(f'{tag}: projects page {sel} opens its window', title is not None and words.lower() in title.lower(), title)
        if title is not None:
            check(f'{tag}: … it fits the screen', fits(pg))
            close_dialog(pg)
    # the ⋯ of a project card: Rename, Duplicate, Move to trash
    more = '#project-list .pcard:first-child button[aria-label^="More for"]'
    # covers: menu:Rename, menu:Duplicate, menu:Move to trash
    menu_entry(pg, phone, 'Rename', anchor=more)
    check(f'{tag}: card ⋯ Rename asks for the new name', pg.locator(DLG + ' #dlg-input').count() == 1)
    close_dialog(pg)
    menu_entry(pg, phone, 'Duplicate', anchor=more)
    pg.wait_for_function(f"() => document.querySelectorAll('#project-list .pcard').length > {n0}", timeout=20000)
    check(f'{tag}: card ⋯ Duplicate: one project more', cards() == n0 + 1, cards())
    menu_entry(pg, phone, 'Move to trash', anchor=more)
    if dialog_title(pg) is not None:
        press(pg, phone, DLG + ' .dlg-foot .btn.danger, ' + DLG + ' .dlg-foot .btn.primary'); pg.wait_for_timeout(800)
    pg.wait_for_function(f"() => document.querySelectorAll('#project-list .pcard').length === {n0}", timeout=20000)
    check(f'{tag}: card ⋯ Move to trash: one project less again', cards() == n0, cards())
    # covers: #btn-hide-intro
    if pg.is_visible('#btn-hide-intro'):
        press(pg, phone, '#btn-hide-intro'); pg.wait_for_timeout(400)
        check(f'{tag}: Hide takes the four steps away', not pg.is_visible('#intro'))
    else:
        check(f'{tag}: the four steps are already hidden once a project is there', not pg.is_visible('#intro'))
    check(f'{tag}: nothing sticks out sideways', fits(pg))
    pg.screenshot(path=SHOTS + f'cover-projects-{"phone" if phone else "pc"}.png')
    check(f'{tag}: no page errors', not pg.errors, pg.errors[:3])
    b.close()


# covers: menu:Top view, menu:Front view, menu:Go to home view, menu:Reset home view to default
def view_cube(p, phone, theme):
    tag = 'phone dark' if phone else 'PC light'
    b, pg = open_app(p, phone=phone, theme=theme)
    open_example(pg)
    press(pg, phone, '#dim-toggle [data-dim="3d"]' if pg.locator('#dim-toggle').count() else '[data-dim="3d"]')
    pg.wait_for_function("() => { const v = window.__hp.app.panes[0].view; return v && v.camera; }", timeout=90000)
    pg.wait_for_selector('.vc-menu', state='attached', timeout=90000)
    still(pg)
    cam = "() => window.__hp.app.panes[0].view.camera.position.toArray().map(x => +x.toFixed(2))"
    for entry in ('Top view', 'Front view', 'Set current view as home', 'Go to home view', 'Reset home view to default'):
        c0 = pg.evaluate(cam)
        pg.locator('.vc-menu').first.click(force=True)
        pg.wait_for_selector('body > .menu .mi')
        press(pg, phone, f'body > .menu .mi:has-text("{entry}")')
        still(pg)
        c1 = pg.evaluate(cam)
        if entry.startswith('Set'):
            check(f'{tag}: view cube ⋯ {entry}: this view is the home view now', pg.evaluate("() => !!(window.__hp.app.panes[0].view.spec || {}).homeView"))
        elif entry.startswith('Reset'):
            check(f'{tag}: view cube ⋯ {entry}: the home view is the default again', pg.evaluate("() => !(window.__hp.app.panes[0].view.spec || {}).homeView"))
        elif entry.startswith('Go'):
            check(f'{tag}: view cube ⋯ {entry}: back at the home view (the front view set just before)', c1 == c0, (c0, c1))
        else:
            check(f'{tag}: view cube ⋯ {entry}: the camera moved', c1 != c0, (c0, c1))
        if entry == 'Top view':
            d = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; const t = v.controls.target, c = v.camera.position; return [c.y - t.y, Math.hypot(c.x - t.x, c.z - t.z)]; }")
            check(f'{tag}: … Top view looks straight down', d[0] > 5 * d[1], d)
    check(f'{tag}: no page errors', not pg.errors, pg.errors[:3])
    b.close()


with sync_playwright() as p:
    for phone, theme in ((False, 'light'), (True, 'dark')):
        editor_menu(p, phone, theme)
        projects_page(p, phone, theme)
        view_cube(p, phone, theme)
sys.exit(summary())
