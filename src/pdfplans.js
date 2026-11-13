/* ───────────── pdfplans.js — plans as a PDF file, to scale ─────────────
   A small PDF writer (pages with JPEG pictures, lines and text in Helvetica) and the "Plans as PDF" window: the floor
   plan of each storey with its dimensions, the plot with the garden, the four façades and two sections, on A4 or A3
   landscape at 1:50, 1:100 or 1:200, each page with a scale bar, north and a title block. The plans are drawn by a
   hidden 2D view at a known number of pixels per millimetre, so the picture is placed in the PDF at its true size. */

const PT = 72 / 25.4;   // points per mm
const PAPER = { A4: [297, 210], A3: [420, 297] };
const PLAN_SCALES = [20, 50, 100, 200, 500];

/** text for a PDF string in WinAnsi (Helvetica's standard encoding) */
function pdfText(str) {
  const map = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
  let out = '';
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    const b = map[ch] ?? (c < 256 ? c : 63);
    if (b === 40 || b === 41 || b === 92) out += '\\' + String.fromCharCode(b);
    else if (b < 32 || b > 126) out += '\\' + b.toString(8).padStart(3, '0');
    else out += String.fromCharCode(b);
  }
  return out;
}
/** Helvetica widths (1/1000 em) for ASCII, to right-align and fit text */
const HELV_W = '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584'.split(',').map(Number);
function textWidthMM(str, sizePt, bold) { let w = 0; for (const ch of String(str)) { const c = ch.charCodeAt(0); w += (c >= 32 && c < 127 ? HELV_W[c - 32] : 556) * (bold ? 1.06 : 1); } return w / 1000 * sizePt / PT; }

