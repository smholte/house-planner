/* ───────────── extras.js — the colour library (your own colours + RAL), saving a picture of the view,
   and measuring in 3D ───────────── */

const ralLabel = c => `RAL ${c[0]} ${t(c[1]).toLowerCase()}` + (c[3] ? ` (${c[3]})` : '');

Object.assign(app, {
  /** pick a colour from your own list or RAL; resolves to {hex, name} or null */
  async colourPicker({ value, title } = {}) {
    const p = this.project;
    p.colours = p.colours || [];
    let tab = this._colTab || (p.colours.length ? 'mine' : 'ral'), q = '', close = null;
    const body = h('div', { class: 'col-body' });
    const pickIt = (hex, name) => { close({ hex, name }); };
    const paint = () => {
      body.textContent = '';
      body.appendChild(h('div', { class: 'seg' }, ...[['mine', t('My colours')], ['ral', 'RAL']].map(([k, lab]) => h('button', { 'aria-pressed': String(tab === k), onclick: () => { tab = this._colTab = k; paint(); } }, lab))));
      if (tab === 'ral') {
        const search = h('input', { class: 'input', type: 'search', value: q, placeholder: t('Search: 9010, white, antraciet …'), 'aria-label': t('Search RAL colours'), autocomplete: 'off' });
        search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); grid(); setTimeout(() => search.focus(), 0); });
        body.appendChild(search);
        const box = h('div', { class: 'col-grid' });
        const grid = () => {
          box.textContent = '';
          const list = RAL.filter(c => !q || ('ral ' + c.join(' ')).toLowerCase().includes(q));
          for (const c of list) box.appendChild(h('button', { class: 'col-card' + (value && value.toLowerCase() === c[2].toLowerCase() ? ' on' : ''), title: ralLabel(c), onclick: () => pickIt(c[2], ralLabel(c)) },
            h('span', { class: 'col-sw', style: { background: c[2] } }), h('span', { class: 'col-code num' }, c[0]), h('span', { class: 'col-name' }, c[3] || c[1])));
          if (!list.length) box.appendChild(h('p', { class: 'note-muted' }, t('No RAL colour matches.')));
        };
        grid();
        body.appendChild(box);
        body.appendChild(h('p', { class: 'note-muted' }, t('Screen colours are an approximation: check a real RAL colour fan before you buy paint.')));
      } else {
        const box = h('div', { class: 'col-grid mine' });
        for (const c of p.colours) box.appendChild(h('div', { class: 'col-card mine' + (value && value.toLowerCase() === c.hex.toLowerCase() ? ' on' : '') },
          h('button', { class: 'col-pick', onclick: () => pickIt(c.hex, c.name), title: c.name }, h('span', { class: 'col-sw', style: { background: c.hex } }), h('span', { class: 'col-name' }, c.name)),
          h('button', { class: 'col-del', 'aria-label': t('Remove from my colours'), title: t('Remove'), onclick: () => { this.mutate(pr => { pr.colours = pr.colours.filter(x => x !== c); }, { project: true, keepInspector: true }); paint(); } }, icon('close'))));
        if (!p.colours.length) box.appendChild(h('p', { class: 'note-muted' }, t('No colours of your own yet. Add the colours you are considering (a paint name and code, or a sample), so you can use them everywhere in this house.')));
        body.appendChild(box);
        const nm = h('input', { class: 'input', placeholder: t('Name, e.g. Flexa Warm wit, Sikkens F4.05.85'), 'aria-label': t('Colour name'), autocomplete: 'off' });
        const hx = h('input', { type: 'color', value: value || '#EDEBE6', 'aria-label': t('Colour') });
        const add = () => {
          const name = nm.value.trim() || hx.value.toUpperCase();
          this.mutate(pr => { (pr.colours = pr.colours || []).push({ id: uid('c_'), name, hex: hx.value.toUpperCase() }); }, { project: true, keepInspector: true });
          paint();
        };
        body.appendChild(h('div', { class: 'col-add' }, hx, nm, h('button', { class: 'btn sm primary', onclick: add }, icon('plus'), t('Add'))));
        body.appendChild(h('p', { class: 'note-muted' }, t('Your colours are kept in the house file, so they travel with it.')));
      }
    };
    paint();
    return UI.dialog({ title: title || t('Colour library'), body, wide: true, actions: [{ label: t('Cancel'), value: null }], onOpen: (d, c) => { close = c; } });
  },

  /* ───────── save a picture of the view ───────── */
  async savePicture() {
    const pane = this.panes.find(x => x.role === 'main');
    if (!pane) return;
    const p = this.project;
    const name = `${slugify(p.name)}_${this.view.scope === 'storey' ? slugify((this.currentStorey() || {}).name || 'storey') : this.view.scope}_${this.view.dim}_${todayStamp()}.png`;
    let blob;
    try { blob = pane.kind === '3d' ? await this.picture3d(pane.view) : await this.picture2d(pane.view); }
    catch (e) { console.error(e); this.toast(t('The picture could not be made.')); return; }
    if (!blob) { this.toast(t('The picture could not be made.')); return; }
    const file = window.File ? new File([blob], name, { type: 'image/png' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name, style: { display: 'none' } });
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    this.toast(t('Picture saved: {n}', { n: name }));
  },
  /** the 3D view drawn twice as sharp, with the room names and note pins written on it */
  picture3d(v) {
    if (!v.ok) return null;
    const r = v.renderer, pr = r.getPixelRatio(), k = Math.min(3, Math.max(2, pr * 1.5));
    r.setPixelRatio(k); r.setSize(v.W, v.H, false);
    r.shadowMap.needsUpdate = true;
    r.render(v.scene, v.camera);
    if (v.aoWanted()) { v.ao.resize(); v.renderAO(); }
    const W = r.domElement.width, H = r.domElement.height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.drawImage(r.domElement, 0, 0);
    r.setPixelRatio(pr); r.setSize(v.W, v.H, false); if (v.ao) v.ao.resize(); v.needs = true;
    // labels on top, where they are on screen
    const sx = W / v.W;
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-label') || 'sans-serif';
    for (const l of v.labels) {
      if (l.el.hidden || l.pin) continue;
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(l.el.style.transform || '');
      if (!m) continue;
      const x = +m[1] * sx, y = +m[2] * sx, txt = l.el.textContent;
      g.font = `600 ${13 * sx}px ${font}`;
      const tw = g.measureText(txt).width;
      g.fillStyle = l.el.classList.contains('sheet') ? 'rgba(26,35,38,.9)' : 'rgba(251,252,252,.85)';
      g.fillRect(x - tw / 2 - 6 * sx, y - 10 * sx, tw + 12 * sx, 20 * sx);
      g.fillStyle = l.el.classList.contains('sheet') ? '#fff' : '#1A2326';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, x, y + 1 * sx);
    }
    return new Promise(res => cv.toBlob(res, 'image/png'));
  },
  /** the 2D plan as a picture: the drawing with its own colours, twice as sharp */
  async picture2d(v) {
    const src = v.svg;
    const clone = src.cloneNode(true);
    const all = [src, ...src.querySelectorAll('*')], allC = [clone, ...clone.querySelectorAll('*')];
    const props = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'paint-order', 'vector-effect', 'visibility', 'display', 'letter-spacing'];
    all.forEach((el, i) => {
      const cs = getComputedStyle(el), out = allC[i];
      if (!out || !out.setAttribute) return;
      out.setAttribute('style', props.map(pp => `${pp}:${cs.getPropertyValue(pp)}`).join(';'));
    });
    const W = v.W, H = v.H, k = 2;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', W); clone.setAttribute('height', H);
    clone.insertBefore(s('rect', { x: 0, y: 0, width: W, height: H, fill: cssVar('--paper') || '#fff' }), clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml));
    const cv = document.createElement('canvas'); cv.width = W * k; cv.height = H * k;
    const g = cv.getContext('2d');
    g.scale(k, k);
    g.drawImage(img, 0, 0, W, H);
    return new Promise(res => cv.toBlob(res, 'image/png'));
  },
});

