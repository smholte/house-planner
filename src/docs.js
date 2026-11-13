/* ───────────── docs.js — the house's documents: PDFs and pictures kept with the house ─────────────
   The builder's drawings, the meerwerk list, quotes, photos of samples … are kept in the house itself (project.docs),
   so they go along with its backups, copies and merges. Each document is one stored file (Assets: a PDF as it is,
   kind 'doc'; a picture as a JPEG of at most 3200 px) and a small picture of its first page (thumb).
   The viewer shows a PDF page by page (pdf.js, built into the app, no internet needed) or the picture: zoom with the
   wheel, two fingers or + / −, drag to move, swipe (or ← →) for the next page, turn it a quarter (kept with the
   document). A page can belong to a storey: the storey's details then show it, and it can become the storey's
   drawing to trace over.
   project.docs: [{ id, name, file, type: 'pdf' | 'image', asset, thumb, pages, size, added, rot, storeys: { storeyId: [pages] } }]
   A copy for viewing (family, suppliers) leaves the documents at home. */

const DOC_MAX_MB = 60;
const DOC_IMG_MAX = 3200;
const DOC_THUMB = 360;

function docMeta(d) {
  const what = d.type === 'pdf' ? 'PDF · ' + t(d.pages === 1 ? '1 page' : '{n} pages', { n: d.pages || 1 }) : t('Picture');
  return [what, d.size ? fmtBytes(d.size) : '', d.added ? fmtDate(d.added, false) : ''].filter(Boolean).join(' · ');
}
/** the bytes of a stored file (a data URL) */
function docBytes(url) { return b64ToBytes(url.slice(url.indexOf(',') + 1)); }
/** the pages of a document that show a storey (a number in older data) */
const docPagesOf = (d, sid) => [].concat((d.storeys || {})[sid] || []).filter(n => n > 0);
/** the documents' pages that belong to a storey: [{ doc, page }] */
function docsOfStorey(p, sid) {
  const out = [];
  for (const d of (p && p.docs) || []) for (const pg of docPagesOf(d, sid)) out.push({ doc: d, page: pg });
  return out;
}