class PdfWriter {
  constructor() { this.pages = []; }
  /** a page w × h mm; returns a drawing context in mm with the origin at the top left */
  page(wmm, hmm) {
    const pg = { w: wmm, h: hmm, ops: [], images: [] };
    this.pages.push(pg);
    const X = x => (x * PT).toFixed(2), Y = y => ((hmm - y) * PT).toFixed(2);
    const ctx = {
      image(jpeg, pxW, pxH, x, y, w, hh) { const name = 'Im' + (pg.images.length + 1); pg.images.push({ name, jpeg, pxW, pxH }); pg.ops.push(`q ${(w * PT).toFixed(2)} 0 0 ${(hh * PT).toFixed(2)} ${X(x)} ${Y(y + hh)} cm /${name} Do Q`); },
      text(str, x, y, sizePt, opt = {}) {
        let xx = x;
        if (opt.align === 'right') xx = x - textWidthMM(str, sizePt, opt.bold);
        else if (opt.align === 'center') xx = x - textWidthMM(str, sizePt, opt.bold) / 2;
        const col = opt.color || [0.1, 0.13, 0.14];
        pg.ops.push(`BT ${col.map(v => v.toFixed(3)).join(' ')} rg /${opt.bold ? 'F2' : 'F1'} ${sizePt} Tf ${X(xx)} ${Y(y)} Td (${pdfText(str)}) Tj ET`);
      },
      line(x1, y1, x2, y2, wmm2 = 0.25, col = [0, 0, 0]) { pg.ops.push(`${col.join(' ')} RG ${(wmm2 * PT).toFixed(2)} w ${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S`); },
      rect(x, y, w, hh, opt = {}) {
        const r = `${X(x)} ${Y(y + hh)} ${(w * PT).toFixed(2)} ${(hh * PT).toFixed(2)} re`;
        if (opt.fill) pg.ops.push(`${opt.fill.join(' ')} rg ${r} f`);
        if (opt.stroke !== false) pg.ops.push(`${(opt.color || [0, 0, 0]).join(' ')} RG ${((opt.w || 0.25) * PT).toFixed(2)} w ${r} S`);
      },
      poly(pts, opt = {}) {
        const d = pts.map((p, i) => `${X(p[0])} ${Y(p[1])} ${i ? 'l' : 'm'}`).join(' ') + ' h';
        if (opt.fill) pg.ops.push(`${opt.fill.join(' ')} rg ${d} f`);
        if (opt.stroke) pg.ops.push(`${opt.stroke.join(' ')} RG ${((opt.w || 0.25) * PT).toFixed(2)} w ${d} S`);
      },
    };
    return ctx;
  }
  /** the file */
  blob() {
    const enc = new TextEncoder();
    const parts = [];
    let len = 0;
    const offsets = [];
    const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const objs = [];   // [id, builder]
    let nextId = 3;
    const fontR = nextId++, fontB = nextId++;
    const pageIds = [];
    const pageObjs = [];
    for (const pg of this.pages) {
      const imgIds = pg.images.map(() => nextId++);
      const contentId = nextId++, pageId = nextId++;
      pageIds.push(pageId);
      pageObjs.push({ pg, imgIds, contentId, pageId });
    }
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-ÿ]/g, c => c));
    const obj = (id, body) => { offsets[id] = len; push(`${id} 0 obj\n`); if (typeof body === 'string') push(body); else for (const b of body) push(b); push('\nendobj\n'); };
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`);
    obj(fontR, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(fontB, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    for (const { pg, imgIds, contentId, pageId } of pageObjs) {
      pg.images.forEach((im, i) => obj(imgIds[i], [`<< /Type /XObject /Subtype /Image /Width ${im.pxW} /Height ${im.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`, im.jpeg, '\nendstream']));
      const content = enc.encode(pg.ops.join('\n'));
      obj(contentId, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
      const xo = pg.images.map((im, i) => `/${im.name} ${imgIds[i]} 0 R`).join(' ');
      obj(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${(pg.w * PT).toFixed(2)} ${(pg.h * PT).toFixed(2)}] /Resources << /Font << /F1 ${fontR} 0 R /F2 ${fontB} 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${contentId} 0 R >>`);
    }
    const xref = len;
    const n = nextId;
    let x = `xref\n0 ${n}\n0000000000 65535 f \n`;
    for (let i = 1; i < n; i++) x += String(offsets[i] || 0).padStart(10, '0') + ' 00000 n \n';
    push(x);
    push(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }
}

async function canvasJpeg(cv, q = 0.9) {
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', q));
  return new Uint8Array(await blob.arrayBuffer());
}

