/* ───────────── autoexp.js — the 3D view's exposure follows what you look at, like your eyes or a camera ─────────────
   With one fixed exposure the front in the shade (the north side) looks too dark next to a sunlit view. Now the picture
   is measured – a dozen rows of it, about 96 points each, copied on the graphics chip without waiting – a moment after
   the camera stops (also after walking): the log-average of its
   light (screen values back to light values, divided by the exposure it had), the brightest tenth (the sky, glints)
   left out. The exposure then goes smoothly – over about half a second – towards (AE_REF ÷ that)^AE_POW: a sunny overview
   stays as it was, a front in the shade or a close look at the dark roof is brought up (at most AE_MAX); never darker
   than the normal view (AE_MIN 1) – the rooms are lit evenly in the normal view, so a light room only means white walls,
   and those stay white. Not in the evening (the dark is meant there) and not in the small views. Settings → 3D quality →
   Exposure. */
const AE_REF = 0.054;  // the log-average light of the overview of the house by day, from its picture (measured 0.054): there it stays 1
const AE_POW = 0.5;    // half way: a darker view is brought up, not made as light as a sunny one (as your eyes do)
const AE_MIN = 1.0, AE_MAX = 1.8;
const AE_LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });

Object.assign(View3D.prototype, {
  aeOn() {
    return this.ok && !this.evening && !(this.opts && this.opts.mini) && !this._aeBroken && !(this.app && this.app.settings && this.app.settings.autoExposure === false);
  },
  /** right after a picture was drawn (view3d.js loop), when a measuring was asked for: a dozen rows of the picture are
   *  copied – on the graphics chip, without waiting for it (a reading that waits holds the page until the chip has
   *  finished the whole picture: seconds on a slow one). aeStep collects them when they are there. (Not a separate drawing
   *  of the scene into a light-value target: that needs every material's shader made again for it.) */
  aeTake() {
    if (!this._aeWant) return;
    this._aeWant = false;
    if (this._aeRead) return;
    try {
      const r = this.renderer, gl = r.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, rows = 12;
      if (!W || !H || !gl.fenceSync) return;
      r.setRenderTarget(null);
      const pbo = this._aePbo || (this._aePbo = gl.createBuffer());
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, rows * W * 4, gl.STREAM_READ);
      for (let k = 0; k < rows; k++) gl.readPixels(0, Math.floor((k + 0.5) / rows * H), W, 1, gl.RGBA, gl.UNSIGNED_BYTE, k * W * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      this._aeRead = { fence, W, rows, exposure: r.toneMappingExposure, jump: this._aeJump };
      this._aeJump = false;
    } catch (e) {
      // (a device that can't read its picture back: the fixed exposure)
      console.warn(e);
      this._aeBroken = true;
    }
  },
  /** the copied rows, once the graphics chip has them: the light of the view (log-average, the brightest tenth left out,
   *  before the exposure) → the exposure aimed at */
  aeCollect() {
    const rd = this._aeRead;
    if (!rd) return;
    const gl = this.renderer.getContext();
    const st = gl.clientWaitSync(rd.fence, 0, 0);
    if (st === gl.TIMEOUT_EXPIRED) return;
    this._aeRead = null;
    gl.deleteSync(rd.fence);
    if (st === gl.WAIT_FAILED) return;
    const data = new Uint8Array(rd.rows * rd.W * 4), lin = AE_LIN, logs = [], step = Math.max(1, Math.floor(rd.W / 96));
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._aePbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, data);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    for (let k = 0; k < rd.rows; k++) for (let x = step >> 1; x < rd.W; x += step) {
      const i = (k * rd.W + x) * 4, l = 0.2126 * lin[data[i]] + 0.7152 * lin[data[i + 1]] + 0.0722 * lin[data[i + 2]];
      if (l > 1e-4) logs.push(Math.log(l));
    }
    if (logs.length < 20) return;
    logs.sort((a, b) => a - b);
    const use = logs.slice(0, Math.max(1, Math.floor(logs.length * 0.9)));
    const L = Math.exp(use.reduce((a, b) => a + b, 0) / use.length) / Math.max(0.05, rd.exposure);
    this._aeL = L; this._aeT = clamp(Math.pow(AE_REF / L, AE_POW), AE_MIN, AE_MAX);
    // (the light itself changed – another hour, another day: the exposure goes with it at once, no glide)
    if (rd.jump) this._aeK = this._aeT;
  },
  /** every frame (view3d.js loop): measure when due, glide the exposure; → true when the picture must be drawn again */
  aeStep(active) {
    const now = performance.now(), dt = Math.min(250, now - (this._aeLT || now));
    this._aeLT = now;
    const r = this.renderer, base = this.evening ? 1.1 : 1.0, on = this.aeOn();
    if (this._aeRead) { try { this.aeCollect(); } catch (e) { console.warn(e); this._aeRead = null; this._aeBroken = true; } }
    // (while you move – turning, walking – nothing is measured: a moment after you stop, as your eyes adapt; when the
    //  light changes by itself – the sun playing through the day, a new build – a second later, and on while it goes on;
    //  not for anything else that is drawn again – a window made wider is the same view)
    if (on && active) { this._aeDue = now + 320; this._aeJump = false; }
    else if (on && this._aeLight && !this._aeDue) { this._aeDue = now + 1000; this._aeJump = true; }
    this._aeLight = false;
    // due: the next picture is drawn and measured (aeTake)
    let draw = false;
    // (not while the house's shaders are still being prepared: that picture is not drawn yet)
    if (on && this._aeDue && now >= this._aeDue && !this.rendering && !this._warming) { this._aeDue = 0; this._aeLast = now; this._aeWant = true; draw = true; }
    const T = on ? (this._aeT || 1) : 1;
    // (switched off – Always the same, the evening: at once)
    if (!on) this._aeK = 1;
    let k = this._aeK || 1;
    k = Math.abs(T - k) > 0.01 ? k + (T - k) * (1 - Math.exp(-dt / 160)) : T;
    this._aeK = k;
    const want = base * k;
    if (Math.abs(r.toneMappingExposure - want) > 1e-4) { r.toneMappingExposure = want; draw = true; }
    return draw;
  },
  aeDispose() {
    try { const gl = this.renderer.getContext(); if (this._aeRead) gl.deleteSync(this._aeRead.fence); if (this._aePbo) gl.deleteBuffer(this._aePbo); } catch (e) { /* the drawing is gone */ }
    this._aeRead = null; this._aePbo = null;
  },
});