/* ───────── measuring in 3D (View mode): tap two points on the house ───────── */
Object.assign(View3D.prototype, {
  measureTap(hit) {
    if (!hit) { this.app.toast(t('Tap on the house to measure.')); return; }
    // snap to a corner of what was hit when it is close (within 4 cm)
    let pt = hit.point.clone();
    if (hit.face && hit.object.geometry && hit.object.geometry.attributes.position) {
      const pos = hit.object.geometry.attributes.position;
      for (const i of [hit.face.a, hit.face.b, hit.face.c]) {
        const q = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(hit.object.matrixWorld);
        if (q.distanceTo(hit.point) < 0.04) { pt = q; break; }
      }
    }
    const m = this.m3;
    if (!m || m.b) this.m3 = { a: pt, b: null }; else m.b = pt;
    this.drawMeasure3d();
  },
  clearMeasure3d() { this.m3 = null; this.drawMeasure3d(); },
  drawMeasure3d() {
    if (!this.m3Group) { this.m3Group = new THREE.Group(); this.m3Group.renderOrder = 20; this.scene.add(this.m3Group); }
    const g = this.m3Group;
    g.traverse(o => o.geometry && o.geometry.dispose());
    g.clear();
    if (this.m3Label) { this.m3Label.remove(); this.m3Label = null; }
    const m = this.m3;
    if (!m) { this.needs = true; return; }
    const col = new THREE.Color(cssVar('--new') || '#d2372b');
    const dot = p => { const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshBasicMaterial({ color: col, depthTest: false })); s2.position.copy(p); s2.renderOrder = 20; g.add(s2); };
    dot(m.a);
    if (m.b) {
      dot(m.b);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([m.a, m.b]), new THREE.LineBasicMaterial({ color: col, depthTest: false }));
      line.renderOrder = 20;
      g.add(line);
      const d = m.a.distanceTo(m.b), dh = Math.abs(m.b.y - m.a.y), flat = Math.hypot(m.b.x - m.a.x, m.b.z - m.a.z);
      this.m3Label = h('div', { class: 'm3-label' }, h('b', null, fmtMM(d) + ' mm'), dh > 0.01 && flat > 0.01 ? h('span', null, `↔ ${fmtMM(flat)} · ↕ ${fmtMM(dh)}`) : null);
      this.host.appendChild(this.m3Label);
      this.m3Mid = m.a.clone().lerp(m.b, 0.5);
    }
    this.needs = true;
  },
  placeMeasureLabel() {
    if (!this.m3Label || !this.m3Mid) return;
    const v = this.m3Mid.clone().project(this.camera);
    const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
    this.m3Label.hidden = !vis;
    if (vis) this.m3Label.style.transform = `translate(${((v.x + 1) / 2 * this.W).toFixed(1)}px, ${((1 - v.y) / 2 * this.H).toFixed(1)}px) translate(-50%, -130%)`;
  },
});
