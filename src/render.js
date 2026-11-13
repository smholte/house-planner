/* ───────────── render.js — a photo-like picture of the 3D view ("Photo render") ─────────────
   View menu → "Photo render of this view". The 3D view as you see it now, drawn again many times and averaged:
   – every pass the camera moves a fraction of a pixel: clean edges (no stair steps);
   – the sun moves a little within its own disc: shadows with real soft edges;
   – part of the daylight comes from one spot of the sky per pass, with its own shadows (a few hundred spots over
     the whole sky in the end): light that really comes in through the windows, rooms darker deep inside, soft
     shadows under eaves, along walls and under furniture – where the normal view lights everything evenly;
   – the soft shadows in corners (GTAO) every pass, so their grain averages out.
   The passes are averaged in linear light (as light adds up), on the processor, from the pictures the graphics chip
   makes; a picture can be saved (PNG). "Same view in another version" draws the same view of another version (the
   colours you are choosing between, say): the pictures stay in the dialog to flip between or compare with a slider.
   How long: Quick 48 passes, Good 160, Best 480; a pass takes about as long as a picture in the 3D view. */

const RENDER_PASSES = { quick: 48, good: 160, best: 480 };
const RENDER_SKY = 0.5;                      // the part of the sky light that comes from the sky spots (with shadows)
const RENDER_MID = 0.18;                     // the light meter's middle grey (linear): darker pictures are opened up
const RENDER_OPEN = 2.0;                     // … at most this much (an inside view: the windows may burn out, as in a photo)
const RENDER_SUN_DISC = 0.6 * Math.PI / 180; // the sun's wobble (radius): a little more than the real sun – softer
const SRGB2LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const LIN2SRGB = new Uint8Array(4097).map((_, i) => { const v = i / 4096, c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); });
/** low-discrepancy numbers: the passes cover the pixel, the sun's disc and the sky evenly, whenever you stop */
function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
/** a direction over the sky for pass i: as much from each part as it lights a level surface (cosine) */
function skyDir(i) {
  const u = halton(i + 1, 2), v = halton(i + 1, 3);
  const y = Math.max(0.12, Math.sqrt(1 - u)), r = Math.sqrt(1 - y * y), a = 2 * Math.PI * v;
  return new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
}
/** the size of the picture: the 3D view's own size (up to twice for sharp screens), or larger */
function renderSize(v, size) {
  const W0 = Math.max(16, v.W || 800), H0 = Math.max(16, v.H || 600);
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const max = size === 'large' ? (coarse ? 2000 : 2800) : (coarse ? 1400 : 2000);
  const k = size === 'large' ? max / Math.max(W0, H0) : Math.min(Math.min(window.devicePixelRatio || 1, 2), max / Math.max(W0, H0));
  return [Math.max(16, Math.round(W0 * k)), Math.max(16, Math.round(H0 * k))];
}

/** one render of a 3D view: progressive; onPaint(canvas, n) now and then; stop() → finish with what is there.
 *  keep: the render stays set up when done – res.more(extra, {onPass, onPaint, stop}) adds passes to the same picture
 *  (Continue), res.end() puts the view back */
