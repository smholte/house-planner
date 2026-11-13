/* A pretend AR phone for the tests (the test browser has no camera and no AR): navigator.xr with an "immersive-ar"
   session that three.js can draw into (an XRWebGLLayer on the page's own canvas), a viewer standing in the room, and
   hit testing against a flat floor. The test moves the viewer or sets the spot the hit test finds:
     window.__fakeXR.hitAt = { x, y, z }   (null: where the viewer's middle ray meets the floor)
     window.__fakeXR.viewer = { x, y, z, yaw, pitch }
   Counts: __fakeXR.sessions (started), __fakeXR.ended, __fakeXR.frames. Only for tests – never part of the app. */
(() => {
  // three.js (r187) asks for an XRWebGLBinding when the browser has one; it only accepts a real XRSession, so the
  // pretend phone has none (as phones without WebXR layers): three.js then uses the plain XRWebGLLayer
  try { Object.defineProperty(window, 'XRWebGLBinding', { value: undefined, configurable: true, writable: true }); } catch (e) { /* fine */ }
  const S = window.__fakeXR = { viewer: { x: 0, y: 1.5, z: 0, yaw: 0, pitch: -0.7 }, floorY: 0, hitAt: null, sessions: 0, ended: 0, frames: 0, lastInit: null, supported: true };
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const T = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  const RY = a => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
  const RX = a => [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1];
  const viewerM = () => { const v = S.viewer; return mul(mul(T(v.x, v.y, v.z), RY(v.yaw)), RX(v.pitch)); };
  const invRigid = m => { // inverse of a rotation + translation
    const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
    const t = [m[12], m[13], m[14]];
    r[12] = -(r[0] * t[0] + r[4] * t[1] + r[8] * t[2]); r[13] = -(r[1] * t[0] + r[5] * t[1] + r[9] * t[2]); r[14] = -(r[2] * t[0] + r[6] * t[1] + r[10] * t[2]);
    return r;
  };
  const proj = (aspect) => { const f = 1 / Math.tan(30 * Math.PI / 180), n = 0.05, fa = 100; return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]; };
  const hit = () => {
    if (S.hitAt) return S.hitAt;
    const m = viewerM(), d = [-m[8], -m[9], -m[10]], p = [m[12], m[13], m[14]];
    if (d[1] >= -1e-3) return null;
    const k = (S.floorY - p[1]) / d[1];
    return { x: p[0] + d[0] * k, y: S.floorY, z: p[2] + d[2] * k };
  };
  const F32 = a => new Float32Array(a);
  class FakeSpace { constructor(type) { this.type = type; } getOffsetReferenceSpace() { return this; } }
  class FakeLayer {
    constructor(session, gl) { this.framebuffer = null; this.framebufferWidth = gl.drawingBufferWidth; this.framebufferHeight = gl.drawingBufferHeight; this.antialias = true; this.ignoreDepthValues = false; this.fixedFoveation = null; }
    getViewport() { return { x: 0, y: 0, width: this.framebufferWidth, height: this.framebufferHeight }; }
  }
  class FakeFrame {
    constructor(session) { this.session = session; }
    getViewerPose() {
      const m = viewerM(), L = this.session.renderState.baseLayer, aspect = L ? L.framebufferWidth / L.framebufferHeight : 1;
      const tf = { matrix: F32(m), inverse: { matrix: F32(invRigid(m)) }, position: { x: m[12], y: m[13], z: m[14], w: 1 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
      return { transform: tf, emulatedPosition: false, views: [{ eye: 'none', projectionMatrix: F32(proj(aspect)), transform: tf, recommendedViewportScale: null, requestViewportScale() {} }] };
    }
    getPose() { return null; }
    getHitTestResults() { const p = hit(); return p ? [{ getPose: () => ({ transform: { matrix: F32(T(p.x, p.y, p.z)) } }) }] : []; }
  }
  class FakeSession extends EventTarget {
    constructor(mode, init) {
      super();
      this.mode = mode; this.init = init || {};
      this.renderState = { baseLayer: null, depthNear: 0.1, depthFar: 1000, inlineVerticalFieldOfView: null };
      this.inputSources = []; this.enabledFeatures = [...(this.init.requiredFeatures || []), ...(this.init.optionalFeatures || [])];
      this.environmentBlendMode = 'alpha-blend'; this.visibilityState = 'visible';
      this.domOverlayState = this.init.domOverlay ? { type: 'screen' } : null;
      this._timers = new Map(); this._id = 0; this._ended = false;
    }
    updateRenderState(s) { Object.assign(this.renderState, s || {}); }
    async requestReferenceSpace(type) { return new FakeSpace(type); }
    async requestHitTestSource() { return { cancel() {} }; }
    requestAnimationFrame(cb) { const id = ++this._id; this._timers.set(id, setTimeout(() => { this._timers.delete(id); if (!this._ended) { S.frames++; cb(performance.now(), new FakeFrame(this)); } }, 40)); return id; }
    cancelAnimationFrame(id) { clearTimeout(this._timers.get(id)); this._timers.delete(id); }
    updateTargetFrameRate() { return Promise.resolve(); }
    async end() { if (this._ended) return; this._ended = true; for (const h of this._timers.values()) clearTimeout(h); S.ended++; this.dispatchEvent(new Event('end')); }
  }
  window.XRWebGLLayer = FakeLayer;
  window.XRSession = FakeSession;
  const xr = {
    isSessionSupported: async mode => S.supported && mode === 'immersive-ar',
    requestSession: async (mode, init) => { if (!S.supported) throw new Error('not supported'); S.sessions++; S.lastInit = { mode, required: (init || {}).requiredFeatures, optional: (init || {}).optionalFeatures, overlay: !!((init || {}).domOverlay && init.domOverlay.root) }; return new FakeSession(mode, init); },
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(navigator, 'xr', { value: xr, configurable: true });
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) if (C) C.prototype.makeXRCompatible = function () { return Promise.resolve(); };
})();
