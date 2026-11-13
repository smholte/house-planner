/* ───────── Drawings: the four façades (gevelaanzichten) and sections (doorsneden) as flat 2D drawings ─────────
   The house is built once more in a hidden 3D view and photographed straight on with a camera without
   perspective, so sizes are true: a scale bar, the floor levels and a title are drawn on. A section cuts the
   house with a plane (across or along at a chosen place, or any slice made in 3D); what is cut is filled dark.
   Two looks: in colour, or as a line drawing. Saved as a picture or printed to scale (1:50 … 1:200). */

const DRAW_SIDES = [
  { id: 'front', name: 'Front', nl: 'voorgevel', look: [0, 0, -1] },
  { id: 'back', name: 'Back', nl: 'achtergevel', look: [0, 0, 1] },
  { id: 'left', name: 'Left side', nl: 'linkerzijgevel', look: [1, 0, 0] },
  { id: 'right', name: 'Right side', nl: 'rechterzijgevel', look: [-1, 0, 0] },
];
const DRAW_PRINT = { w: 277, h: 190 };   // A4 landscape, inside 10 mm margins
const DRAW_SCALES = [50, 100, 200, 250, 500];

/** the size of the house in a group (without furniture); with planes, only of what they keep */
function drawingBox(group, planes) {
  const box = new THREE.Box3(), v = new THREE.Vector3();
  group.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.visible) return;
    for (let a = o; a; a = a.parent) if (a.userData && a.userData.furn) return;
    if (!planes.length) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      return;
    }
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (planes.every(p => p.distanceToPoint(v) >= -0.01)) box.expandByPoint(v);
    }
  });
  return box;
}