async function renderView3d(v, opts) {
  const { passes, size } = opts;
  let { onPaint, stop, onPass } = opts;
  const r = v.renderer, gl = r.getContext(), cam = v.camera;
  // (the browser lost the 3D drawing – the graphics card was reset: its size reads 0)
  if (v.lost || gl.isContextLost()) throw lostError();
  const [W0, H0] = opts.W ? [opts.W, opts.H] : renderSize(v, size);
  // the soft shadows in corners are part of it (wait for their code the first time)
  if (v.aoWanted && !v.aoWanted() && typeof AO_MODS !== 'undefined' && AO_MODS.p) { await AO_MODS.p; v.aoWanted(); }
  // what we change, to put back
  const keep = {
    pr: r.getPixelRatio(), view: cam.view && cam.view.enabled ? { ...cam.view } : null, aspect: cam.aspect,
    sunPos: v.sun.position.clone(), sunInt: v.sun.intensity, hemi: v.hemi.intensity, env: v.scene.environmentIntensity,
    auto: r.shadowMap.autoUpdate, aoK: v.aoK, exposure: r.toneMappingExposure,
    bg: v.scene.background, bgI: v.scene.backgroundIntensity, bgR: v.scene.backgroundRotation.clone(),
  };
  const L = renderLight(opts.light), [wR, , wB] = warmGains(L.warm), evK = Math.pow(2, L.ev);
  // the real sky behind the house (by day; its sun left out, turned to the app's sun)
  const bgSky = L.skyBg && !(v.spec && v.spec.light === 'evening') && libSkyNoSun('day');
  if (bgSky) {
    const d = v.sun.position.clone().sub(v.sun.target.position);
    v.scene.background = bgSky;
    v.scene.backgroundIntensity = 0.55 * Math.min(2, 0.55 / Math.max(0.05, bgSky.userData.avg));
    v.scene.backgroundRotation.set(0, Math.atan2(d.z, d.x) - (bgSky.userData.sunU - 0.5) * Math.PI * 2, 0);
  }
  v.rendering = true;
  if (v.nearSunEnd) v.nearSunEnd();   // (the render lights with the usual sun)
  const evening = v.spec && v.spec.light === 'evening';
  const C = v._sunC || new THREE.Vector3(), R = v._sunR || 10;
  // the sky spots: a shadow-casting light from another spot of the sky every pass
  let sky = null;
  if (!evening) {
    sky = new THREE.DirectionalLight(v.hemi.color.clone(), keep.hemi * RENDER_SKY * 1.5 * L.sky);
    sky.castShadow = true;
    sky.shadow.mapSize.set(2048, 2048);
    sky.shadow.bias = -0.0004; sky.shadow.normalBias = 0.03;
    const sc = sky.shadow.camera;
    sc.left = -R * 1.3; sc.right = R * 1.3; sc.top = R * 1.3; sc.bottom = -R * 1.3; sc.near = 0.5; sc.far = R * 6;
    sc.updateProjectionMatrix();
    sky.target.position.copy(C);
    v.scene.add(sky, sky.target);
    v.hemi.intensity = keep.hemi * (1 - RENDER_SKY) * L.sky;
    if (v.scene.environment) v.scene.environmentIntensity = keep.env * (1 - RENDER_SKY * 0.6) * L.sky;
  }
  // everything back as it was
  let ended = false;
  const restore = () => {
    if (ended) return;
    ended = true;
    if (sky) { v.scene.remove(sky, sky.target); sky.dispose(); if (sky.shadow && sky.shadow.map) sky.shadow.map.dispose(); }
    v.sun.position.copy(keep.sunPos); v.sun.intensity = keep.sunInt;
    v.hemi.intensity = keep.hemi;
    if (keep.env != null) v.scene.environmentIntensity = keep.env;
    v.aoK = keep.aoK;
    v.scene.background = keep.bg; v.scene.backgroundIntensity = keep.bgI; v.scene.backgroundRotation.copy(keep.bgR);
    r.shadowMap.autoUpdate = keep.auto;
    r.shadowMap.needsUpdate = true;
    r.toneMappingExposure = keep.exposure;
    if (v.renderer) {
      r.setPixelRatio(keep.pr);
      if (keep.view) cam.setViewOffset(keep.view.fullWidth, keep.view.fullHeight, keep.view.offsetX, keep.view.offsetY, keep.view.width, keep.view.height); else cam.clearViewOffset();
      v.rendering = false;
      v.resize();
      v.needs = true;
    }
  };
  v.aoK = 0.75;
  const sun0 = keep.sunPos.clone().sub(v.sun.target.position), sunLen = sun0.length(), sunDir0 = sun0.clone().normalize();
  const t1 = new THREE.Vector3().crossVectors(sunDir0, Math.abs(sunDir0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(sunDir0, t1);
  r.setPixelRatio(1);
  r.setSize(W0, H0, false);
  // (a device may give a smaller picture than asked: use what it gives)
  const W = gl.drawingBufferWidth || W0, H = gl.drawingBufferHeight || H0;
  cam.aspect = W / H;
  cam.updateProjectionMatrix();
  if (v.ao) v.ao.resize();
  r.shadowMap.autoUpdate = false;
  // (a very large picture may not fit in the memory a page has – a phone at 4K: say so, and leave the view as it was)
  let px, acc, out, og, img;
  try { px = new Uint8Array(W * H * 4); acc = new Float32Array(W * H * 3); out = makeCanvas(W, H); og = out.getContext('2d'); img = og.createImageData(W, H); }
  catch (e) { restore(); throw new Error(t('Not enough memory for a picture this large – choose a smaller size.')); }
  let n = 0, expK = 1, msDone = 0, t0 = performance.now();
  const paint = () => {
    const d = img.data, s = 4096 / Math.max(1, n);
    for (let y = 0; y < H; y++) {
      let a = (H - 1 - y) * W * 3, o = y * W * 4;          // the GPU's rows run bottom up
      for (let x = 0; x < W; x++, a += 3, o += 4) {
        d[o] = LIN2SRGB[Math.min(4096, (acc[a] * s * wR) | 0)];
        d[o + 1] = LIN2SRGB[Math.min(4096, (acc[a + 1] * s) | 0)];
        d[o + 2] = LIN2SRGB[Math.min(4096, (acc[a + 2] * s * wB) | 0)];
        d[o + 3] = 255;
      }
    }
    og.putImageData(img, 0, 0);
    if (onPaint) onPaint(out, n, msDone + performance.now() - t0);
  };
  // the passes up to total (more of them after Continue: on with the next sky spots, sun spots, pixel shifts)
  const runTo = async total => {
    let lastPaint = 0;
    while (n < total && !(stop && stop())) {
      // let taps and clicks through first (a slow device takes seconds a pass), then wait for the next frame
      await new Promise(res => setTimeout(res, 0));
      await new Promise(res => requestAnimationFrame(res));
      if (!v.ok || !v.renderer) break;
      if (v.lost || gl.isContextLost()) throw lostError();
      const f0 = performance.now();
      do {
        const i = n;
        // the camera a fraction of a pixel aside
        const jx = halton(i + 1, 2) - 0.5, jy = halton(i + 1, 3) - 0.5;
        if (keep.view) cam.setViewOffset(keep.view.fullWidth, keep.view.fullHeight, keep.view.offsetX + jx * keep.view.fullWidth / W, keep.view.offsetY + jy * keep.view.fullHeight / H, keep.view.width, keep.view.height);
        else cam.setViewOffset(W, H, jx, jy, W, H);
        // the sun somewhere on its disc
        const ra = RENDER_SUN_DISC * Math.sqrt(halton(i + 1, 5)), ph = 2 * Math.PI * halton(i + 1, 7);
        const sd = sunDir0.clone().addScaledVector(t1, Math.tan(ra) * Math.cos(ph)).addScaledVector(t2, Math.tan(ra) * Math.sin(ph)).normalize();
        v.sun.position.copy(v.sun.target.position).addScaledVector(sd, sunLen);
        // one spot of the sky
        if (sky) sky.position.copy(C).addScaledVector(skyDir(i), R * 3);
        // (the house may be built again meanwhile – a change elsewhere, a texture that arrived – and that sets
        // the view's own light: the render's light again, every pass)
        r.toneMappingExposure = keep.exposure * expK * evK;
        v.sun.intensity = keep.sunInt * L.sun;
        if (sky) { v.hemi.intensity = keep.hemi * (1 - RENDER_SKY) * L.sky; if (v.scene.environment) v.scene.environmentIntensity = keep.env * (1 - RENDER_SKY * 0.6) * L.sky; if (!sky.parent) v.scene.add(sky, sky.target); }
        v.aoK = 0.75;
        r.shadowMap.needsUpdate = true;
        r.setRenderTarget(null);
        r.render(v.scene, cam);
        if (v.ao) v.renderAO();
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let p = 0, a = 0, m = W * H * 4; p < m; p += 4, a += 3) {
          acc[a] += SRGB2LIN[px[p]]; acc[a + 1] += SRGB2LIN[px[p + 1]]; acc[a + 2] += SRGB2LIN[px[p + 2]];
        }
        n++;
        if (onPass) onPass(n, msDone + performance.now() - t0);
      } while (n < total && performance.now() - f0 < 45 && !(stop && stop()));
      if (performance.now() - lastPaint > (n < 16 ? 150 : 600)) { paint(); lastPaint = performance.now(); }
    }
    paint();
  };
  let kept = false;
  try {
    // the light meter: inside, with the daylight only coming in through the windows, the picture would be dark –
    // a camera opens up (at most RENDER_OPEN times), never down
    if (!evening && opts.meter !== false) {
      if (sky) sky.position.copy(C).addScaledVector(new THREE.Vector3(0, 1, 0), R * 3);
      r.shadowMap.needsUpdate = true;
      r.render(v.scene, cam);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0, cnt = 0;
      for (let p = 0, m = W * H * 4; p < m; p += 4 * 7) { sum += 0.2126 * SRGB2LIN[px[p]] + 0.7152 * SRGB2LIN[px[p + 1]] + 0.0722 * SRGB2LIN[px[p + 2]]; cnt++; }
      const L = sum / Math.max(1, cnt);
      expK = clamp(RENDER_MID / Math.max(1e-4, L), 1, RENDER_OPEN);
      r.toneMappingExposure = keep.exposure * expK * evK;
    }
    await runTo(passes);
    kept = !!opts.keep && !!v.renderer;
  } finally {
    msDone += performance.now() - t0;
    if (!kept) restore();
  }
  const res = { canvas: out, n, ms: msDone, W, H, exposure: expK };
  if (kept) {
    res.more = async (extra, o = {}) => {
      if (ended) throw new Error('ended');
      ({ onPaint, stop, onPass } = o);
      t0 = performance.now();
      try { if (v.lost || gl.isContextLost()) throw lostError(); await runTo(n + extra); }
      catch (e) { restore(); throw e; }
      finally { msDone += performance.now() - t0; }
      return Object.assign(res, { n, ms: msDone });
    };
    res.end = () => { try { restore(); } catch (e) { /* the view is gone */ } };
  }
  return res;
}

/* ───────── the render window: the picture's shape and size, the 3D view in its frame ───────── */
// the sizes: the long side in pixels (2K and 4K as screens have them: 2560 × 1440, 3840 × 2160 at 16:9)
const RENDER_RES = [['hd', 'HD', 1280], ['fhd', 'Full HD', 1920], ['2k', '2K', 2560], ['4k', '4K', 3840]];
/** the sizes this device offers (a phone not 4K: the picture would not fit in its memory) */
const renderResList = () => window.matchMedia('(pointer: coarse)').matches ? RENDER_RES.filter(x => x[0] !== '4k') : RENDER_RES;
const renderLong = k => (RENDER_RES.find(x => x[0] === k) || RENDER_RES[1])[2];
// the shapes of the frame: [key, what it is for]
const RENDER_RATIOS = [['view', ''], ['16:9', 'wide'], ['3:2', 'photo'], ['4:3', ''], ['1:1', 'square'], ['4:5', 'upright'], ['2:3', 'upright photo'], ['9:16', 'phone screen']];
/** a shape as a number (width ÷ height): 'view' the 3D view's own, '16:9', or a number (dragged) */
function renderRatio(k, viewRatio) {
  if (typeof k === 'number' && k > 0) return clamp(k, 0.2, 5);
  if (typeof k === 'string' && /^\d+:\d+$/.test(k)) { const [a, b] = k.split(':').map(Number); return a / b; }
  return viewRatio || 16 / 9;
}
/** the picture's width and height for a long side and a shape (even numbers) */
function renderDims(L, r) {
  const W = r >= 1 ? L : L * r, H = r >= 1 ? L / r : L;
  return [Math.max(16, 2 * Math.round(W / 2)), Math.max(16, 2 * Math.round(H / 2))];
}
const ratioText = r => (Math.round(r * 100) / 100).toFixed(2).replace('.', I18N.lang === 'en' ? '.' : ',') + ' : 1';
const ratioLabel = k => k === 'view' ? t('As the view') : typeof k === 'number' ? t('Own shape') + ' ' + ratioText(k) : k;
/** a duration in words: 40 s, 4 min, 1 h 20 min */
function fmtDur(ms) {
  const s = ms / 1000;
  if (s < 59.5) return t('{n} s', { n: Math.max(1, Math.round(s)) });
  const m = Math.round(s / 60);
  if (m < 60) return t('{n} min', { n: m });
  const hh = Math.floor(m / 60), mm = m - 60 * hh;
  return mm ? t('{h} h {m} min', { h: hh, m: mm }) : t('{h} h', { h: hh });
}
/** a picture as a JPEG for the window: at most max pixels on its long side (the full one is kept for saving) */
function shrinkUrl(cv, max, q) {
  const k = Math.min(1, max / Math.max(cv.width, cv.height));
  if (k >= 1) return cv.toDataURL('image/jpeg', q);
  const c = makeCanvas(Math.max(1, Math.round(cv.width * k)), Math.max(1, Math.round(cv.height * k)));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(cv, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
Object.assign(View3D.prototype, {
  /** the view's picture into box (the render window's frame): it takes the frame's size and is turned and zoomed there
   *  as in the view; the pane keeps a still copy meanwhile (a tap there picks nothing) */
  borrow(box) {
    if (!this.ok || this.borrowed || !this.renderer) return;
    const cv = this.renderer.domElement;
    let still = null;
    try {
      // (drawn now and copied at once: the 3D picture is not kept after it is shown)
      this.renderer.render(this.scene, this.camera);
      still = makeCanvas(cv.width, cv.height);
      still.getContext('2d').drawImage(cv, 0, 0);
      still.className = 'gl gl-still';
      still.style.width = cv.style.width; still.style.height = cv.style.height;
    } catch (e) { still = null; }
    this.borrowed = { box, parent: cv.parentNode, next: cv.nextSibling, still, vo: this.vo, labels: this.labelLayer ? this.labelLayer.style.visibility : '' };
    if (still && cv.parentNode) cv.parentNode.insertBefore(still, cv);
    // (the picture is not slid for a menu or sheet there; the room names stay in the pane, hidden meanwhile)
    this.vo = null; this.camera.clearViewOffset();
    if (this.labelLayer) this.labelLayer.style.visibility = 'hidden';
    box.prepend(cv);
    this.ro.observe(box);
    this.resize();
    this.needs = true;
  },
  /** the picture back into its pane */
  giveBack() {
    const b = this.borrowed;
    if (!b) return;
    this.borrowed = null;
    const cv = this.renderer.domElement;
    try { this.ro.unobserve(b.box); } catch (e) { /* fine */ }
    if (b.parent && b.parent.isConnected) b.parent.insertBefore(cv, b.still && b.still.parentNode === b.parent ? b.still : (b.next && b.next.parentNode === b.parent ? b.next : null));
    if (b.still) b.still.remove();
    this.vo = b.vo;
    if (this.labelLayer) this.labelLayer.style.visibility = b.labels;
    this.resize();
    this.needs = true;
  },
});

Object.assign(app, {
  /** the 3D view to render (the first 3D pane), after switching to 3D when the plan is shown */
  async renderPane() {
    if (this.view.dim !== '3d') { this.setDim('3d'); await new Promise(r => setTimeout(r, 300)); }
    return this.waitView3d();
  },
  /** a 3D view that has its house built and drawn (after a version or quality change makes a new one) */
  async waitView3d() {
    for (let i = 0; i < 100; i++) {
      const pane = this.panes.find(p => p.kind === '3d');
      const v = pane && pane.view;
      if (v && v.ok && !v.lost && v.group && v.group.children.length && !v.needs) {
        await new Promise(r => setTimeout(r, 250));
        if (!v.needs && v.renderer) return v;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    const pane = this.panes.find(p => p.kind === '3d');
    return pane && pane.view && pane.view.ok ? pane.view : null;
  },
  /** the browser lost a 3D view's drawing (the graphics card was reset): start the views again, looking where they
   *  looked – at once when the browser gives the drawing back, else after a moment with a new one. Not endlessly. */
  view3dLost(v, restored = false) {
    const now = Date.now();
    this._gpuLost = (this._gpuLost || []).filter(x => now - x < 120000);
    if (!restored) {
      // the Pixel 10's PowerVR driver crashed: from now on safe pictures on this device (view3d.js)
      if (!SAFE_TEX && isPowerVR(GPU_INFO) && this.settings.safeTex == null) { SAFE_TEX = true; this.settings.safeTex = true; Settings.save(); }
      this._gpuLost.push(now);
      if (this._gpuLost.length > 3) { this.toast(t('The graphics card keeps stopping – the 3D view stays off for now. Reload the app to try again.')); return; }
      this.toast(t('The graphics card stopped for a moment – the 3D view is started again.'));
    }
    clearTimeout(this._gpuLostT);
    this._gpuLostT = setTimeout(() => {
      if (!this.panes.some(p => p.view === v)) return;
      this.layoutKey = null;
      this.setupPanes(false);
    }, restored ? 50 : 2500);
  },
  /** View → "Photo render of this view". The window shows the 3D view itself (its picture lent to the window's frame):
   *  turn, zoom and move it there to frame the photo; the frame's shape (16:9, square, upright, or drag its edges), the
   *  size in pixels (HD … 4K), how, the samples, the light – then Start render. When it is done: Save, Continue (more
   *  samples on the same picture), the same view in another version, Compare. */
  async renderSheet() {
    if (!this.project) return;
    // a selected room or wall is tinted in 3D: not in the photo (selected again after)
    const prevSel = this.selection;
    if (prevSel) { this.select(null); await new Promise(r => setTimeout(r, 200)); }
    const v0 = await this.renderPane();
    if (!v0) { this.toast(t('3D is not available on this device.')); return; }
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const saved = this.settings.renderOpts || {};
    const st = this._renderOpts || (this._renderOpts = { q: saved.q || 'good', method: saved.method || (ptSupported() ? 'pt' : 'passes'), res: saved.res, ratio: saved.ratio, dn: saved.dn !== false });
    // (no way given – an older setting: light passes)
    if (!ptSupported() || !st.method) st.method = 'passes';
    if (!st.q) st.q = 'good';
    if (!renderResList().some(x => x[0] === st.res)) st.res = coarse ? 'hd' : 'fhd';
    if (st.ratio == null) st.ratio = 'view';
    const saveOpts = () => { this.settings.renderOpts = { q: st.q, method: st.method, res: st.res, ratio: st.ratio, dn: st.dn !== false }; Settings.save(); };
    // the shape of the 3D view as it is now (the frame "As the view")
    const viewRatio = v0.W && v0.H ? v0.W / v0.H : 16 / 9;
    const ratioVal = () => renderRatio(st.ratio, viewRatio);
    const dims = () => st.W ? [st.W, st.H] : renderDims(renderLong(st.res), ratioVal());
    const startVersion = this.shownVersion().id, startDisplay = this.display;
    let liveCam = v0.viewState();
    const results = [];          // { canvas, url, thumb, name, versionId, n, ms, W, H, cam, ptm, session }
    let cur = -1, comparing = false, running = false, stopFlag = false, closed = false, lent = null, frameSize = null, touched = false, locked = false, nudgeT = 0;
    // ── the preview: a bar (the frame's shape and size in pixels, or Back to the view), the frame with the view in it
    const frame = h('div', { class: 'rn-frame', id: 'rn-frame' });
    const grips = ['l', 'r', 't', 'b'].map(sd => h('span', { class: 'rn-grip ' + sd, 'data-side': sd, title: t('Drag to change the shape of the picture') }));
    const hint = h('span', { class: 'rn-hint', id: 'rn-hint' });
    // the lock (2 Nov): over the view, so nothing reaches it – no turning, zooming or moving by accident (a drag on a
    // phone scrolls the window instead); the shape and the size can still be changed
    const shield = h('div', { class: 'rn-shield', id: 'rn-shield', hidden: true }, h('span', { class: 'rn-lockmark', 'aria-hidden': 'true' }, icon('lock')));
    frame.append(shield, ...grips, hint);
    const area = h('div', { class: 'rn-area' }, frame);
    const view = h('div', { class: 'rn-view', id: 'rn-view', hidden: true });
    const sbar = h('div', { class: 'rn-sbar' });
    const shot = h('div', { class: 'rn-shot', id: 'rn-shot' }, sbar, area, view);
    const status = h('p', { class: 'note-muted', id: 'rn-status' });
    const bar = h('div', { class: 'fh-bar speed-bar' }, h('i', { class: 'fh-fill fh-good', style: { width: '0%' } }));
    const strip = h('div', { class: 'rn-strip', id: 'rn-strip' });
    const opts = h('div', { class: 'rn-opts' });
    const acts = h('div', { class: 'actions rn-acts' });
    const foot = h('span', { class: 'rn-foot' });
    const body = h('div', { class: 'rn-body', id: 'rn-body' }, shot, bar, status, acts, strip, opts);
    const showing = () => cur >= 0 && results[cur] && results[cur].url;
    // the view's picture into the frame (again after the 3D view was started anew – a version change, the graphics card)
    const lend = () => {
      const pane = this.panes.find(p => p.kind === '3d'), v = pane && pane.view;
      if (!v || !v.ok || v.destroyed || v.lost || !v.renderer) return null;
      if (lent === v && v.borrowed) return v;
      if (lent && lent !== v && lent.borrowed) { try { lent.giveBack(); } catch (e) { /* gone */ } }
      v.borrow(frame);
      lent = v;
      return v;
    };
    // the frame: as large as the preview allows in the chosen shape (or as dragged by its edges)
    const M = 12;
    const fitFrame = () => {
      const b = area.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const SW = Math.max(40, b.width - 2 * M), SH = Math.max(40, b.height - 2 * M), r = ratioVal();
      let w, hh;
      if (frameSize) { w = Math.min(frameSize[0], SW); hh = Math.min(frameSize[1], SH); }
      else { w = SW; hh = w / r; if (hh > SH) { hh = SH; w = hh * r; } }
      frame.style.width = Math.round(w) + 'px'; frame.style.height = Math.round(hh) + 'px';
      // (the view takes the frame's size now, not at its next look)
      if (lent && lent.borrowed && !lent.rendering) lent.resize();
    };
    const ro = new ResizeObserver(() => { frameSize = null; fitFrame(); });
    ro.observe(area);
    // dragging an edge: the frame narrower or wider, lower or higher (from its middle) – a shape of your own
    for (const g of grips) g.addEventListener('pointerdown', e => {
      if (running || showing()) return;
      e.preventDefault(); e.stopPropagation();
      const sd = g.dataset.side, r0 = frame.getBoundingClientRect(), b = area.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
      try { g.setPointerCapture(id); } catch (x) { /* fine */ }
      g.classList.add('on');
      const move = ev => {
        if (ev.pointerId !== id) return;
        let w = r0.width, hh = r0.height;
        if (sd === 'l' || sd === 'r') w = clamp(r0.width + 2 * (ev.clientX - x0) * (sd === 'r' ? 1 : -1), 48, b.width - 2 * M);
        else hh = clamp(r0.height + 2 * (ev.clientY - y0) * (sd === 'b' ? 1 : -1), 48, b.height - 2 * M);
        frameSize = [w, hh]; st.ratio = Math.round(w / hh * 1000) / 1000;
        fitFrame(); paintBar(); paintRes();
      };
      const up = ev => {
        if (ev.pointerId !== id) return;
        g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
        g.classList.remove('on');
        saveOpts(); paintOpts();
      };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });
    // how to move the view (until it was moved once)
    const walking = () => !!(lent && lent.walker);
    const paintHint = () => {
      hint.textContent = walking() ? t('Drag to look around') : coarse ? t('Drag to turn · pinch to zoom · two fingers to move') : t('Drag to turn · scroll to zoom · right-drag to move');
      hint.hidden = touched || running || locked;
    };
    frame.addEventListener('pointerdown', e => { if (!e.target.classList.contains('rn-grip') && !locked) { touched = true; hint.hidden = true; } });
    frame.addEventListener('wheel', () => { if (!locked) { touched = true; hint.hidden = true; } }, { passive: true });
    // locking: the glide that is still going stops where it is; unlocking: the view moves again
    const freeze = v => {
      if (!v) return;
      v.anim = null;
      const c = v.controls;
      try { if (c && c._sphericalDelta) c._sphericalDelta.set(0, 0, 0); if (c && c._panOffset) c._panOffset.set(0, 0, 0); if (c && c._scale != null) c._scale = 1; } catch (e) { /* fine */ }
      if (v.walker && v.walker.look) { v.walker.look.dx = 0; v.walker.look.dy = 0; }
      if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { /* fine */ }
    };
    const setLock = on => {
      locked = !!on;
      if (locked) freeze(lent);
      shield.hidden = !locked;
      frame.classList.toggle('locked', locked);
      clearTimeout(nudgeT);
      paintBar(); paintHint();
    };
    // a tap on the locked view: what to do to move it
    shield.addEventListener('click', () => {
      hint.textContent = t('The view is locked – tap View locked above to move it again');
      hint.hidden = false;
      const b = sbar.querySelector('#rn-lock');
      if (b) { b.classList.remove('rn-nudge'); void b.offsetWidth; b.classList.add('rn-nudge'); }
      clearTimeout(nudgeT);
      nudgeT = setTimeout(() => { if (!closed) paintHint(); }, 2200);
    });
    shield.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); });
    shield.addEventListener('contextmenu', e => e.preventDefault());
    const setRatio = k => { st.ratio = k; frameSize = null; saveOpts(); backToView(); fitFrame(); paintBar(); paintOpts(); };
    const ratioMenu = anchor => UI.menu(anchor, RENDER_RATIOS.map(([k, d]) => ({ id: 'rn-ratio-' + k.replace(':', '-'), label: (k === 'view' ? t('As the view') : k) + (d ? ' · ' + t(d) : ''), icon: st.ratio === k ? 'check' : 'blank', fn: () => setRatio(k) }))
      .concat(typeof st.ratio === 'number' ? ['-', { label: t('Own shape') + ' · ' + ratioText(st.ratio), icon: 'check', fn: () => {} }] : []));
    const paintBar = () => {
      sbar.textContent = '';
      const R0 = showing() ? results[cur] : null;
      if (R0) {
        sbar.append(h('button', { class: 'chip', id: 'rn-back', disabled: running, onclick: () => backToView() }, icon('back'), t('Back to the view')),
          h('span', { class: 'rn-px', id: 'rn-px' }, `${R0.W} × ${R0.H}`));
        return;
      }
      const [W, H] = dims();
      sbar.append(h('button', { class: 'chip', id: 'rn-ratio', 'aria-haspopup': 'menu', disabled: running, onclick: e => ratioMenu(e.currentTarget) }, icon('image'), ratioLabel(st.ratio), icon('chevron')),
        h('button', { class: 'chip rn-lock', id: 'rn-lock', 'aria-pressed': String(locked), disabled: running, title: locked ? t('Unlock the view') : t('Lock the view: then it cannot be turned, zoomed or moved by accident'), onclick: () => setLock(!locked) }, icon(locked ? 'lock' : 'unlock'), locked ? t('View locked') : t('Lock view')),
        h('span', { class: 'rn-px', id: 'rn-px' }, `${W} × ${H} ` + t('pixels')));
    };
    // ── the options: the size in pixels, how, the samples (with the time they take here), the light
    const qName = q => t({ quick: 'Quick', good: 'Good', best: 'Best' }[q]);
    const counts = ptm => ptm ? PT_SAMPLES : RENDER_PASSES;
    const est = (ptm, n) => { const sp = (this.settings.renderSpeed || {})[ptm ? 'pt' : 'passes'], [W, H] = dims(); return sp ? sp * n * W * H / 1e6 : 0; };
    const twoRow = (label, items, cur0, onPick, cls) => h('div', { class: 'field' }, h('span', { class: 'flabel' }, label),
      h('div', { class: 'seg wrap two ' + cls }, ...items.map(([k, main, sub]) => h('button', { 'aria-pressed': String(cur0 === k), 'data-k': k, disabled: running, onclick: () => onPick(k) }, h('span', null, main), sub ? h('small', null, sub) : null))));
    const resRow = h('div');
    const paintRes = () => {
      resRow.textContent = '';
      const r = ratioVal();
      resRow.append(twoRow(t('Size of the picture'), renderResList().map(([k, name, L]) => { const [W, H] = renderDims(L, r); return [k, name, `${W} × ${H}`]; }), st.W ? null : st.res, k => { st.res = k; delete st.W; delete st.H; saveOpts(); paintBar(); paintOpts(); }, 'rn-res'));
    };
    const paintOpts = () => {
      opts.textContent = '';
      const ptm = st.method === 'pt';
      paintRes();
      opts.append(resRow);
      if (ptSupported()) opts.append(this.segRow(t('How'), [['pt', t('Path traced (most real)')], ['passes', t('Light passes (faster)')]], st.method, k => { st.method = k; saveOpts(); paintOpts(); paintActs(); }, running, 'rn-method'));
      const c = counts(ptm);
      opts.append(twoRow(ptm ? t('Samples') : t('Passes'), ['quick', 'good', 'best'].map(q => { const ms = est(ptm, c[q]); return [q, qName(q) + ' · ' + c[q], ms ? '≈ ' + fmtDur(ms) : '']; }), st.q, k => { st.q = k; saveOpts(); paintOpts(); paintActs(); }, 'rn-q'));
      // the grain cleaned up (path traced): also afterwards, on the picture shown, to compare
      if (ptm) opts.append(this.segRow(t('Clean up the grain'), [['on', t('On')], ['off', t('Off')]], st.dn === false ? 'off' : 'on', k => setDn(k === 'on'), running, 'rn-dn'));
      opts.append(lightRows(),
        h('p', { class: 'note-muted' }, ptm ? t('The light is followed as it really goes – bouncing off walls, floors and furniture, through the glass, from the sky and the sun. The picture gets cleaner with every sample; stop when you like it. On a computer with a good graphics chip.') + ' ' + t('Clean up the grain: the grain of few samples is smoothed out in the light only – edges, bricks and wood grain stay sharp.') : t('The view is drawn again and again with the sun, the sky and the camera moved a little each time, and averaged: soft shadows, daylight that comes in through the windows, clean edges. Stop when you like it.')));
    };
    // the light: exposure (Auto: measured), the sun, the sky, warmth, the sky behind the house – kept for next time
    const lightRows = () => {
      const Lc = renderLight();
      const save = patch => { this.settings.renderLight = Object.assign({}, this.settings.renderLight || {}, patch); Settings.save(); };
      const slider = (key, label, min, max, step, fmt) => {
        const out = h('span', { class: 'rl-val', id: 'rl-' + key + '-val' }, fmt(Lc[key]));
        const inp = h('input', { type: 'range', id: 'rl-' + key, min: String(min), max: String(max), step: String(step), value: String(Lc[key]), disabled: running, 'aria-label': label });
        inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); });
        inp.addEventListener('change', () => save({ [key]: +inp.value }));
        return h('label', { class: 'rl-row' }, h('span', { class: 'rl-lab' }, label), inp, out);
      };
      const times = v => '× ' + (+v).toFixed(1).replace('.', I18N.lang === 'en' ? '.' : ',');
      const skyBtn = h('button', { class: 'chip', id: 'rl-skybg', 'aria-pressed': String(!!Lc.skyBg), disabled: running, onclick: () => { save({ skyBg: !renderLight().skyBg }); paintOpts(); } }, Lc.skyBg ? t('On') : t('Off'));
      const reset = h('button', { class: 'btn ghost sm', id: 'rl-reset', disabled: running, onclick: () => { this.settings.renderLight = {}; Settings.save(); paintOpts(); } }, icon('restore'), t('Normal light'));
      return h('div', { class: 'field rl' }, h('span', { class: 'flabel' }, t('Light')),
        h('div', { class: 'rl-grid' },
          slider('ev', t('Exposure'), -2, 2, 0.25, v => (+v === 0 ? t('Auto') : t('Auto') + ' ' + (v > 0 ? '+' : '−') + Math.abs(v))),
          slider('sun', t('Sun'), 0, 2, 0.1, times),
          slider('sky', t('Sky'), 0, 2, 0.1, times),
          slider('warm', t('Warmth'), -1, 1, 0.25, v => (+v === 0 ? t('Neutral') : v > 0 ? t('Warmer') + ' ' + v : t('Cooler') + ' ' + Math.abs(v))),
          h('div', { class: 'rl-row' }, h('span', { class: 'rl-lab' }, t('Sky behind the house')), skyBtn, reset)));
    };
    // ── the picture: the view (live), or a render over it (growing, done, or two compared)
    const showShot = () => {
      view.textContent = '';
      const R0 = showing() ? results[cur] : null;
      view.hidden = !R0;
      shot.classList.toggle('has-result', !!R0);
      // (the progress bar only while rendering or with a picture shown)
      bar.hidden = !running && !R0;
      paintBar(); paintHint();
      if (!R0) return;
      const R1 = comparing && !running && results.length > 1 ? results[cur > 0 ? cur - 1 : 1] : null;
      if (!R1) { view.appendChild(h('div', { class: 'rn-one' }, h('img', { src: R0.url, alt: R0.name, class: 'rn-img' }), h('span', { class: 'rn-cap' }, R0.name))); return; }
      // compare: the other one on the left, this one on the right, a handle to slide
      const wrap = h('div', { class: 'rn-cmp', id: 'rn-cmp' }, h('img', { src: R0.url, alt: R0.name, class: 'rn-img' }),
        h('div', { class: 'rn-cmp-left', style: { width: '50%' } }, h('img', { src: R1.url, alt: R1.name, class: 'rn-img' })),
        h('div', { class: 'rn-cmp-line', style: { left: '50%' } }), h('span', { class: 'rn-cap left' }, R1.name), h('span', { class: 'rn-cap' }, R0.name));
      const left = wrap.querySelector('.rn-cmp-left'), line = wrap.querySelector('.rn-cmp-line');
      // (the left picture is drawn at the full picture's size and cut off by its box)
      const fitLeft = () => { const b = wrap.firstChild.getBoundingClientRect(); Object.assign(left.firstChild.style, { width: b.width + 'px', height: b.height + 'px' }); };
      const at = e => { const b = wrap.getBoundingClientRect(); const k = clamp((e.clientX - b.left) / b.width, 0, 1); left.style.width = (k * 100) + '%'; line.style.left = (k * 100) + '%'; fitLeft(); };
      wrap.addEventListener('pointerdown', e => { e.preventDefault(); try { wrap.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } at(e); });
      wrap.addEventListener('pointermove', e => { if (e.buttons) at(e); });
      wrap.addEventListener('dragstart', e => e.preventDefault());
      view.appendChild(wrap);
      if (wrap.firstChild.complete) requestAnimationFrame(fitLeft); else wrap.firstChild.onload = fitLeft;
    };
    const paintStrip = () => {
      strip.textContent = '';
      results.forEach((R0, i) => strip.appendChild(h('button', { class: 'rn-th', 'aria-pressed': String(i === cur), disabled: running, onclick: () => { cur = i; showShot(); paintStrip(); paintActs(); }, title: R0.name },
        h('img', { src: R0.thumb || R0.url, alt: '' }), h('span', null, R0.name))));
    };
    const paintActs = () => {
      acts.textContent = ''; foot.textContent = '';
      if (running) { foot.appendChild(h('button', { class: 'btn primary', id: 'rn-stop', onclick: () => { stopFlag = true; } }, icon('check'), t('Stop – keep this'))); return; }
      foot.appendChild(h('button', { class: 'btn primary', id: 'rn-start', onclick: () => go(this.shownVersion().id) }, icon('camera'), t('Start render')));
      const R0 = showing() ? results[cur] : null;
      if (!R0) return;
      const others = this.project.versions.filter(x => x.status !== 'disabled' && x.id !== R0.versionId);
      const more = R0.session ? (st.passes || counts(R0.ptm)[st.q]) : 0;
      acts.append(...[
        h('button', { class: 'btn sm primary', id: 'rn-save', onclick: () => this.saveRender(R0) }, icon('download'), t('Save picture')),
        more ? h('button', { class: 'btn sm', id: 'rn-more', onclick: () => cont() }, icon('play'), t(R0.ptm ? 'Continue (+{n} samples)' : 'Continue (+{n} passes)', { n: more })) : null,
        others.length ? h('button', { class: 'btn sm', id: 'rn-other', onclick: e => UI.menu(e.currentTarget, others.map(x => ({ label: x.name, fn: () => go(x.id, R0) }))) }, icon('copy'), t('Same view in another version')) : null,
        results.length > 1 ? h('button', { class: 'btn sm', id: 'rn-compare', 'aria-pressed': String(comparing), onclick: () => { comparing = !comparing; showShot(); paintActs(); } }, icon('split'), t('Compare')) : null].filter(Boolean));
    };
    const paintAll = () => { showShot(); paintActs(); paintOpts(); paintStrip(); };
    // the grain clean-up on or off – the picture shown (path traced, still open) at once again
    const setDn = on => {
      st.dn = on; saveOpts();
      const R0 = showing() ? results[cur] : null;
      if (R0 && R0.ptm && R0.session && R0.session.redraw) {
        try { R0.session.redraw(on); R0.url = shrinkUrl(R0.canvas, 2048, 0.9); R0.thumb = shrinkUrl(R0.canvas, 360, 0.8); R0.dn = on; } catch (e) { console.warn(e); }
        showShot(); paintStrip();
      }
      paintOpts();
    };
    // the open render (Continue) ends when the view is wanted back or another render starts
    const endSessions = () => { for (const R of results) if (R.session) { const s = R.session; R.session = null; s.end(); } };
    const backToView = () => { if (running) return; endSessions(); cur = -1; comparing = false; paintAll(); };
    // the time a sample takes here (per million pixels): for the times next to Quick, Good, Best
    const learn = (ptm, n, ms, W, H) => {
      if (n < 2 || !(ms > 0)) return;
      const per = ms / n / (W * H / 1e6), sp = Object.assign({}, this.settings.renderSpeed || {}), k = ptm ? 'pt' : 'passes';
      sp[k] = sp[k] ? sp[k] * 0.4 + per * 0.6 : per;
      this.settings.renderSpeed = sp; Settings.save();
    };
    const progress = (R0, n0, total, ptm) => (n, ms) => {
      bar.firstChild.style.width = Math.round(n / total * 100) + '%';
      const runMs = ms - R0.ms0, done = n - n0;
      const left = done >= 3 ? runMs / done * (total - n) : 0;
      status.textContent = t(ptm ? 'Sample {n} of {m} · {s} s' : 'Pass {n} of {m} · {s} s', { n, m: total, s: Math.round(ms / 1000) }) + (left > 1500 ? ' · ' + t('about {t} left', { t: fmtDur(left) }) : '');
    };
    const painter = R0 => (cv, n, ms) => { R0.url = shrinkUrl(cv, 1600, 0.85); R0.n = n; R0.ms = ms; if (results[cur] === R0) showShot(); };
    const finish = (R0, res) => {
      R0.canvas = res.canvas; R0.url = shrinkUrl(res.canvas, 2048, 0.9); R0.thumb = shrinkUrl(res.canvas, 360, 0.8); R0.n = res.n; R0.ms = res.ms; R0.W = res.W; R0.H = res.H;
      status.textContent = t(res.pt ? '{n} samples in {s} s · {w} × {h} pixels' : '{n} passes in {s} s · {w} × {h} pixels', { n: res.n, s: Math.round(res.ms / 1000), w: res.W, h: res.H });
      bar.firstChild.style.width = '100%';
    };
    // render the view of version vid: the framing in the window – or, for another version, as the picture `like`
    const go = async (vid, like) => {
      if (running) return;
      endSessions();
      running = true; stopFlag = false; comparing = false; cur = -1;
      let R0 = null;
      paintAll();
      // (the picture in sight while it grows, also when you were down at the options)
      try { shot.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* fine */ }
      try {
        let v = lend();
        // (the 3D view was started again after the graphics card stopped: wait for the new one)
        if (!v) { status.textContent = t('Starting the 3D view again…'); await this.waitView3d(); v = lend(); if (v && liveCam) { v.setViewState(liveCam); v.needs = true; await this.waitView3d(); } }
        const cam = like ? like.cam : (v ? v.viewState() : liveCam);
        if (v && !like) liveCam = cam;
        if (vid !== this.shownVersion().id) {
          status.textContent = t('Building the other version…');
          this.setActiveVersion(vid);
          await this.waitView3d(); v = lend();
        }
        // (another version: from where the picture it goes with was taken)
        if (like && v && cam) { v.setViewState(cam); v.needs = true; await this.waitView3d(); v = lend(); }
        if (!v || closed) return;
        const ptm = st.method === 'pt' && ptSupported();
        const [W, H] = like && like.W ? [like.W, like.H] : dims();
        const ver = this.shownVersion(), passes = st.passes || counts(ptm)[st.q] || 160;   // (st.passes: the tests)
        R0 = { name: ver.name, versionId: ver.id, url: '', n: 0, ms: 0, ms0: 0, cam, ptm, W, H };
        results.push(R0); cur = results.length - 1;
        status.textContent = t(ptm ? 'Sample {n} of {m} · {s} s' : 'Pass {n} of {m} · {s} s', { n: 0, m: passes, s: 0 }); bar.firstChild.style.width = '0%';
        paintStrip();
        const res = await (ptm ? renderPathTraced : renderView3d)(v, { passes, W, H, keep: true, denoise: st.dn !== false, stop: () => stopFlag || closed, onPass: progress(R0, 0, passes, ptm), onPaint: painter(R0),
          onPrep: () => { status.textContent = t('Preparing the house for path tracing (once per render)…'); } });
        R0.session = res.more && !closed ? res : null;
        if (res.more && closed) res.end();
        finish(R0, res);
        learn(ptm, res.n, ptm ? res.msSampling : res.ms, res.W, res.H);
      } catch (e) {
        console.error(e);
        status.textContent = e && e.lost ? e.message : t('The render stopped: {e}', { e: String(e && e.message || e) });
        // nothing (or a black picture) to keep: no thumbnail for it
        const k = results.findIndex(x => !x.canvas);
        if (k >= 0) { results.splice(k, 1); cur = results.length - 1; }
      }
      finally { running = false; if (!closed) paintAll(); }
    };
    // Continue: more samples (passes) on the same picture
    const cont = async () => {
      const R0 = results[cur];
      if (running || !R0 || !R0.session) return;
      running = true; stopFlag = false; comparing = false;
      const extra = st.passes || counts(R0.ptm)[st.q], n0 = R0.n, total = n0 + extra, s0 = R0.session.msSampling || R0.ms;
      R0.ms0 = R0.ms;
      paintAll();
      try { shot.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* fine */ }
      try {
        const res = await R0.session.more(extra, { denoise: st.dn !== false, stop: () => stopFlag || closed, onPass: progress(R0, n0, total, R0.ptm), onPaint: painter(R0) });
        finish(R0, res);
        learn(R0.ptm, res.n - n0, (R0.ptm ? res.msSampling : res.ms) - s0, res.W, res.H);
      } catch (e) {
        console.error(e);
        R0.session = null;
        status.textContent = e && e.lost ? e.message : t('The render stopped: {e}', { e: String(e && e.message || e) });
      }
      finally { running = false; if (!closed) paintAll(); }
    };
    // (the 3D view may be started anew meanwhile – after the graphics card stopped: its picture into the frame again)
    const syncT = setInterval(() => {
      if (closed) return;
      if (lent && lent.ok && !lent.destroyed && !lent.lost && !lent.rendering) liveCam = lent.viewState();
      if (running) return;
      const pane = this.panes.find(p => p.kind === '3d'), v = pane && pane.view;
      if (v && v !== lent && v.ok && !v.destroyed && !v.lost && v.renderer) { lend(); if (liveCam) { v.setViewState(liveCam); v.needs = true; } paintHint(); }
    }, 400);
    paintAll();
    const done = UI.dialog({ title: t('Photo render'), body, wide: true, onOpen: d => { d.classList.add('rn-dialog'); const f = d.querySelector('.dlg-foot'); if (f) f.appendChild(foot); }, actions: [{ label: t('Close'), value: null }] });
    // the view's picture into the window's frame, as large as it goes
    requestAnimationFrame(() => { fitFrame(); lend(); paintHint(); });
    done.then(() => { closed = true; stopFlag = true; });
    await done;
    while (running) await new Promise(r => setTimeout(r, 100));
    clearInterval(syncT); ro.disconnect();
    endSessions();
    if (lent && lent.borrowed) { if (lent.ok && !lent.destroyed) liveCam = lent.viewState(); try { lent.giveBack(); } catch (e) { /* gone */ } }
    // back to the version you were looking at (from where you framed the photo)
    if (this.shownVersion().id !== startVersion || this.display !== startDisplay) {
      if (startDisplay === 'original') this.setDisplay('original'); else this.setActiveVersion(startVersion);
      const v = await this.waitView3d();
      if (v && liveCam) { v.setViewState(liveCam); v.needs = true; }
    }
    if (prevSel) this.select(prevSel);
    this.lastRenders = results;
  },
  /** the picture as a PNG file: house, version, date */
  saveRender(R0) {
    if (!R0 || !R0.canvas) return;
    R0.canvas.toBlob(blob => this.downloadBlob(`${slugify(this.project.name)}_${slugify(R0.name)}_${t('render')}_${isoDay(Date.now())}.png`, blob), 'image/png');
  },
});

