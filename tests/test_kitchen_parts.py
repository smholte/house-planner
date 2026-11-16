"""Kitchen parts list (task 0037): every part of the kitchen's runs and islands – units, fronts, worktop with cut-outs,
plinth, panels, appliances – as a sheet, a CSV for Excel (BOM, semicolons, decimal comma in Dutch) and a print page
(A4) with the top view; the sums checked against the units. PC (light) and phone (dark)."""
from common import *

DATA = "() => { const D = window.__hp.app.kitchenPartsData(); return { rows: D.rows, runs: D.runs.map(r => ({ no: r.no, w: r.it.w, island: !!r.it.island, trim: r.it.topTrim || [0, 0], te: r.it.island ? (r.it.topEnd || 0) : 0, ov: r.it.island ? 0 : (r.it.topOv != null ? r.it.topOv : 0.02), units: (r.it.units || []).map(u => [u.k, u.w]) })) }; }"

def run_all(phone, theme, tag):
    with sync_playwright() as p:
        b, pg = open_app(p, phone=phone, theme=theme)
        open_example(pg)
        pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(1000)
        D = pg.evaluate(DATA)
        check(tag + ': the kitchen has runs and rows in every section', len(D['runs']) >= 1 and {r['sec'] for r in D['rows']} >= {'Units', 'Fronts', 'Worktop', 'Plinth', 'Appliances'}, {r['sec'] for r in D['rows']})
        # sums by hand: the units add up to the run, the worktop is the run plus the ends minus the trims
        for r in D['runs']:
            if r['island']: continue
            tot = [x for x in D['rows'] if x['run'] == r['no'] and x['type'] == 'Total' and x['sec'] == 'Units']
            wt = [x for x in D['rows'] if x['run'] == r['no'] and x['part'] == 'Worktop piece']
            sm = sum(w for _, w in r['units'])
            check(tag + f": run {r['no']}: total of units = sum of the unit widths", tot and abs(tot[0]['w'] - sm * 1000) <= 1.5, (tot, sm))
            check(tag + f": run {r['no']}: worktop length = units - trims", wt and abs(wt[0]['w'] - (sm - r['trim'][0] - r['trim'][1]) * 1000) <= 1.5, (wt, sm))
            fr = sum(x['qty'] for x in D['rows'] if x['run'] == r['no'] and x['sec'] == 'Fronts')
            check(tag + f": run {r['no']}: fronts counted", fr >= 1, fr)
        sinks = [x for x in D['rows'] if x['part'] == 'Cut-out: sink']
        hobs = [x for x in D['rows'] if x['part'] == 'Cut-out: hob']
        check(tag + ': sink and hob cut-outs with distances from the left end', sinks and hobs and 'mm' in sinks[0]['note'] and 'left' in sinks[0]['note'].lower(), (sinks, hobs))
        # the sheet (menu and builder button)
        pg.evaluate("() => { window.__hp.app.kitchenPartsSheet(); }"); pg.wait_for_selector('#kp-sheet'); pg.wait_for_timeout(500)
        n = pg.evaluate("() => document.querySelectorAll('#kp-sheet .kp-table tbody tr').length")
        check(tag + ': the sheet shows the list and the top view', n == len(D['rows']) and pg.evaluate("() => !!document.querySelector('#kp-sheet svg.kp-top text')"), n)
        w = pg.evaluate("() => { const e = document.querySelector('#kp-sheet').getBoundingClientRect(); return [e.width, innerWidth, document.documentElement.scrollWidth]; }")
        check(tag + ': readable, no page scrolling sideways', w[2] <= w[1] + 1, w)
        pg.screenshot(path=SHOTS + f'kitchen-parts-{tag}.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        # the CSV: bytes
        pg.evaluate("() => { const a = window.__hp.app; window.__csv = []; a.downloadBlob = (n, bl) => { window.__csv.push([n, bl]); }; a.kitchenPartsCsv(); }")
        raw = pg.evaluate("async () => { const [n, bl] = window.__csv[0]; return [n, [...new Uint8Array(await bl.arrayBuffer())].slice(0, 3), await bl.text()]; }")
        check(tag + ': CSV starts with the BOM, named with house and version', raw[1] == [0xEF, 0xBB, 0xBF] and raw[0].endswith('.csv'), raw[:2])
        txt = raw[2].lstrip('﻿'); lines = txt.split('\r\n')
        check(tag + ': CSV separated by semicolons, one row per part', all(l.count(';') >= 9 for l in lines[3:] if l and not l.startswith('"Not in')) and len(lines) >= len(D['rows']) + 3, lines[:5])
        check(tag + ': CSV decimal point in English', any(';0.' in l or ';1.' in l or ';2.' in l or ';3.' in l or ';4.' in l for l in lines if 'area' in l.lower()), [l for l in lines if 'area' in l.lower()])
        pg.evaluate("() => { const I = window.__hp.I18N; I.lang = 'nl'; window.__csv = []; window.__hp.app.kitchenPartsCsv(); I.lang = 'en'; }")
        nl = pg.evaluate("async () => await window.__csv[0][1].text()")
        area = [l for l in nl.split('\r\n') if 'm²' in l]
        check(tag + ': CSV decimal comma in Dutch', area and ',' in area[0].split(';')[8], area)
        # print page: A4 and the numbers of the top view are the numbers of the list
        html = pg.evaluate("() => window.__hp.app.kitchenPartsHtml()")
        check(tag + ': print page is A4 with the top view', 'size: A4' in html and '<svg class="kp-top"' in html and 'Kitchen parts list' in html)
        nums = pg.evaluate("() => [...new Set(window.__hp.app.kitchenPartsData().rows.filter(r => r.sec === 'Units' && r.type !== 'Total' && r.type !== 'Wall unit').map(r => r.no))]")
        import re
        svgn = set(re.findall(r'>(\d+\.B?\d+)</text>', html))
        check(tag + ': top view numbers = list numbers', set(nums) <= svgn and len(nums) >= 3, (nums[:5], sorted(svgn)[:5]))
        check(tag + ': no page errors', not pg.errors, pg.errors)
        b.close()

run_all(False, 'light', 'pc')
run_all(True, 'dark', 'phone')
sys.exit(summary())