Object.assign(app, {
  /** the hidden 3D view the drawings are made with */
  drawingView() {
    if (this._dv && this._dv.ok) return this._dv;
    const host = h('div', { class: 'drawing-host', 'aria-hidden': 'true', style: { position: 'fixed', left: '-12000px', top: '0', width: '640px', height: '480px', pointerEvents: 'none' } });
    document.body.appendChild(host);
    // (not merged: drawings change materials and hide pieces one by one)
    this._dv = new View3D(host, this, { mini: true, noBatch: true });
    this._dv.visible = false;   // it draws only when asked
    this._dvHost = host;
    return this._dv.ok ? this._dv : null;
  },
  dropDrawingView() {
    if (this._dv) { try { this._dv.destroy(); } catch (e) { /* gone already */ } }
    if (this._dvHost) this._dvHost.remove();
    this._dv = null; this._dvHost = null; this._dvSig = null;
  },

  /** build the house (or one storey) in the hidden view; kept while nothing changed */
  drawingScene(storeyId, withCeilings, withGarden) {
    const dv = this.drawingView();
    if (!dv) return null;
    const p = this.project, v = this.shownVersion();
    const sig = [v.id, storeyId || 'house', withCeilings ? 1 : 0, withGarden ? 1 : 0].join('|');
    if (this._dvSig === sig) return dv;
    const storeys = sortedStoreys(p).filter(s => !storeyId || s.id === storeyId);
    const entries = storeys.map(s2 => ({ storey: s2, plan: v.plan, offset: [0, 0], y: storeyId ? 0 : s2.elevation, diff: null, basePlan: v.plan, versionId: v.id, edit: false,
      bbox: this.storeyBBox([v.plan], s2, false), ...this.entryExtras(s2, 'main'), pins: [], paths: null }));
    dv.build({ entries, cut: false, ground: false, mode: 'view', light: 'day', ceilings: !!withCeilings, walk: false, plinth: this.settings.plinth !== false, windows: true, outside: true,
      roof: !storeyId, floors: true, shell: this.shell, origPlan: (getOriginal(p) || {}).plan || null, scope: storeyId ? 'storey' : 'house', sliceKey: '#drawing', homeView: null, labels: false, selection: null, fitKey: 'drawing',
      ...(withGarden && p.site ? { site: p.site, garden: v.plan.garden || null, gardenAt: { offset: [0, 0], y: 0 } } : {}) });
    // the hidden view shares materials with the views on screen: give those back their slices
    for (const pn of this.panes) if (pn.view && pn.view.applyClip && pn.view !== dv) pn.view.applyClip();
    this._dvSig = sig;
    return dv;
  },

  /** the drawings on offer: four façades, two sections that can be moved, and the slices made in 3D */
  drawingList() {
    const list = DRAW_SIDES.map(s => ({ key: s.id, kind: 'side', side: s, label: t(s.name), title: t(s.name + ' elevation'), sub: s.nl }));
    list.push({ key: 'secA', kind: 'sec', axis: 'z', label: t('Section A–A'), title: t('Section A–A'), sub: t('across, seen from the front') });
    list.push({ key: 'secB', kind: 'sec', axis: 'x', label: t('Section B–B'), title: t('Section B–B'), sub: t('lengthwise, seen from the right') });
    const p = this.project;
    for (const [k, sl] of SLICE.sets) {
      const [pid, scope, sid] = k.split('|');
      if (pid !== p.id || scope === 'side' || !sl.length) continue;
      const st = scope === 'storey' ? getStorey(p, sid) : null;
      if (scope === 'storey' && !st) continue;
      for (const s of sl) list.push({ key: 'slice:' + k + ':' + s.id, kind: 'slice', slice: s, storeyId: st ? st.id : null,
        label: t('Slice') + ' ' + s.num + (st ? ' · ' + st.name : ''), title: t('Section') + ' · ' + t('slice') + ' ' + s.num, sub: st ? st.name : t('whole house') });
    }
    return list;
  },

  /** make one drawing: { canvas, ppm (pixels per metre), widthM, heightM } */
  makeDrawing(item, opts = {}) {
    const style = opts.style || 'colour';
    const dv = this.drawingScene(item.kind === 'slice' ? item.storeyId : null, item.kind !== 'side');
    if (!dv) return null;
    dv.group.updateMatrixWorld(true);
    // the house's size (furniture does not make it bigger)
    const box = drawingBox(dv.group, []);
    if (box.isEmpty()) return null;
    let center = box.getCenter(new THREE.Vector3());
    // the camera: which way it looks, and the cutting plane for a section
    let look, planes = [], name = item.title, planeNote = '';
    if (item.kind === 'side') look = new THREE.Vector3(...item.side.look);
    else if (item.kind === 'sec') {
      const f = clamp(opts.pos == null ? 0.5 : opts.pos, 0.02, 0.98);
      if (item.axis === 'z') { const z = box.min.z + (box.max.z - box.min.z) * f; look = new THREE.Vector3(0, 0, -1); planes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), z)]; planeNote = t('cut at {n} from the front').replace('{n}', fmtM(box.max.z - z)); }
      else { const x = box.min.x + (box.max.x - box.min.x) * f; look = new THREE.Vector3(-1, 0, 0); planes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), x)]; planeNote = t('cut at {n} from the right').replace('{n}', fmtM(box.max.x - x)); }
    } else {
      const s = item.slice;
      // look at the cut face: from the side that is cut away, towards what is kept
      look = s.n.clone().normalize();
      planes = [s.plane.clone()];
    }
    // a section is as big as what is left of the house
    if (planes.length) { const kept = drawingBox(dv.group, planes); if (!kept.isEmpty()) { box.copy(kept); center = box.getCenter(new THREE.Vector3()); } }
    const up = Math.abs(look.y) > 0.9 ? new THREE.Vector3(0, 0, look.y > 0 ? 1 : -1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(look, up).normalize();
    up.crossVectors(right, look).normalize();
    // extents on the drawing
    let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity, d0 = Infinity, d1 = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const q = new THREE.Vector3(x, y, z).sub(center);
      r0 = Math.min(r0, q.dot(right)); r1 = Math.max(r1, q.dot(right)); u0 = Math.min(u0, q.dot(up)); u1 = Math.max(u1, q.dot(up)); d0 = Math.min(d0, q.dot(look)); d1 = Math.max(d1, q.dot(look));
    }
    const pad = Math.max(0.6, 0.06 * Math.max(r1 - r0, u1 - u0));
    r0 -= pad; r1 += pad; u0 -= pad; u1 += pad;
    const spanR = r1 - r0, spanU = u1 - u0;
    const ppm = clamp(Math.min(opts.maxW || 1900, Math.floor((opts.maxW || 1900) / spanR), Math.floor((opts.maxH || 1250) / spanU)), 24, 160);
    const W = Math.round(spanR * ppm), H = Math.round(spanU * ppm);
    const cam = new THREE.OrthographicCamera(r0, r1, u1, u0, 0.05, (d1 - d0) + 40);
    cam.position.copy(center).addScaledVector(look, d0 - 20);
    cam.up.copy(up);
    cam.lookAt(center.clone().addScaledVector(look, d0));
    // the camera's centre must be the house's centre on the drawing (left/right are measured from it)
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    // the picture
    const r = dv.renderer;
    const prev = { pr: r.getPixelRatio(), size: r.getSize(new THREE.Vector2()), bg: dv.scene.background, groundVis: dv.ground.visible, onU: SLICE.onU.value };
    const restore = [];
    const mats = new Set();
    dv.group.traverse(o => { if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) mats.add(m); });
    const extra = [];
    try {
      r.setPixelRatio(1);
      r.setSize(W, H, false);
      dv.scene.background = new THREE.Color('#ffffff');
      dv.ground.visible = false;
      if (style === 'lines') {
        // white surfaces, dark edges, cut parts filled dark
        const flat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: planes.length ? planes : null });
        if (planes.length) {
          flat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace(/}\s*$/, '\tif (!gl_FrontFacing) gl_FragColor = vec4(0.22, 0.24, 0.25, 1.0);\n}\n'); };
          flat.customProgramCacheKey = () => 'drawflat';
        }
        const glass = new THREE.MeshBasicMaterial({ color: 0xdfeaf0, toneMapped: false, transparent: true, opacity: 0.55, depthWrite: false, clippingPlanes: planes.length ? planes : null });
        const ink = new THREE.LineBasicMaterial({ color: 0x1f2628, toneMapped: false, clippingPlanes: planes.length ? planes : null });
        const meshes = [];
        dv.group.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
        for (const o of meshes) {
          const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
          const isGlass = m0 && m0.transparent && m0.opacity < 0.9;
          restore.push(() => { o.material = o.userData._m0; delete o.userData._m0; });
          o.userData._m0 = o.material;
          o.material = isGlass ? glass : flat;
          if (isGlass) continue;
          let furn = false;
          for (let a = o; a; a = a.parent) if (a.userData && a.userData.furn) { furn = true; break; }
          const eg = new THREE.EdgesGeometry(o.geometry, furn ? 40 : 28);
          const ls = new THREE.LineSegments(eg, ink);
          o.add(ls);
          extra.push(() => { o.remove(ls); eg.dispose(); });
        }
        extra.push(() => { flat.dispose(); glass.dispose(); ink.dispose(); });
      } else {
        // the real materials, cut by the section plane (back faces in the dark section colour)
        for (const m of mats) {
          const cp = m.clippingPlanes, side = m.side;
          restore.push(() => { m.clippingPlanes = cp; m.side = side; m.needsUpdate = true; });
          m.clippingPlanes = planes.length ? planes : null;
          m.clipShadows = true;
          if (planes.length) capPatch(m, true); else if (m.userData.capPatched) { m.side = m.userData.side0; }
          m.needsUpdate = true;
        }
        SLICE.onU.value = planes.length ? 1 : 0;
      }
      r.shadowMap.needsUpdate = true;
      r.render(dv.scene, cam);
      const gl = r.domElement;
      // the drawing: the picture with a band for the levels on the right and the title and scale below
      const side = 230, foot = opts.bare ? 0 : 118;
      const cv = makeCanvas(W + side, H + foot);
      const g = cv.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(gl, 0, 0, W, H);
      const toPx = q => { const d = q.clone().sub(center); return [(d.dot(right) - r0) * ppm, (u1 - d.dot(up)) * ppm]; };
      const ink2 = '#1f2628', soft = '#5b6669';
      const font = (wgt, px) => `${wgt} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      const vertical = Math.abs(up.y) > 0.9;
      const shownLevels = [];
      if (vertical) {
        // ground floor level (peil) and the floor levels, with the top of the house
        const xr = W - pad * ppm;   // the house's right edge
        const y0 = toPx(new THREE.Vector3(center.x, 0, center.z))[1];
        // the ground line
        g.strokeStyle = ink2; g.lineWidth = 3;
        g.beginPath(); g.moveTo(Math.max(0, (pad * 0.4) * ppm), y0); g.lineTo(W - pad * 0.4 * ppm, y0); g.stroke();
        if (item.kind === 'side') {
          // below the ground: hatched earth (and nothing of the foundations under it)
          g.fillStyle = '#ffffff'; g.fillRect(0, y0 + 1.5, W, H - y0);
          g.save(); g.beginPath(); g.rect(pad * 0.4 * ppm, y0 + 1.5, W - pad * 0.8 * ppm, Math.min(0.35 * ppm, H - y0 - 2)); g.clip();
          g.fillStyle = '#ffffff'; g.fillRect(0, y0 + 1.5, W, H);
          g.strokeStyle = '#9aa3a5'; g.lineWidth = 1;
          for (let x = -H; x < W + H; x += 9) { g.beginPath(); g.moveTo(x, y0 + 1.5); g.lineTo(x + 40, y0 + 41.5); g.stroke(); }
          g.restore();
        }
        const levels = [];
        const storeys = sortedStoreys(this.project).filter(s => !(item.kind === 'slice' && item.storeyId) || s.id === item.storeyId);
        for (const s of storeys) levels.push({ y: item.kind === 'slice' && item.storeyId ? 0 : s.elevation, label: s.name });
        levels.push({ y: box.max.y, label: t('top'), top: true });
        let lastPx = Infinity;
        for (const L of levels.sort((a, b) => a.y - b.y)) {
          const py = toPx(new THREE.Vector3(center.x, L.y, center.z))[1];
          if (Math.abs(py - lastPx) < 18) continue;
          lastPx = py;
          shownLevels.push(+L.y.toFixed(3));
          g.strokeStyle = soft; g.lineWidth = 1; g.setLineDash([6, 4]);
          g.beginPath(); g.moveTo(xr + 6, py); g.lineTo(W + 34, py); g.stroke(); g.setLineDash([]);
          // the level mark: a triangle standing on the line
          g.fillStyle = ink2; g.beginPath(); g.moveTo(W + 40, py); g.lineTo(W + 33, py - 10); g.lineTo(W + 47, py - 10); g.closePath(); g.fill();
          g.font = font(650, 15); g.fillStyle = ink2; g.textBaseline = 'alphabetic';
          const val = (L.y >= 0 ? '+' : '−') + Math.abs(L.y).toFixed(2) + ' m';
          g.fillText(val, W + 54, py - 2);
          g.font = font(400, 13); g.fillStyle = soft; g.fillText(L.y === 0 && !L.top ? L.label + ' · ' + t('peil') : L.label, W + 54, py + 14);
        }
      }
      if (opts.bare) return { canvas: cv, ppm, levels: shownLevels, widthM: cv.width / ppm, heightM: cv.height / ppm, name };
      // title block
      const by = H + 18;
      g.strokeStyle = '#d5dbdb'; g.lineWidth = 1; g.beginPath(); g.moveTo(16, H + 6); g.lineTo(cv.width - 16, H + 6); g.stroke();
      g.fillStyle = ink2; g.font = font(700, 24); g.textBaseline = 'top';
      g.fillText(name + (item.sub && item.kind === 'side' ? ' (' + item.sub + ')' : ''), 18, by);
      g.font = font(400, 14); g.fillStyle = soft;
      const v = this.shownVersion();
      g.fillText([this.project.name, v.name, fmtDate(Date.now(), false)].filter(Boolean).join(' · '), 18, by + 34);
      if (planeNote || item.kind === 'slice') g.fillText(planeNote || item.sub, 18, by + 54);
      // scale bar: whole metres, alternately filled
      const span = (spanR > 24 ? 10 : 5), step = span > 5 ? 2 : 1;
      const sx = cv.width - 24 - span * ppm, sy = H + 44;
      g.font = font(400, 12); g.fillStyle = ink2; g.textBaseline = 'alphabetic';
      for (let i = 0; i < span; i += step) {
        g.fillStyle = (i / step) % 2 ? '#ffffff' : ink2;
        g.fillRect(sx + i * ppm, sy, step * ppm, 8);
      }
      g.strokeStyle = ink2; g.lineWidth = 1; g.strokeRect(sx, sy, span * ppm, 8);
      g.fillStyle = ink2;
      for (let i = 0; i <= span; i += step) { const tx = String(i); g.fillText(tx, sx + i * ppm - g.measureText(tx).width / 2, sy - 5); }
      g.fillText('m', sx + span * ppm + 6, sy + 8);
      return { canvas: cv, ppm, levels: shownLevels, widthM: cv.width / ppm, heightM: cv.height / ppm, name: name + (item.sub && item.kind === 'side' ? ' (' + item.sub + ')' : '') };
    } finally {
      for (const f of restore) f();
      for (const f of extra) f();
      SLICE.onU.value = prev.onU;
      dv.scene.background = prev.bg;
      dv.ground.visible = prev.groundVis;
      r.setPixelRatio(prev.pr);
      r.setSize(prev.size.x, prev.size.y, false);
      for (const pn of this.panes) if (pn.view && pn.view !== dv) pn.view.needs = true;
    }
  },

  /** the scale it prints at on A4 landscape: the largest drawing that fits */
  drawingPrintScale(d) {
    for (const s of DRAW_SCALES) if (d.widthM * 1000 / s <= DRAW_PRINT.w && d.heightM * 1000 / s <= DRAW_PRINT.h) return s;
    return DRAW_SCALES[DRAW_SCALES.length - 1];
  },

  /** the Drawings window: pick a façade or a section, colour or lines; save as a picture or print */
  async drawingsSheet(start) {
    if (!window.WebGLRenderingContext) { this.toast(t('Drawings need 3D, which this device does not have.')); return; }
    const list = this.drawingList();
    this._dvSig = null;
    const st = this._drawSt || (this._drawSt = { key: 'front', style: 'colour', pos: { secA: 0.5, secB: 0.5 } });
    if (start && start.slice) { const it = list.find(x => x.kind === 'slice' && x.slice === start.slice); if (it) st.key = it.key; }
    else if (start && start.key) st.key = start.key;
    if (!list.some(x => x.key === st.key)) st.key = 'front';
    const body = h('div', { class: 'drawings' });
    const tabs = h('div', { class: 'seg wrap draw-tabs', role: 'tablist' });
    const posRow = h('div', { class: 'draw-pos' });
    const styleSeg = h('div', { class: 'seg draw-style' });
    const view = h('div', { class: 'draw-view' });
    const note = h('p', { class: 'note-muted draw-note' });
    let cur = null;
    const paint = () => {
      const item = list.find(x => x.key === st.key);
      for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.k === st.key));
      for (const b of styleSeg.children) b.setAttribute('aria-pressed', String(b.dataset.k === st.style));
      posRow.hidden = item.kind !== 'sec';
      if (item.kind === 'sec') {
        const inp = posRow.querySelector('input');
        inp.value = String(Math.round((st.pos[item.key] ?? 0.5) * 100));
        posRow.querySelector('.lab').textContent = item.axis === 'z' ? t('Where it cuts (front → back)') : t('Where it cuts (right → left)');
      }
      view.classList.add('busy');
      view.classList.remove('zoom');
      // let the "busy" show before the work
      requestAnimationFrame(() => setTimeout(() => {
        let d = null;
        try { d = this.makeDrawing(item, { style: st.style, pos: item.kind === 'sec' ? 1 - (st.pos[item.key] ?? 0.5) : null }); } catch (e) { console.warn('drawing failed', e); }
        view.classList.remove('busy');
        view.textContent = '';
        cur = d;
        if (!d) { view.appendChild(h('p', { class: 'note-muted' }, t('This drawing could not be made.'))); return; }
        d.canvas.classList.add('draw-canvas');
        d.canvas.dataset.key = item.key;
        // tap: full size (scroll around in it), tap again: fit
        d.canvas.title = t('Tap to see it full size');
        d.canvas.addEventListener('click', () => view.classList.toggle('zoom'));
        view.appendChild(d.canvas);
        note.textContent = t('Tap the drawing to see it full size. Prints at {s} on A4 landscape (print at 100 %, not "fit to page").').replace('{s}', '1:' + this.drawingPrintScale(d));
      }, 0));
    };
    for (const it of list) tabs.appendChild(h('button', { role: 'tab', 'data-k': it.key, onclick: () => { st.key = it.key; paint(); } }, it.label));
    for (const [k, l] of [['colour', t('Colour')], ['lines', t('Lines')]]) styleSeg.appendChild(h('button', { 'data-k': k, onclick: () => { st.style = k; paint(); } }, l));
    const range = h('input', { type: 'range', min: '2', max: '98', step: '1', 'aria-label': t('Where the section cuts') });
    range.addEventListener('change', () => { const item = list.find(x => x.key === st.key); if (item && item.kind === 'sec') { st.pos[item.key] = +range.value / 100; paint(); } });
    posRow.append(h('span', { class: 'lab flabel' }), range);
    const save = h('button', { class: 'btn sm', id: 'draw-save', onclick: () => { if (!cur) return; cur.canvas.toBlob(b => { if (b) this.downloadBlob(`${slugify(this.project.name)}_${slugify(cur.name)}.png`, b); }, 'image/png'); } }, icon('download'), t('Save picture'));
    const print = h('button', { class: 'btn sm primary', id: 'draw-print', onclick: () => { if (cur) this.printHtml(this.drawingPrintHtml(cur), cur.name); } }, icon('print'), t('Print or save as PDF'));
    const pdfSet = h('button', { class: 'btn sm', id: 'draw-pdfset', onclick: () => this.plansPdfSheet() }, icon('download'), t('All plans as PDF…'));
    body.append(h('div', { class: 'draw-bar' }, tabs), h('div', { class: 'draw-bar' }, styleSeg, posRow), view, h('div', { class: 'draw-foot' }, note, h('div', { class: 'actions' }, pdfSet, save, print)));
    paint();
    await UI.dialog({ title: t('Drawings: façades and sections'), body, wide: true, enterKey: false, actions: [] });
    // the hidden view goes; the views on screen get their own state back
    this.dropDrawingView();
    this.refreshViews(false);
  },

  drawingPrintHtml(d) {
    const s = this.drawingPrintScale(d);
    const wmm = d.widthM * 1000 / s, url = d.canvas.toDataURL('image/png');
    const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(d.name)} · ${esc(this.project.name)}</title><style>
      @page { size: A4 landscape; margin: 10mm; } body { margin: 0; font: 11px system-ui, sans-serif; color: #1a2326; }
      img { display: block; width: ${wmm.toFixed(2)}mm; height: auto; } .s { margin-top: 2mm; color: #5b6669; }
    </style></head><body><img src="${url}" alt="${esc(d.name)}"><div class="s">${esc(t('Scale'))} 1:${s} (A4)</div></body></html>`;
  },
});