/* ───────── path traced (three-gpu-pathtracer, on computers) ─────────
   The light followed as it really goes: from the camera into the house, bouncing off walls, floors and furniture
   (their colours bleed onto each other), through the glass, out to the sky (the real sky picture, texlib.js) and the
   sun. Every sample adds one more bounce path per pixel; the picture gets cleaner the longer it runs. It needs WebGL 2
   and a computer's graphics chip (a phone would take far too long), and a moment first to sort the house's
   triangles (a BVH). */
const PT_SAMPLES = { quick: 64, good: 256, best: 1024 };
const ptSupported = () => !window.matchMedia('(pointer: coarse)').matches;
// one piece of work handed to the graphics card at a time: about this long (ms). Windows resets a graphics card that
// is busy with one piece for 2 s, and the browser then loses every 3D picture of the page (1 Nov: Best came out black)
const PT_TILE_MS = 120;
// the light of a path traced picture (1 Nov, evening): the sky picture without its sun as the sky's light (PT_SKY ×
// its own values), the app's sun with the photo's own sun:sky balance (its sun's light, sunE), the exposure measured from
// the picture like a camera does (PT_KEY: the middle grey the picture's average is put at)
const PT_SKY = 1, PT_KEY = 0.18;
/** the render's light: exposure (ev, steps of light: +1 twice as light), the sun and the sky (×), warmth (−1 cool …
 *  +1 warm), the sky behind the house (skyBg) – the settings' renderLight over these */
