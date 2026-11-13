/* ───────────── sunnear.js — sharper sun shadows close by while walking (cascaded shadow maps) ─────────────
   The usual sun is one DirectionalLight whose shadow map covers the whole plot: around you, walking, a shadow edge is
   a few centimetres soft. While you walk (on a computer, Beautiful and High) the sun is three.js's SunLight instead
   (r187, examples/jsm/lights): two shadow maps that follow the view – a sharp one for the first metres, one for the
   rest up to 70 m. The usual sun is switched off meanwhile; its direction, colour and strength are copied to the
   SunLight every frame (sun.js, Evening and the photo render keep setting the usual sun). Phones keep the one map:
   two maps drawn on every step cost more than a phone has to spare. */
const NEAR_SUN = { far: 70, mods: null, p: null, failed: false };
Object.assign(View3D.prototype, {
  nearSunWanted() {
    if (!this.walker || this.fast || this.opts.mini || this.rendering || this._nearSunOff || NEAR_SUN.failed) return false;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return false;
    return !!(this.sun && this.sun.castShadow);
  },
  /** every frame (loop): switch to the SunLight while walking, back after; keep it in step with the usual sun */
  nearSunStep() {
    const want = this.nearSunWanted();
    if (want && !this.csmSun) {
      if (!NEAR_SUN.mods) {
        if (!NEAR_SUN.p) NEAR_SUN.p = addon('lights/SunLight.js').then(m => { NEAR_SUN.mods = m; }).catch(e => { console.warn('near sun', e); NEAR_SUN.failed = true; });
        NEAR_SUN.p.then(() => { this.needs = true; });
        return;
      }
      const s = new NEAR_SUN.mods.SunLight(this.sun.color.clone(), this.sun.intensity);
      s.castShadow = true;
      const n = this.high ? 2048 : 1024;
      s.shadow.mapSize.set(n, n);
      s.shadow.camera.far = NEAR_SUN.far;
      s.shadow.bias = this.sun.shadow.bias;
      s.shadow.normalBias = this.sun.shadow.normalBias;
      s.shadow.radius = 1.5;
      this.scene.add(s);
      this.csmSun = s;
      this.sun.visible = false;
      this.shadowDirty = true;
    } else if (!want && this.csmSun) this.nearSunEnd();
    const s = this.csmSun;
    if (s) {
      s.position.copy(this.sun.position).sub(this.sun.target.position).normalize().multiplyScalar(100);
      s.color.copy(this.sun.color);
      s.intensity = this.sun.intensity;
    }
  },
  nearSunEnd() {
    if (!this.csmSun) return;
    this.scene.remove(this.csmSun);
    this.csmSun.dispose();
    this.csmSun = null;
    this.sun.visible = true;
    this.shadowDirty = true;
    this.needs = true;
  },
});
