/* ───────────── smooth.js — phones: smoother turning and walking, and no stutter at the first 3D picture ─────────────
   1. On a phone or tablet (touch, no mouse) with a sharp screen the 3D view draws at 60 % of its sharpness while you
      turn, pan, zoom, glide or walk – a third of the pixels, so the picture keeps up with your finger – and sharp
      again a quarter of a second after it stops. Computers and the Fast quality (already one pixel per pixel) keep it.
   2. Every material of a newly built house is prepared on the graphics chip in the background (renderer.compile,
      then each shader is asked whether it is ready – like three's compileAsync, but safe when the house is built
      again meanwhile) before it is drawn: the first picture then doesn't freeze the screen while the shaders compile.
      Until that is done (at most 4 s) the view keeps the picture it had. */

const SMOOTH_LOW = 0.6;          // the sharpness while moving
const SMOOTH_SETTLE = 250;       // ms after the last movement: sharp again
const WARM_MAX = 4000;           // never wait longer for the shaders

Object.assign(View3D.prototype, {
  /** set up once (constructor): is this a phone with a sharp screen? */
  smoothSetup() {
    const coarse = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
    this._fullPR = this.renderer.getPixelRatio();
    this._adapt = coarse && !this.fast && !this.opts.mini && this._fullPR > 1;
    this._low = false;
  },
  /** every frame: lower while moving, back up once still */
  smoothStep(moving) {
    if (!this._adapt || this.rendering) return;
    const now = performance.now();
    if (moving) {
      this._moveT = now;
      if (!this._low) { this._low = true; this.smoothRes(this._fullPR * SMOOTH_LOW); }
      // (a timer, not the next frame: a browser may pause frames once nothing moves)
      clearTimeout(this._resT);
      this._resT = setTimeout(() => this.smoothBack(), SMOOTH_SETTLE + 20);
    } else this.smoothBack();
  },
  smoothBack() {
    if (!this._low || !this.renderer) return;
    const since = performance.now() - (this._moveT || 0);
    if (since < SMOOTH_SETTLE) { clearTimeout(this._resT); this._resT = setTimeout(() => this.smoothBack(), SMOOTH_SETTLE - since + 20); return; }
    this._low = false;
    this.smoothRes(this._fullPR);
    this.needs = true;
  },
  smoothRes(pr) {
    this.renderer.setPixelRatio(pr);
    if (this.ao) this.ao.resize();
    this.applyViewOffset && this.applyViewOffset();
  },
  /** after a build: prepare the shaders of every material in the background */
  prewarm() {
    const r = this.renderer;
    if (!r || !r.compile || this.opts.noBatch) return;
    const id = (this._warmId || 0) + 1;
    this._warmId = id;
    this._warming = true;
    this.warmCount = (this.warmCount || 0) + 1;
    const done = () => { if (this._warmId === id && this._warming) { this._warming = false; this.needs = true; } };
    // (three's own compileAsync breaks when the house is built again while it waits – a material it waits for is then
    //  gone; so: compile, then ask each shader that still exists whether it is ready)
    let mats = null;
    try { mats = r.compile(this.scene, this.camera); } catch (e) { mats = null; }
    if (!mats || typeof mats.forEach !== 'function') { done(); return; }
    const check = () => {
      if (this._warmId !== id || !this._warming || !this.renderer) return;
      for (const m of [...mats]) {
        let ready = true;
        try { const prog = r.properties.get(m).currentProgram; ready = !prog || !prog.isReady || prog.isReady(); } catch (e) { ready = true; }
        if (ready) mats.delete(m);
      }
      if (mats.size) setTimeout(check, 10); else done();
    };
    setTimeout(check, 0);
    setTimeout(done, WARM_MAX);
  },
});
