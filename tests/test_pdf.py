"""Plans as PDF, to scale: a real PDF file with the floor plans (dimensions, room names), the plot and garden, the
façades; A3 or A4, the largest scale that fits or one you choose; a scale bar, north and a title block. The plan
picture has exactly the size the scale says. PC and phone."""
from common import *
import re

def pdf_info(path):
    data = open(path, 'rb').read()
    pages = len(re.findall(rb'/Type /Page\b(?!s)', data))
    boxes = re.findall(rb'/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]', data)
    return data, pages, [(float(a), float(b)) for a, b in boxes]

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(500)
    pg.click('#btn-menu'); pg.wait_for_timeout(300)
    pg.click('.menu button:has-text("Plans as PDF")'); pg.wait_for_timeout(600)
    labels = pg.evaluate("() => [...document.querySelectorAll('.pdf-pages label')].map(l => [l.textContent, l.querySelector('input').checked])")
    check('the pages on offer: each storey, the plot, façades and sections', len(labels) >= 10 and labels[0][0].startswith('Floor plan') and any('Plot' in l[0] for l in labels), labels)
    with pg.expect_download(timeout=300000) as dl:
        pg.click('#pdf-make')
    data, n, boxes = pdf_info(dl.value.path())
    want = sum(1 for l in labels if l[1])
    check('a PDF file (.pdf) with one page per ticked drawing', dl.value.suggested_filename.endswith('.pdf') and data[:5] == b'%PDF-' and n == want, (dl.value.suggested_filename, n, want))
    check('A3 landscape pages', boxes and all(abs(w - 1190.55) < 0.1 and abs(hh - 841.89) < 0.1 for w, hh in boxes), boxes[:2])
    check('each page says its scale (floor plans 1:100, the plot 1:200)', data.count(rb'Scale 1:100 \(A3\)') >= 3 and rb'Scale 1:200 \(A3\)' in data)
    # (the title block names the house: PDF strings escape their brackets)
    hname = pg.evaluate("() => window.__hp.app.project.name").replace('(', r'\(').replace(')', r'\)').encode('latin-1')
    check('with pictures (JPEG) and the title block', data.count(b'/Filter /DCTDecode') == n and hname in data and b'Floor plan Begane grond' in data, hname)
    st = pg.inner_text('#pdf-status')
    check('the window says it is ready', 'Ready' in st and 'pages' in st, st)
    # A4, 1:50, only the ground floor, with furniture and electrics
    for inp in pg.query_selector_all('.pdf-pages input'):
        if inp.is_checked(): inp.click()
    pg.click('.pdf-pages label:has-text("Floor plan · Begane grond") input')
    pg.click('#pdf-paper button[data-k="A4"]'); pg.click('#pdf-scale button[data-k="50"]')
    pg.click('#pdf-furniture'); pg.click('#pdf-installs')
    with pg.expect_download(timeout=300000) as dl2:
        pg.click('#pdf-make')
    data2, n2, boxes2 = pdf_info(dl2.value.path())
    check('A4 at 1:50, one page', n2 == 1 and abs(boxes2[0][0] - 841.89) < 0.1 and rb'Scale 1:50 \(A4\)' in data2, (n2, boxes2))
    pg.click('.scrim:last-child .dialog .dlg-head button[aria-label="Close"]'); pg.wait_for_timeout(400)
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    # true size: a 10 m wall at 1:100 is 100 mm on paper (4 px/mm, drawn twice as sharp: 800 px)
    b, pg = open_app(p)
    pg.click('#btn-new'); pg.wait_for_timeout(400); pg.click('.dialog .btn.primary'); pg.wait_for_timeout(1500)
    pg.evaluate("() => { const a = window.__hp.app; a.addWall([0, 0], [10, 0], 0.3, 'exterior'); a.addWall([10, 0], [10, 6], 0.3, 'exterior'); }"); pg.wait_for_timeout(300)
    w = pg.evaluate("""async () => { const a = window.__hp.app; const st = a.currentStorey(); const cv = await a.planPicture(st, 200, 120, 100, { bbox: { minX: 0, minY: 0, maxX: 10, maxY: 6 }, dims: false });
      const g = cv.getContext('2d'); const y = Math.round(cv.height / 2 - 3 * 80); const row = g.getImageData(0, y, cv.width, 1).data;
      let x0 = -1, x1 = -1; for (let x = 0; x < cv.width; x++) { const i = x * 4; if (row[i] + row[i + 1] + row[i + 2] < 400) { if (x0 < 0) x0 = x; x1 = x; } }
      return [cv.width, cv.height, x0, x1]; }""")
    check('true size: the 10 m wall is 100 mm on paper at 1:100', w[0] == 1600 and abs((w[3] - w[2]) - (10.3 * 80)) <= 6, w)
    b.close()

    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.tap('#btn-menu'); pg.wait_for_timeout(400)
    pg.tap('.menu button:has-text("Plans as PDF")'); pg.wait_for_timeout(600)
    check('phone: the PDF window opens', pg.is_visible('#pdf-make'))
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'pdf-phone-dark.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