Object.assign(app, {
  /** a storey's floor plan drawn at `scale` into a picture of wmm × hmm (px per mm: ppmm), plain black and white */
  async planPicture(st, wmm, hmm, scale, opt = {}) {
    const ppmm = opt.ppmm || 4, k = opt.k || 2;
    const W = Math.round(wmm * ppmm), H = Math.round(hmm * ppmm);
    const host = h('div', { class: 'plan-print-host', 'aria-hidden': 'true', style: { position: 'fixed', left: '-14000px', top: '0', width: W + 'px', height: H + 'px' } });
    document.body.appendChild(host);
    const v = new PlanView(host, this, { print: true });
    const p = this.project, ver = this.shownVersion();
    const ex = this.entryExtras(st, 'main');
    const low = lowestStorey(p);
    const en = { storey: st, plan: ver.plan, offset: [0, 0], edit: false, bbox: this.storeyBBox([ver.plan], st, false), versionId: ver.id, fixtures: this.shell && this.shell.fixtures2d[st.id], furniture: opt.furniture ? ex.furniture : [], faintFurn: false, upperId: ex.upperId };
    if (opt.garden && p.site && low && low.id === st.id) Object.assign(en, { site: p.site });
    const theme = document.documentElement.dataset.theme;
    let img;
    try {
      document.documentElement.dataset.theme = 'light';
      v.W = W; v.H = H; v.svg.setAttribute('width', W); v.svg.setAttribute('height', H);
      v.setSpec({ entries: [en], editable: false, selection: null, colorBy: opt.colour ? 'floor' : 'none', labels: true, dims: opt.dims !== false, mode: 'build', tool: 'select', installs: !!opt.installs, print: true });
      // centre the drawing: 1 m = 1000 / scale mm
      const bb = opt.bbox || en.bbox || { minX: 0, minY: 0, maxX: 10, maxY: 10 };
      const s2 = 1000 / scale * ppmm;
      v.cam = { s: s2, tx: W / 2 - (bb.minX + bb.maxX) / 2 * s2, ty: H / 2 - (bb.minY + bb.maxY) / 2 * s2 };
      v.applyCam();
      if (v.northEl) v.northEl.hidden = true;
      // the drawing with its own colours written in (as on screen, in light)
      const src = v.svg, clone = src.cloneNode(true);
      const all = [src, ...src.querySelectorAll('*')], allC = [clone, ...clone.querySelectorAll('*')];
      const props = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'paint-order', 'vector-effect', 'visibility', 'display', 'letter-spacing'];
      all.forEach((el, i) => { const cs = getComputedStyle(el), out = allC[i]; if (out && out.setAttribute) out.setAttribute('style', props.map(pp => `${pp}:${cs.getPropertyValue(pp)}`).join(';')); });
      const grid = clone.querySelector('.grid'); if (grid) grid.remove();
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.insertBefore(s('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' }), clone.firstChild);
      document.documentElement.dataset.theme = theme;
      if (theme == null) delete document.documentElement.dataset.theme;
      const xml = new XMLSerializer().serializeToString(clone);
      img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml));
    } finally {
      if (theme == null) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
      v.destroy(); host.remove();
    }
    const cv = makeCanvas(W * k, H * k);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, W * k, H * k);
    return cv;
  },

  /** the pages on offer */
  pdfPageList() {
    const p = this.project;
    const list = sortedStoreys(p).map(st => ({ key: 'plan:' + st.id, kind: 'plan', st, label: t('Floor plan') + ' · ' + st.name, on: true }));
    if (p.site) list.push({ key: 'site', kind: 'site', label: t('Plot and garden'), on: true });
    for (const it of this.drawingList()) if (it.kind !== 'slice') list.push({ key: 'draw:' + it.key, kind: 'draw', item: it, label: it.title, on: it.kind === 'side' });
    return list;
  },

  /** make the PDF: { pages: keys, paper: 'A4' | 'A3', scale: 'auto' | n, dims, furniture, installs, colour } */
  async buildPlansPdf(o, onProgress) {
    const p = this.project, ver = this.shownVersion();
    const [PW, PH] = PAPER[o.paper || 'A3'];
    const M = 10, TB = 24;   // margin, title block height
    const DW = PW - 2 * M - 6, DH = PH - 2 * M - TB - 6;   // the drawing area
    const pdf = new PdfWriter();
    const pages = this.pdfPageList().filter(x => o.pages.includes(x.key));
    const date = fmtDate(Date.now(), false);
    let n = 0;
    const pickScale = (wm, hm) => {
      if (o.scale && o.scale !== 'auto') return +o.scale;
      for (const sc of PLAN_SCALES.slice(1)) if (wm * 1000 / sc <= DW && hm * 1000 / sc <= DH) return sc;
      return 500;
    };
    for (const pg of pages) {
      n++;
      if (onProgress) onProgress(n, pages.length, pg.label);
      const c = pdf.page(PW, PH);
      let scale = 100, title = pg.label, north = false;
      if (pg.kind === 'plan' || pg.kind === 'site') {
        const st = pg.kind === 'site' ? lowestStorey(p) : pg.st;
        let bb = this.storeyBBox([ver.plan], st, false) || { minX: 0, minY: 0, maxX: 10, maxY: 10 };
        if (pg.kind === 'site') bb = bboxOfPoints(p.site.plot.concat([[bb.minX, bb.minY], [bb.maxX, bb.maxY]]));
        const pad = pg.kind === 'site' ? 2 : 1.6;   // room for the dimension lines
        scale = pickScale(bb.maxX - bb.minX + pad * 2, bb.maxY - bb.minY + pad * 2);
        const cv = await this.planPicture(st, DW, DH, scale, { bbox: bb, dims: pg.kind === 'plan' && o.dims !== false, furniture: pg.kind === 'plan' && o.furniture, installs: pg.kind === 'plan' && o.installs, colour: o.colour, garden: pg.kind === 'site' });
        c.image(await canvasJpeg(cv), cv.width, cv.height, M + 3, M + 3, DW, DH);
        north = !!p.site;
        title = pg.kind === 'site' ? t('Plot and garden') : t('Floor plan') + ' ' + st.name;
      } else {
        // a façade or a section: the drawing without its own title, at a true scale
        const d0 = this.makeDrawing(pg.item, { style: o.colour ? 'colour' : 'lines', pos: 0.5, bare: true, maxW: 2600, maxH: 1700 });
        if (d0) {
          scale = pickScale(d0.widthM, d0.heightM);
          const wmm = d0.widthM * 1000 / scale, hmm = d0.heightM * 1000 / scale;
          c.image(await canvasJpeg(d0.canvas), d0.canvas.width, d0.canvas.height, M + 3 + (DW - wmm) / 2, M + 3 + (DH - hmm) / 2, wmm, hmm);
        }
        title = pg.item.title + (pg.item.sub && pg.item.kind === 'side' ? ' (' + pg.item.sub + ')' : '');
      }
      // frame and title block
      c.rect(M, M, PW - 2 * M, PH - 2 * M, { w: 0.5 });
      const ty = PH - M - TB;
      c.line(M, ty, PW - M, ty, 0.35);
      const colX = [M + 4, M + (PW - 2 * M) * 0.48, M + (PW - 2 * M) * 0.72];
      c.text(title, colX[0], ty + 9, 13, { bold: true });
      c.text(p.name + ' · ' + ver.name, colX[0], ty + 16, 8.5, { color: [0.3, 0.35, 0.37] });
      c.text(t('Scale') + ' 1:' + scale + ' (' + (o.paper || 'A3') + ')', colX[1], ty + 9, 10, { bold: true });
      c.text(t('Print at 100 %, not "fit to page".'), colX[1], ty + 16, 7.5, { color: [0.3, 0.35, 0.37] });
      c.text(date, colX[2], ty + 9, 10);
      c.text(t('Page {a} of {b}', { a: n, b: pages.length }) + ' · House Planner', colX[2], ty + 16, 7.5, { color: [0.3, 0.35, 0.37] });
      // scale bar: 5 m (or 10 m at 1:200 and smaller)
      const L = scale >= 200 ? 10 : scale <= 20 ? 2 : 5, step = L / 5, mmPerM = 1000 / scale;
      const sx = PW - M - 6 - L * mmPerM, sy = ty - 6;
      for (let i = 0; i < 5; i++) c.rect(sx + i * step * mmPerM, sy, step * mmPerM, 1.6, { fill: i % 2 ? [1, 1, 1] : [0.1, 0.1, 0.1], w: 0.2 });
      for (let i = 0; i <= 5; i++) c.text(String(+(i * step).toFixed(1)), sx + i * step * mmPerM, sy - 1.2, 6.5, { align: 'center' });
      c.text('m', sx + L * mmPerM + 2.5, sy + 1.6, 6.5);
      // north
      if (north) {
        const nd = planDir(p.site, 0), cx = M + 14, cy = ty - 14;
        c.poly([[cx + nd[0] * 7, cy + nd[1] * 7], [cx - nd[1] * 2.6 - nd[0] * 4, cy + nd[0] * 2.6 - nd[1] * 4], [cx - nd[0] * 2, cy - nd[1] * 2], [cx + nd[1] * 2.6 - nd[0] * 4, cy - nd[0] * 2.6 - nd[1] * 4]], { fill: [0.1, 0.1, 0.1] });
        c.text('N', cx + nd[0] * 10, cy + nd[1] * 10 + 1.2, 8, { bold: true, align: 'center' });
      }
      await new Promise(res => setTimeout(res, 0));
    }
    return pdf.blob();
  },

  async plansPdfSheet() {
    const list = this.pdfPageList();
    const st = this._pdfSt || (this._pdfSt = { paper: 'A3', scale: 'auto', dims: true, furniture: false, installs: false, colour: false, off: [] });
    const body = h('div', { class: 'pdfplans' });
    const pageBox = h('div', { class: 'pdf-pages' });
    for (const it of list) {
      const cb = h('input', { type: 'checkbox', 'data-k': it.key, checked: st.off.includes(it.key) ? false : it.on });
      cb.addEventListener('change', () => { st.off = st.off.filter(k => k !== it.key); if (!cb.checked) st.off.push(it.key); });
      pageBox.appendChild(h('label', { class: 'check' }, cb, h('span', null, it.label)));
    }
    const seg = (id, items, key) => h('div', { class: 'seg', id }, ...items.map(([k, l]) => { const b = h('button', { 'data-k': String(k), 'aria-pressed': String(String(st[key]) === String(k)), onclick: () => { st[key] = k; for (const x of b.parentNode.children) x.setAttribute('aria-pressed', String(x === b)); } }, l); return b; }));
    const opt = (key, label) => { const cb = h('input', { type: 'checkbox', id: 'pdf-' + key, checked: !!st[key] }); cb.addEventListener('change', () => { st[key] = cb.checked; }); return h('label', { class: 'check' }, cb, h('span', null, label)); };
    const status = h('p', { class: 'note-muted', id: 'pdf-status' }, t('Plans are drawn at the largest scale that fits (1:50, 1:100 or 1:200); you can also choose one.'));
    const make = h('button', { class: 'btn primary', id: 'pdf-make' }, icon('download'), t('Make the PDF'));
    make.onclick = async () => {
      const keys = [...pageBox.querySelectorAll('input:checked')].map(x => x.dataset.k);
      if (!keys.length) { status.textContent = t('Pick at least one page.'); return; }
      make.disabled = true;
      try {
        const blob = await this.buildPlansPdf({ ...st, pages: keys }, (i, nn, lab) => { status.textContent = t('Page {a} of {b}: {l} …', { a: i, b: nn, l: lab }); });
        this._lastPdf = blob;
        this.downloadBlob(`${slugify(this.project.name)}_${t('plans')}_${todayStamp()}.pdf`, blob);
        status.textContent = t('Ready: {n} pages, {s}.', { n: keys.length, s: (blob.size / 1048576).toFixed(1).replace('.', ',') + ' MB' });
      } catch (e) { console.error(e); status.textContent = t('The PDF could not be made.'); }
      finally { make.disabled = false; this.dropDrawingView(); }
    };
    body.append(
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Pages')), pageBox),
      h('div', { class: 'field-row' }, h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Paper (landscape)')), seg('pdf-paper', [['A4', 'A4'], ['A3', 'A3']], 'paper')),
        h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Scale')), seg('pdf-scale', [['auto', t('Largest that fits')], [50, '1:50'], [100, '1:100'], [200, '1:200']], 'scale'))),
      h('div', { class: 'pdf-opts' }, opt('dims', t('Dimensions')), opt('furniture', t('Furniture')), opt('installs', t('Electrics')), opt('colour', t('Colours'))),
      status, h('div', { class: 'actions' }, make));
    await UI.dialog({ title: t('Plans as PDF, to scale'), body, wide: true, enterKey: false, actions: [] });
    this.dropDrawingView();
    this.refreshViews(false);
  },
});