Object.assign(app, {
  /* ───────── the list ───────── */
  async documentsSheet() {
    const p = this.project;
    if (!p) return;
    await Assets.ensure((p.docs || []).map(d => d.thumb).filter(Boolean));
    const ro = !!p.viewer;
    const body = h('div', { class: 'docs-body', id: 'docs-body' });
    let close = null;
    const paint = () => {
      body.textContent = '';
      const docs = p.docs || [];
      if (!ro) body.appendChild(h('div', { class: 'docs-top' },
        h('button', { class: 'btn primary sm', id: 'docs-add', onclick: async () => { if (await this.addDocuments()) { await Assets.ensure((p.docs || []).map(d => d.thumb).filter(Boolean)); paint(); } } }, icon('plus'), t('Add a PDF or picture')),
        h('span', { class: 'note-muted' }, t('Kept in this house: in its backups and copies.'))));
      if (!docs.length) {
        body.appendChild(h('p', { class: 'note-muted', id: 'docs-empty' }, ro ? t('No documents in this copy.') : t('No documents yet. Add the builder’s drawings, the extra work list, quotes or photos – they stay with the house.')));
        return;
      }
      const grid = h('div', { class: 'docs-grid', id: 'docs-grid' });
      for (const d of docs) {
        const th = d.thumb && Assets.get(d.thumb);
        const links = sortedStoreys(p).filter(st => docPagesOf(d, st.id).length).map(st => st.name + ' · ' + docPagesOf(d, st.id).map(pg => t('p. {n}', { n: pg })).join(', '));
        grid.appendChild(h('button', { class: 'doc-card', 'data-doc': d.id, title: d.name, onclick: () => { if (close) close(null); this.docViewer(d.id, null, { back: () => this.documentsSheet() }); } },
          h('span', { class: 'doc-th' }, th ? h('img', { src: th.url, alt: '' }) : icon(d.type === 'pdf' ? 'doc' : 'image')),
          h('span', { class: 'doc-name', translate: 'no' }, d.name),
          h('span', { class: 'doc-meta' }, docMeta(d)),
          links.length ? h('span', { class: 'doc-links' }, icon('layers'), h('span', { translate: 'no' }, links.join(', '))) : null));
      }
      body.appendChild(grid);
      const total = docs.reduce((s2, d) => s2 + (d.size || 0), 0);
      body.appendChild(h('p', { class: 'note-muted' }, docs.length === 1 ? t('1 document, {s}.', { s: fmtBytes(total) }) : t('{n} documents, {s} together.', { n: docs.length, s: fmtBytes(total) })));
    };
    paint();
    UI.dialog({ title: t('Documents'), body, wide: true, onOpen: (dlg, c) => { close = c; dlg.classList.add('docs-dialog'); }, actions: [{ label: t('Done'), value: null, kind: 'primary' }] });
  },

  /** pick PDFs and pictures and keep them with the house; the number added */
  async addDocuments(files) {
    if (!this.project || this.project.viewer) return 0;
    files = files || await pickFiles('application/pdf,.pdf,image/*');
    if (!files || !files.length) return 0;
    const busy = UI.busy(t('Adding…'));
    const added = [];
    try {
      for (const f of files) {
        busy.set(t('Adding {n}…', { n: f.name }));
        try { added.push(await this.makeDocument(f)); }
        catch (e) { console.error(e); this.toast(t('“{n}” could not be added: {e}', { n: f.name, e: (e && e.message) || e }), { ms: 7000 }); }
      }
    } finally { busy.close(); }
    if (!added.length) return 0;
    this.mutate(proj => { proj.docs = proj.docs || []; proj.docs.push(...added); }, { project: true, keepInspector: true });
    this.toast(added.length === 1 ? t('“{n}” added to the documents.', { n: added[0].name }) : t('{n} documents added.', { n: added.length }));
    return added.length;
  },

  /** one file → a document: the file stored, its first page as a small picture */
  async makeDocument(file) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf && !/^image\//.test(file.type || '') && !/\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(file.name)) throw new Error(t('only PDF files and pictures'));
    if (file.size > DOC_MAX_MB * 1024 * 1024) throw new Error(t('larger than {n} MB', { n: DOC_MAX_MB }));
    const d = { id: uid('doc_'), name: file.name.replace(/\.[a-z0-9]{2,5}$/i, '') || t('Document'), file: file.name, type: isPdf ? 'pdf' : 'image', added: Date.now(), storeys: {}, rot: 0 };
    if (isPdf) {
      const bytes = new Uint8Array(await readFileAs(file, 'buffer'));
      const lib = await this.loadPdfJs();
      const pdf = await lib.getDocument({ data: bytes.slice() }).promise;
      try {
        d.pages = pdf.numPages;
        d.thumb = await this.docThumbOfPage(pdf, 1, 0);
      } finally { pdf.destroy(); }
      let url = await readFileAs(file, 'dataurl');
      url = 'data:application/pdf;base64,' + url.slice(url.indexOf(',') + 1);
      d.asset = uid('as_');
      await Assets.putRecord({ id: d.asset, kind: 'doc', dataUrl: url, w: 0, h: 0, created: Date.now() });
      d.size = bytes.length;
    } else {
      const img = await loadImage(await readFileAs(file, 'dataurl'));
      const W = img.naturalWidth, H = img.naturalHeight, k = Math.min(1, DOC_IMG_MAX / Math.max(W, H));
      const cw = Math.round(W * k), ch = Math.round(H * k);
      const cv = makeCanvas(cw, ch), g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(img, 0, 0, cw, ch);
      const url = cv.toDataURL('image/jpeg', 0.88);
      d.asset = await Assets.put(url, cw, ch);
      d.pages = 1; d.size = Math.round((url.length - url.indexOf(',') - 1) * 0.75);
      const kt = Math.min(1, DOC_THUMB / Math.max(cw, ch)), tw = Math.max(1, Math.round(cw * kt)), tht = Math.max(1, Math.round(ch * kt));
      const tc = makeCanvas(tw, tht); tc.getContext('2d').drawImage(cv, 0, 0, tw, tht);
      d.thumb = await Assets.put(tc.toDataURL('image/jpeg', 0.8), tw, tht);
    }
    return d;
  },
  async docThumbOfPage(pdf, n, rot) {
    const page = await pdf.getPage(n);
    const v1 = page.getViewport({ scale: 1, rotation: ((page.rotate || 0) + (rot || 0)) % 360 });
    const k = DOC_THUMB / Math.max(v1.width, v1.height);
    const vp = page.getViewport({ scale: k, rotation: ((page.rotate || 0) + (rot || 0)) % 360 });
    const cv = makeCanvas(Math.max(1, Math.round(vp.width)), Math.max(1, Math.round(vp.height))), g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    return Assets.put(cv.toDataURL('image/jpeg', 0.8), cv.width, cv.height);
  },
  /** an open PDF of a document (kept while the viewer is open) */
  async docPdf(d) {
    const c = this._docPdf;
    if (c && c.id === d.id && c.asset === d.asset) return c.pdf;
    if (c) { try { c.pdf.destroy(); } catch (e) { /* gone */ } this._docPdf = null; }
    await Assets.ensure([d.asset]);
    const a = Assets.get(d.asset);
    if (!a || !a.url) throw new Error(t('This document’s file is not on this device.'));
    const lib = await this.loadPdfJs();
    const pdf = await lib.getDocument({ data: docBytes(a.url) }).promise;
    this._docPdf = { id: d.id, asset: d.asset, pdf };
    return pdf;
  },
  docClosePdf() { if (this._docPdf) { try { this._docPdf.pdf.destroy(); } catch (e) { /* gone */ } this._docPdf = null; } },

  /* ───────── the viewer ───────── */
  async docViewer(id, page, opts = {}) {
    const p = this.project;
    const d = p && (p.docs || []).find(x => x.id === id);
    if (!d) return;
    document.querySelectorAll('.docview').forEach(el => el.closeViewer && el.closeViewer(true));
    await Assets.ensure([d.asset]);
    const a = Assets.get(d.asset);
    if (!a) { this.toast(t('This document’s file is not on this device.')); return; }
    const ro = !!p.viewer;
    const S = { page: clamp(page || 1, 1, d.pages || 1), zoom: 1, tx: 0, ty: 0, pw: 1, ph: 1, fit: 1, res: 0, busy: false, want: false };
    const phone = window.matchMedia('(pointer: coarse)').matches;
    const MAXPIX = phone ? 12e6 : 28e6, MAXSIDE = phone ? 4096 : 8192;
    const canvas = h('canvas', { class: 'dv-canvas', id: 'dv-canvas' });
    const img = d.type === 'image' ? h('img', { class: 'dv-img', id: 'dv-img', src: a.url, alt: d.name, draggable: 'false' }) : null;
    const sheet = h('div', { class: 'dv-sheet' }, img || canvas);
    const stage = h('div', { class: 'dv-stage', id: 'dv-stage', tabindex: '0', 'aria-label': d.name }, sheet, h('div', { class: 'dv-wait', id: 'dv-wait', hidden: true }, h('span', { class: 'spinner' })));
    const pageLbl = h('span', { class: 'dv-page num', id: 'dv-page' });
    const zoomLbl = h('button', { class: 'btn ghost sm dv-zoom num', id: 'dv-zoom', title: t('Fit the page'), onclick: () => fit() });
    const ib = (ic, label, fn, idv) => h('button', { class: 'btn ghost icon sm', title: label, 'aria-label': label, id: idv, onclick: fn }, icon(ic));
    const prev = ib('prev', t('Previous page'), () => go(S.page - 1), 'dv-prev'), next = ib('next', t('Next page'), () => go(S.page + 1), 'dv-next');
    const more = ib('more', t('More'), e => this.docMenu(e.currentTarget, d, S.page, { close: () => close(), refresh: () => { title.textContent = d.name; } }), 'dv-more');
    const title = h('b', { translate: 'no' }, d.name);
    const multi = (d.pages || 1) > 1;
    const bar = h('div', { class: 'dv-bar' },
      h('button', { class: 'btn ghost icon', id: 'dv-close', 'aria-label': opts.back ? t('Back to the documents') : t('Close'), title: opts.back ? t('Back to the documents') : t('Close'), onclick: () => close() }, icon(opts.back ? 'back' : 'close')),
      h('div', { class: 'dv-title' }, title, h('span', { class: 'dv-meta' }, docMeta(d))),
      h('div', { class: 'dv-tools' },
        multi ? prev : null, multi ? pageLbl : null, multi ? next : null, multi ? h('span', { class: 'dv-sep' }) : null,
        ib('minus', t('Zoom out'), () => zoomBy(1 / 1.4), 'dv-out'), zoomLbl, ib('plus', t('Zoom in'), () => zoomBy(1.4), 'dv-in'),
        ib('rotate', t('Turn a quarter'), () => turn(), 'dv-rot'),
        ib('download', t('Save a copy'), () => this.docSaveCopy(d), 'dv-save'),
        ro ? null : more));
    const view = h('div', { class: 'docview', role: 'dialog', 'aria-modal': 'true', 'aria-label': d.name, 'data-doc': d.id }, bar, stage);
    $('#sheet-root').appendChild(view);
    stage.focus();
    let task = null, timer = null, closed = false;
    const rotation = pg => (((pg && pg.rotate) || 0) + (d.rot || 0)) % 360;
    const place = () => {
      const s2 = S.fit * S.zoom;
      sheet.style.width = (S.pw * s2).toFixed(1) + 'px'; sheet.style.height = (S.ph * s2).toFixed(1) + 'px';
      // keep part of the page in view
      const W = stage.clientWidth, H = stage.clientHeight, w = S.pw * s2, hh = S.ph * s2;
      const mx = Math.max(0, (w - W) / 2) + W * 0.35, my = Math.max(0, (hh - H) / 2) + H * 0.35;
      S.tx = clamp(S.tx, -mx, mx); S.ty = clamp(S.ty, -my, my);
      sheet.style.transform = `translate(${(S.tx - w / 2).toFixed(1)}px, ${(S.ty - hh / 2).toFixed(1)}px)`;
      zoomLbl.textContent = Math.round(S.zoom * 100) + '%';
      pageLbl.textContent = S.page + ' / ' + (d.pages || 1);
      prev.disabled = S.page <= 1; next.disabled = S.page >= (d.pages || 1);
      if (img) {
        const q = (d.rot || 0) % 180 !== 0;
        img.style.width = (q ? hh : w).toFixed(1) + 'px'; img.style.height = (q ? w : hh).toFixed(1) + 'px';
        img.style.transform = `translate(-50%, -50%) rotate(${d.rot || 0}deg)`;
      }
    };
    // the page drawn sharp for the zoom it is shown at (a little later while zooming)
    const render = async () => {
      if (closed || !d.asset || d.type !== 'pdf') return;
      if (S.busy) { S.want = true; return; }
      S.busy = true; S.want = false;
      const wait = stage.querySelector('#dv-wait');
      const slow = setTimeout(() => { if (wait) wait.hidden = false; }, 250);
      // (the page this drawing is of: turned to another one meanwhile, that one is drawn next)
      const page = S.page;
      try {
        const pdf = await this.docPdf(d), pg = await pdf.getPage(page);
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        let k = S.fit * S.zoom * dpr;
        k = Math.min(k, MAXSIDE / Math.max(S.pw, S.ph), Math.sqrt(MAXPIX / (S.pw * S.ph)));
        if (canvas.dataset.page === String(page) && Math.abs(k - S.res) / Math.max(k, 1e-6) < 0.12 && canvas.width) return;
        const vp = pg.getViewport({ scale: k, rotation: rotation(pg) });
        const off = makeCanvas(Math.max(1, Math.floor(vp.width)), Math.max(1, Math.floor(vp.height))), g = off.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, off.width, off.height);
        if (task) { try { task.cancel(); } catch (e) { /* done */ } }
        task = pg.render({ canvasContext: g, viewport: vp });
        await task.promise; task = null;
        if (closed) return;
        if (S.page !== page) { S.want = true; return; }
        canvas.width = off.width; canvas.height = off.height;
        canvas.getContext('2d').drawImage(off, 0, 0);
        S.res = k;
        canvas.dataset.page = String(page); canvas.dataset.k = k.toFixed(3);
      } catch (e) { if (!e || e.name !== 'RenderingCancelledException') { console.warn('doc render', e); } }
      finally { clearTimeout(slow); if (wait) wait.hidden = true; S.busy = false; if (S.want && !closed) render(); }
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(render, 160); };
    const measure = async () => {
      if (d.type === 'pdf') {
        const pdf = await this.docPdf(d), pg = await pdf.getPage(S.page), v1 = pg.getViewport({ scale: 1, rotation: rotation(pg) });
        S.pw = v1.width; S.ph = v1.height;
      } else {
        const q = (d.rot || 0) % 180 !== 0, w0 = img.naturalWidth || 1, h0 = img.naturalHeight || 1;
        S.pw = q ? h0 : w0; S.ph = q ? w0 : h0;
      }
      const W = stage.clientWidth || 600, H = stage.clientHeight || 400;
      S.fit = Math.min((W - 16) / S.pw, (H - 16) / S.ph);
    };
    const fit = () => { S.zoom = 1; S.tx = 0; S.ty = 0; place(); later(); };
    const go = async n => {
      n = clamp(n, 1, d.pages || 1);
      if (n === S.page && canvas.width) return;
      S.page = n; S.res = 0; S.zoom = 1; S.tx = 0; S.ty = 0;
      try { await measure(); } catch (e) { this.toast((e && e.message) || String(e)); return; }
      place(); render();
    };
    /** zoom by k around a point of the stage (screen px from its middle) */
    const zoomAt = (k, cx = 0, cy = 0) => {
      const z = clamp(S.zoom * k, 0.25, 24);
      k = z / S.zoom;
      S.tx = cx - (cx - S.tx) * k; S.ty = cy - (cy - S.ty) * k; S.zoom = z;
      place(); later();
    };
    const zoomBy = k => zoomAt(k);
    const turn = async () => {
      d.rot = ((d.rot || 0) + 90) % 360;
      if (!ro) Saver.markDirty();
      S.res = 0; S.zoom = 1; S.tx = 0; S.ty = 0;
      await measure(); place(); render();
      // the small picture in the list turns along
      if (d.type === 'pdf' && !ro) { try { const pdf = await this.docPdf(d); d.thumb = await this.docThumbOfPage(pdf, 1, d.rot); Saver.markDirty(); } catch (e) { /* keep the old one */ } }
    };
    // gestures: drag to move, two fingers to zoom, the wheel to zoom where the pointer is, a double tap to zoom in / fit;
    // at the page's full size a swipe turns the page
    const ptrs = new Map();
    let g0 = null, lastTap = 0;
    const local = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
    stage.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* (a pointer the browser has already let go) */ }
      ptrs.set(e.pointerId, local(e));
      if (ptrs.size === 1) {
        const now = Date.now(), q = local(e);
        if (now - lastTap < 320) { if (S.zoom > 1.05) fit(); else zoomAt(2.5, q[0], q[1]); lastTap = 0; g0 = null; return; }
        lastTap = now;
        g0 = { kind: 'pan', p: q, tx: S.tx, ty: S.ty, zoom: S.zoom };
      } else if (ptrs.size === 2) {
        const [a2, b2] = [...ptrs.values()];
        g0 = { kind: 'pinch', d: Math.hypot(a2[0] - b2[0], a2[1] - b2[1]) || 1, m: [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2], zoom: S.zoom, tx: S.tx, ty: S.ty };
      }
    });
    stage.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId) || !g0) return;
      ptrs.set(e.pointerId, local(e));
      if (g0.kind === 'pan' && ptrs.size === 1) {
        const q = ptrs.get(e.pointerId);
        S.tx = g0.tx + q[0] - g0.p[0]; S.ty = g0.ty + q[1] - g0.p[1]; place();
      } else if (g0.kind === 'pinch' && ptrs.size >= 2) {
        const [a2, b2] = [...ptrs.values()];
        const dd = Math.hypot(a2[0] - b2[0], a2[1] - b2[1]) || 1, m = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2];
        const z = clamp(g0.zoom * dd / g0.d, 0.25, 24), k = z / g0.zoom;
        S.zoom = z; S.tx = m[0] - (g0.m[0] - g0.tx) * k; S.ty = m[1] - (g0.m[1] - g0.ty) * k;
        place();
      }
    });
    const up = e => {
      if (!ptrs.has(e.pointerId)) return;
      const q = ptrs.get(e.pointerId);
      ptrs.delete(e.pointerId);
      if (g0 && g0.kind === 'pan' && g0.zoom <= 1.02 && multi) {
        const dx = q[0] - g0.p[0], dy = q[1] - g0.p[1];
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { go(S.page + (dx < 0 ? 1 : -1)); g0 = null; return; }
        if (S.zoom <= 1.02) { S.tx = 0; S.ty = 0; place(); }
      }
      if (g0 && g0.kind === 'pinch') { later(); g0 = ptrs.size === 1 ? { kind: 'pan', p: [...ptrs.values()][0], tx: S.tx, ty: S.ty, zoom: S.zoom } : null; return; }
      if (!ptrs.size) g0 = null;
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      const q = local(e);
      if (e.ctrlKey || !e.shiftKey) zoomAt(Math.exp(-clamp(e.deltaY, -120, 120) * (e.ctrlKey ? 0.01 : 0.0022)), q[0], q[1]);
      else { S.tx -= e.deltaY; place(); }
    }, { passive: false });
    const key = e => {
      if (view.parentNode && view.parentNode.lastElementChild !== view) return;   // a dialog on top answers its own keys
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
      if (document.querySelector('body > .menu')) return;
      const k = e.key;
      if (k === 'Escape') { e.stopPropagation(); close(); }
      else if (k === 'ArrowRight' || k === 'PageDown') go(S.page + 1);
      else if (k === 'ArrowLeft' || k === 'PageUp') go(S.page - 1);
      else if (k === 'Home') go(1);
      else if (k === 'End') go(d.pages || 1);
      else if (k === '+' || k === '=') zoomBy(1.4);
      else if (k === '-' || k === '_') zoomBy(1 / 1.4);
      else if (k === '0') fit();
      else if (k === 'r' || k === 'R') turn();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', key, true);
    const onResize = async () => { try { await measure(); place(); later(); } catch (e) { /* closed */ } };
    window.addEventListener('resize', onResize);
    const close = quiet => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      if (task) { try { task.cancel(); } catch (e) { /* done */ } }
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', onResize);
      view.remove();
      this.docClosePdf();
      if (!quiet && opts.back) opts.back();
    };
    view.closeViewer = close;
    view.docState = S;
    view.docGo = go;
    try { if (img && !img.complete) await new Promise(r => { img.onload = r; img.onerror = r; }); await measure(); }
    catch (e) { console.error(e); this.toast(t('This document could not be opened: {e}', { e: (e && e.message) || e }), { ms: 7000 }); close(true); return; }
    place(); render();
    return view;
  },

  /** the viewer's ⋯: rename, the storey this page belongs to, use it as a storey's drawing, delete */
  docMenu(anchor, d, page, o) {
    const p = this.project;
    const pgTxt = (d.pages || 1) > 1 ? ' (' + t('p. {n}', { n: page }) + ')' : '';
    UI.menu(anchor, [
      { label: t('Rename…'), icon: 'edit', fn: async () => {
        const v = await UI.prompt({ title: t('Rename document'), label: t('Name'), value: d.name });
        if (v == null || !v.trim()) return;
        this.mutate(proj => { const x = (proj.docs || []).find(y => y.id === d.id); if (x) x.name = v.trim(); }, { project: true, keepInspector: true });
        d.name = v.trim(); o.refresh();
      } },
      { label: t('This page belongs to a storey…') + pgTxt, icon: 'layers', fn: () => this.docStoreyDialog(d, page) },
      { label: t('Use this page as a storey’s drawing…') + pgTxt, icon: 'image', fn: () => this.docAsDrawing(d, page) },
      '-',
      { label: t('Delete document'), icon: 'trash', danger: true, fn: async () => {
        const ok = await UI.confirm({ title: t('Delete “{n}”?', { n: d.name }), message: t('It is taken out of this house (its backups made before keep it). Undo brings it back.'), confirmLabel: t('Delete'), danger: true });
        if (!ok) return;
        o.close();
        this.mutate(proj => { proj.docs = (proj.docs || []).filter(x => x.id !== d.id); }, { project: true, keepInspector: true });
        this.toast(t('Document deleted.'));
      } },
    ].filter(Boolean));
    void p;
  },
  /** which storey a page shows (a page per storey; a storey can have pages of several documents) */
  async docStoreyDialog(d, page) {
    const p = this.project;
    const sts = sortedStoreys(p);
    const cur = sts.filter(s2 => docPagesOf(d, s2.id).includes(page)).map(s2 => s2.id);
    const sel = h('select', { class: 'select', id: 'f-doc-storey' }, h('option', { value: '' }, t('No storey')), ...sts.map(s2 => h('option', { value: s2.id, selected: cur.includes(s2.id) }, s2.name)));
    const body = h('div', null, h('div', { class: 'field' }, h('label', { for: 'f-doc-storey' }, t('Page {n} shows', { n: page })), sel),
      h('p', { class: 'note-muted' }, t('The storey’s details then show this page, one tap away.')));
    const v = await UI.dialog({ title: t('This page belongs to a storey'), body, actions: [{ label: t('Cancel'), value: null }, { label: t('Save'), kind: 'primary', value: () => sel.value || '-' }] });
    if (v == null) return;
    this.mutate(proj => {
      const x = (proj.docs || []).find(y => y.id === d.id);
      if (!x) return;
      const S = {};
      for (const s2 of sts) { const l = docPagesOf(x, s2.id).filter(n => n !== page); if (s2.id === v) l.push(page); if (l.length) S[s2.id] = l.sort((a, b) => a - b); }
      x.storeys = S;
      d.storeys = clone(S);
    }, { project: true, keepInspector: false });
    this.toast(v === '-' ? t('The page belongs to no storey now.') : t('Page {n} belongs to {s}.', { n: page, s: (getStorey(p, v) || {}).name || '' }));
  },
  /** a page of a document as the drawing to trace over on a storey (Build → the storey's details) */
  async docAsDrawing(d, page, storeyId) {
    const p = this.project;
    let sid = storeyId;
    if (!sid) {
      const sts = sortedStoreys(p);
      const pre = sts.find(s2 => docPagesOf(d, s2.id).includes(page));
      const sel = h('select', { class: 'select', id: 'f-doc-draw-storey' }, ...sts.map(s2 => h('option', { value: s2.id, selected: pre ? pre.id === s2.id : this.view.storeyId === s2.id }, s2.name)));
      const body = h('div', null, h('div', { class: 'field' }, h('label', { for: 'f-doc-draw-storey' }, t('Storey')), sel),
        h('p', { class: 'note-muted' }, t('Shown under the plan of that storey in Build, to trace over; set its scale with two points of a known distance.')));
      sid = await UI.dialog({ title: t('Use this page as a storey’s drawing'), body, actions: [{ label: t('Cancel'), value: null }, { label: t('Use it'), kind: 'primary', value: () => sel.value }] });
      if (!sid) return;
    }
    const busy = UI.busy(t('Reading the PDF…'));
    let im;
    try {
      if (d.type === 'pdf') {
        const pdf = await this.docPdf(d), pg = await pdf.getPage(page);
        const rot = (((pg.rotate || 0) + (d.rot || 0)) % 360);
        const v1 = pg.getViewport({ scale: 1, rotation: rot });
        const k = Math.min(4096 / Math.max(v1.width, v1.height), 6);
        const vp = pg.getViewport({ scale: k, rotation: rot });
        const cv = makeCanvas(Math.round(vp.width), Math.round(vp.height)), g = cv.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
        await pg.render({ canvasContext: g, viewport: vp }).promise;
        im = { dataUrl: cv.toDataURL('image/jpeg', 0.86), w: cv.width, h: cv.height };
        if (!document.querySelector('.docview')) this.docClosePdf();
      } else {
        await Assets.ensure([d.asset]);
        const a = Assets.get(d.asset), img = await loadImage(a.url);
        im = this.downscale(img, img.naturalWidth, img.naturalHeight);
      }
    } catch (e) { console.error(e); busy.close(); this.toast(t('This document could not be opened: {e}', { e: (e && e.message) || e })); return; }
    busy.close();
    document.querySelectorAll('.docview').forEach(el => el.closeViewer && el.closeViewer(true));
    if (this.mode !== 'build') this.setMode('build');
    await this.useDrawing(sid, im);
  },
  /** a copy of the document's file: on a phone through the share sheet, else downloaded */
  async docSaveCopy(d) {
    await Assets.ensure([d.asset]);
    const a = Assets.get(d.asset);
    if (!a) { this.toast(t('This document’s file is not on this device.')); return; }
    const type = d.type === 'pdf' ? 'application/pdf' : 'image/jpeg';
    const name = (d.file && d.type === 'pdf' ? d.file : slugify(d.name) + (d.type === 'pdf' ? '.pdf' : '.jpg'));
    const blob = new Blob([docBytes(a.url)], { type });
    if (window.File && navigator.canShare && window.matchMedia('(pointer: coarse)').matches) {
      try { const f = new File([blob], name, { type }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: d.name }); return; } }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    this.downloadBlob(name, blob);
    this.toast(t('Saved: {n}', { n: name }));
  },

  /** the storey's details (Build, 2D): the documents' pages of this storey, and a drawing to trace from a document */
  storeyDocsSection(el, st) {
    const p = this.project;
    const list = docsOfStorey(p, st.id);
    const docs = (p.docs || []);
    if (!list.length && !docs.length) return;
    const sec = h('div', { class: 'insp-sec docs-sec', id: 'storey-docs' }, h('div', { class: 'eyebrow' }, t('Documents'), h('button', { class: 'btn ghost sm', onclick: () => this.documentsSheet() }, t('All documents'))));
    if (list.length) sec.appendChild(h('div', { class: 'chips' }, ...list.map(({ doc, page }) => h('button', { class: 'chip doc-chip', 'data-doc': doc.id, onclick: () => this.docViewer(doc.id, page) }, icon(doc.type === 'pdf' ? 'doc' : 'image'), h('span', { translate: 'no' }, doc.name + ((doc.pages || 1) > 1 ? ' · ' + t('p. {n}', { n: page }) : ''))))));
    else sec.appendChild(h('p', { class: 'note-muted' }, t('No page of a document belongs to this storey yet (in the document: ⋯ → This page belongs to a storey).')));
    el.appendChild(sec);
  },
  /** a picture as the drawing of a storey (the end of Load drawing, also from a document) */
  async useDrawing(storeyId, im) {
    const assetId = await Assets.put(im.dataUrl, im.w, im.h);
    const p = this.project;
    const prev = p.underlays[storeyId];
    const w = im.w;
    this.mutate(proj => {
      proj.underlays[storeyId] = { assetId, x: 0, y: 0, mPerPx: prev ? prev.mPerPx * (prev.w || w) / w : 15 / w, opacity: 0.5, visible: true, calibrated: false, w };
    }, { project: true });
    if (this.view.scope !== 'storey' || this.view.storeyId !== storeyId || this.view.dim !== '2d') {
      this.view = { ...this.view, dim: '2d', scope: 'storey', storeyId };
      this.renderEditorChrome();
      this.setupPanes(true);
    } else this.refreshViews(true);
    this.renderInspector();
    this.calibrate(storeyId, true);
  },
});

/** files kept with a house that the house's own data brings along (the example's documents; the house built into the
 *  app: HOUSE.files): written to this device when they are not here yet */
async function docsEnsureFiles(p) {
  for (const f of [...exampleFiles(p), ...(HOUSE.files ? HOUSE.files(p) : [])]) {
    try { if (!(await DB.get('assets', f.id))) await Assets.putRecord(f); }
    catch (e) { console.warn('doc file', e); }
  }
}
/** the files of the example's documents (EXAMPLE_HOUSE.files: { asset id: { type, b64, w, h } }) that a document of
 *  this house still refers to */
function exampleFiles(p) {
  const F = typeof EXAMPLE_HOUSE !== 'undefined' && EXAMPLE_HOUSE.files;
  if (!F || !p.example) return [];
  const out = [];
  for (const d of p.docs || []) for (const id of [d.asset, d.thumb]) {
    const f = id && F[id];
    if (f && !out.some(x => x.id === id)) out.push({ id, ...(id === d.asset ? { kind: 'doc' } : {}), get dataUrl() { return 'data:' + f.type + ';base64,' + f.b64; }, w: f.w || 0, h: f.h || 0, created: Date.now() });
  }
  return out;
}