const RENDER_LIGHT = { ev: 0, sun: 1, sky: 1, warm: 0, skyBg: true };
const renderLight = o => Object.assign({}, RENDER_LIGHT, (app.settings && app.settings.renderLight) || {}, o || {});
/** warmth as a colour balance: gains for red and blue (in light, not screen values) */
const warmGains = w => [1 + 0.14 * w, 1, 1 - 0.14 * w];
/** a canvas's colours warmed or cooled (in light values) */
function warmCanvas(cv, w) {
  if (!w) return;
  const g = cv.getContext('2d'), img = g.getImageData(0, 0, cv.width, cv.height), d = img.data, [gr, , gb] = warmGains(w);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = LIN2SRGB[Math.min(4096, (SRGB2LIN[d[i]] * gr * 4096) | 0)];
    d[i + 2] = LIN2SRGB[Math.min(4096, (SRGB2LIN[d[i + 2]] * gb * 4096) | 0)];
  }
  g.putImageData(img, 0, 0);
}
/** an error when the browser lost the 3D drawing (the graphics card was reset) */
const lostError = () => Object.assign(new Error(t('The graphics card stopped (the picture was too heavy for it at that moment). The 3D view starts again by itself – try again, or choose Quick or As the view.')), { lost: true });
/** is a picture (canvas) all black or empty? (a few points looked at) */
function canvasBlank(cv) {
  const N = 24, c = makeCanvas(N, N), g = c.getContext('2d');
  g.drawImage(cv, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data;
  let mx = 0;
  for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, d[i + 3] ? d[i] + d[i + 1] + d[i + 2] : 0);
  return mx < 12;
}
/** wait (without blocking the page) until the graphics card has done everything handed to it; → ms waited */
async function gpuDone(gl, lost) {
  const t0 = performance.now();
  if (!gl.fenceSync) return 0;
  const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!s) return 0;
  gl.flush();
  try {
    for (;;) {
      const st = gl.clientWaitSync(s, 0, 0);
      if (st === gl.ALREADY_SIGNALED || st === gl.CONDITION_SATISFIED || st === gl.WAIT_FAILED || lost()) break;
      await new Promise(res => setTimeout(res, 1));
      if (performance.now() - t0 > 30000) break;
    }
  } finally { gl.deleteSync(s); }
  return performance.now() - t0;
}
async function renderPathTraced(v, opts) {
  const { size } = opts;
  let { onPaint, stop, onPass } = opts;
  const r = v.renderer, cam = v.camera, gl = r.getContext();
  if (v.lost || gl.isContextLost()) throw lostError();
  const [W, H] = opts.W ? [opts.W, opts.H] : renderSize(v, size);
  const { WebGLPathTracer } = await addon('gpu-pathtracer/pathtracer.js');
  const L = renderLight(opts.light);
  const keep = { pr: r.getPixelRatio(), view: cam.view && cam.view.enabled ? { ...cam.view } : null, aspect: cam.aspect, env: v.scene.environment, envI: v.scene.environmentIntensity, envR: v.scene.environmentRotation.clone(), bg: v.scene.background, bgI: v.scene.backgroundIntensity, bgR: v.scene.backgroundRotation.clone(), glow: v.glowGroup ? v.glowGroup.visible : null, exp: r.toneMappingExposure, sunI: v.sun ? v.sun.intensity : 0 };
  v.rendering = true;
  if (v.nearSunEnd) v.nearSunEnd();
  let t0 = performance.now(), msDone = 0, tS = 0, msSampling = 0;
  const out = makeCanvas(W, H), og = out.getContext('2d');
  let pt = null, n = 0, lost = false;
  const onLost = () => { lost = true; };
  r.domElement.addEventListener('webglcontextlost', onLost);
  const isLost = () => lost || gl.isContextLost();
  // the picture so far onto our canvas: drawn to the screen and copied in one go (the screen's copy is gone later)
  // the grain cleaned up (denoise.js) – in the picture taken, not while sampling: the light smoothed, the surfaces kept
  let dn = null, dnOn = opts.denoise !== false && typeof makeDenoiser === 'function', dnNow = false;
  const dnMake = () => { if (dn || !dnOn) return; try { dn = makeDenoiser(r, v.scene, cam, W, H); } catch (e) { console.warn(e); dn = null; dnOn = false; } };
  const grab = () => { dnNow = dnOn && !!dn; pt.pausePathTracing = true; try { pt.renderSample(); } finally { pt.pausePathTracing = false; dnNow = false; } og.drawImage(r.domElement, 0, 0, W, H); warmCanvas(out, L.warm); };
  // the exposure, like a camera's light meter: the picture's average (the middle of its light, the brightest tenth
  // left out – the sky, glints) put at PT_KEY, then the steps asked for
  let metered = 0;
  const meter = () => {
    const tg = pt.target;
    // (a fixed exposure asked for: the view's, with the steps of the Light)
    if (!tg || opts.meter === false) { metered = metered || 1; return; }
    const tw = tg.width, th = tg.height, half = tg.texture.type === THREE.HalfFloatType, F = THREE.DataUtils.fromHalfFloat;
    const buf = half ? new Uint16Array(tw * 4) : new Float32Array(tw * 4), logs = [];
    for (let k = 0; k < 24; k++) {
      r.readRenderTargetPixels(tg, 0, Math.floor((k + 0.5) / 24 * th), tw, 1, buf);
      for (let x = 0; x < tw; x += 3) {
        const i = x * 4, R = half ? F(buf[i]) : buf[i], G = half ? F(buf[i + 1]) : buf[i + 1], B = half ? F(buf[i + 2]) : buf[i + 2];
        const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        if (lum > 1e-5 && Number.isFinite(lum)) logs.push(Math.log(lum));
      }
    }
    if (!logs.length) return;
    logs.sort((a, b) => a - b);
    const use = logs.slice(0, Math.max(1, Math.floor(logs.length * 0.9)));
    const gm = Math.exp(use.reduce((a, b) => a + b, 0) / use.length);
    r.toneMappingExposure = clamp(PT_KEY / gm, 0.02, 50) * Math.pow(2, L.ev);
    metered = pt.samples;
  };
  // everything back as it was
  let ended = false, kept = false, meta = {}, tiles = 1, runTo = null;
  const restore = () => {
    if (ended) return;
    ended = true;
    r.domElement.removeEventListener('webglcontextlost', onLost);
    if (pt) { try { pt.dispose(); } catch (e) { /* fine */ } }
    if (dn) { try { dn.dispose(); } catch (e) { /* fine */ } dn = null; }
    v.scene.environment = keep.env; v.scene.environmentIntensity = keep.envI; v.scene.environmentRotation.copy(keep.envR); v.scene.background = keep.bg;
    v.scene.backgroundIntensity = keep.bgI; v.scene.backgroundRotation.copy(keep.bgR);
    if (v.sun) v.sun.intensity = keep.sunI;
    if (v.glowGroup && keep.glow != null) v.glowGroup.visible = keep.glow;
    r.toneMappingExposure = keep.exp;
    r.setPixelRatio(keep.pr);
    cam.aspect = keep.aspect;
    if (keep.view) cam.setViewOffset(keep.view.fullWidth, keep.view.fullHeight, keep.view.offsetX, keep.view.offsetY, keep.view.width, keep.view.height); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    r.shadowMap.needsUpdate = true;
    v.rendering = false;
    v.resize();
    v.needs = true;
  };
  try {
    // the real sky lights and shows; the halo sprites of the evening are not part of a photo
    // (the sky without its sun: the app's sun is the sun, at its height for the day and hour)
    const sky = libSkyNoSun(v.evening ? 'sunset' : 'day');
    if (sky) {
      const kEnv = PT_SKY * L.sky * (v.evening ? 0.15 * Math.min(3, 0.6 / Math.max(0.05, sky.userData.avg)) : 1);
      v.scene.environment = sky;
      v.scene.environmentIntensity = kEnv;
      // turned so that its bright side (where its sun was) is where the app's sun is
      const d = v.sun ? v.sun.position.clone().sub(v.sun.target.position) : new THREE.Vector3(1, 1, 0);
      v.scene.environmentRotation.set(0, Math.atan2(d.z, d.x) - (sky.userData.sunU - 0.5) * Math.PI * 2, 0);
      // the sky behind the house (else the view's plain background)
      if (L.skyBg) { v.scene.background = sky; v.scene.backgroundIntensity = kEnv; v.scene.backgroundRotation.copy(v.scene.environmentRotation); }
      // the sun: the photo's own sun (its light on a surface facing it), weaker when low, as the app's sun is
      if (!v.evening && v.sun && sky.userData.sunE && v.sun.intensity > 0) {
        const el = v.sunInfo ? v.sunInfo.el : 45, rel = (0.45 + 1.2 * clamp(Math.sin(el * Math.PI / 180) * 2.4, 0, 1)) / 1.65;
        v.sun.intensity = PT_SKY * sky.userData.sunE * rel * L.sun;
      }
    }
    r.toneMappingExposure = keep.exp * Math.pow(2, L.ev);
    if (v.glowGroup) v.glowGroup.visible = false;
    r.setPixelRatio(1);
    r.setSize(W, H, false);
    cam.aspect = W / H; cam.clearViewOffset(); cam.updateProjectionMatrix();
    pt = new WebGLPathTracer(r);
    pt.renderDelay = 0; pt.fadeDuration = 0; pt.minSamples = 0; pt.dynamicLowRes = false; pt.renderScale = 1;
    if (pt.textureSize) pt.textureSize.set(1024, 1024);
    // light bounces: enough for daylight in rooms; every one more makes each piece of work longer
    pt.bounces = 6;
    if ('transmissiveBounces' in pt) pt.transmissiveBounces = 4;
    // the sun's glints on glass, water and metal blurred a little after the first bounce: no white specks
    pt.filterGlossyFactor = 0.5;
    // pieces of about a quarter million pixels to start with; smaller when one takes long (below)
    // (a piece at least about 48 pixels across: more pieces than that only cost)
    const maxTiles = clamp(Math.floor(Math.min(W, H) / 48), 1, 16);
    tiles = clamp(Math.ceil(Math.sqrt(W * H / 250000)), Math.min(2, maxTiles), maxTiles);
    pt.tiles.set(tiles, tiles);
    // (sorting the triangles takes a moment; the async way needs a web worker, which a single file can't start)
    if (opts.onPrep) opts.onPrep();
    await new Promise(res => setTimeout(res, 30));
    // (the path tracer multiplies a material's colour with its picture; the soft-lit ones – a colour over a grey
    //  light-and-dark picture, texlib.js – have their colour doubled for it, as the grey's middle is half)
    const soft = new Set();
    v.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) if (m && m.userData && m.userData.soft && m.map) soft.add(m); });
    for (const m of soft) { m.userData.ptColor = m.color.clone(); m.color.multiplyScalar(2); }
    try { pt.setScene(v.scene, cam); } finally { for (const m of soft) { m.color.copy(m.userData.ptColor); delete m.userData.ptColor; } }
    // (the picture to the screen: cleaned of its grain when it is taken – grab)
    pt.renderToCanvasCallback = (target, rr, quad) => {
      const map0 = quad.material.map;
      if (dnNow && dn) { try { quad.material.map = dn.run(target.texture, pt.samples); } catch (e) { console.warn(e); } }
      const ac = rr.autoClear; rr.autoClear = false;
      try { quad.render(rr); } finally { rr.autoClear = ac; quad.material.map = map0; }
    };
    dnMake();
    // (the time per sample is counted from here: the sorting above is once per render)
    tS = performance.now();
    let slow = 0;
    // the samples up to total (more of them after Continue: the same picture gets cleaner)
    runTo = async total => {
      let last = 0;
      const r0 = performance.now();
      while (n < total && !(stop && stop())) {
        if (isLost()) throw lostError();
        pt.renderSample();
        const ms = await gpuDone(gl, isLost);
        if (isLost()) throw lostError();
        // a piece took long: smaller pieces from the next sample on
        if (ms > PT_TILE_MS && tiles < maxTiles) { if (++slow >= 2 || ms > PT_TILE_MS * 4) { tiles = Math.min(maxTiles, Math.ceil(tiles * 1.5)); pt.tiles.set(tiles, tiles); slow = 0; } } else slow = 0;
        n = Math.floor(pt.samples || 0);
        // the exposure measured after the first sample, again after 4 and 16 (the picture settles)
        if (n >= 1 && (!metered || (metered < 4 && n >= 4) || (metered < 16 && n >= 16))) meter();
        const el = msDone + performance.now() - t0;
        if (onPass) onPass(Math.min(n, total), el);
        if (onPaint && performance.now() - r0 - last > 1000 && n > 0) { last = performance.now() - r0; grab(); onPaint(out, n, el); }
        await new Promise(res => setTimeout(res, 0));
      }
      if (isLost()) throw lostError();
      if (!metered && n >= 1) meter();
      grab();
      if (canvasBlank(out)) throw new Error(t('The picture came out black – nothing was kept. Try again, or choose Light passes.'));
      if (onPaint) onPaint(out, n, msDone + performance.now() - t0);
    };
    await runTo(opts.passes || 256);
    meta = { exposure: r.toneMappingExposure, sun: v.sun ? v.sun.intensity : 0, sky: v.scene.environmentIntensity, denoised: dnOn && !!dn };
    kept = !!opts.keep;
  } finally {
    msDone += performance.now() - t0;
    if (tS) msSampling += performance.now() - tS;
    if (!kept) restore();
  }
  const res = { canvas: out, n, ms: msDone, msSampling, W, H, pt: true, tiles, ...meta };
  if (kept) {
    res.more = async (extra, o = {}) => {
      if (ended) throw new Error('ended');
      ({ onPaint, stop, onPass } = o);
      if ('denoise' in o) { dnOn = o.denoise !== false && typeof makeDenoiser === 'function'; dnMake(); }
      t0 = tS = performance.now();
      try { await runTo(n + extra); }
      catch (e) { restore(); throw e; }
      finally { msDone += performance.now() - t0; msSampling += performance.now() - tS; }
      return Object.assign(res, { n, ms: msDone, msSampling });
    };
    res.end = () => { try { restore(); } catch (e) { /* the view is gone */ } };
    /** the picture taken again, cleaned of its grain or not (no more samples) */
    res.redraw = on => {
      if (ended) throw new Error('ended');
      dnOn = !!on && typeof makeDenoiser === 'function'; dnMake();
      grab();
      return Object.assign(res, { denoised: dnOn && !!dn });
    };
  }
  return res;
}
