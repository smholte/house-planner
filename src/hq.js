/* ───────────── hq.js — the High quality preset for computers ─────────────
   settings.quality: 'fast' | 'beautiful' | 'high'. High is offered on computers only (a mouse and a big screen,
   WebGL 2); on phones and tablets it falls back to Beautiful, so nothing heavy ever runs there.
   High adds, on top of Beautiful:
   – depth in the surfaces: every textured material gets a normal map made from its own pattern (mortar joints,
     grout, plank seams, tile edges, stone, grass …) so light and viewing angle change how it looks; brick, roof
     tiles, tiles, pavers and stone also get parallax occlusion mapping (the joints really sink in as you move);
     painted walls and ceilings get a fine plaster grain;
   – contact shadows: the soft shadows in corners and seams (GTAO) at full size and on every frame, a little
     stronger and tighter, so pieces and walls stand on the floor instead of floating;
   – light: a sky that lights and reflects (image-based light from a generated sky), sharper sun shadows (4096),
     the best texture filtering. */

let _canHigh = null;
/** a computer that can take High: mouse / trackpad, a screen of at least 700 px each way, WebGL 2 */
function canHighQuality() {
  if (_canHigh != null) return _canHigh;
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
    const big = Math.min(screen.width || 0, screen.height || 0) >= 700;
    const gl2 = !!document.createElement('canvas').getContext('webgl2');
    _canHigh = !coarse && big && gl2;
  } catch (e) { _canHigh = false; }
  return _canHigh;
}
/** the quality the 3D views really use on this device */
function quality3d(settings) {
  const q = (settings && settings.quality) || 'beautiful';
  return q === 'high' && !canHighQuality() ? 'beautiful' : q;
}

/* ───────── maps made from a texture's own pattern ───────── */
const HQ_MAPS = new WeakMap();      // colour texture → { normal, height }
function copyTransform(src, dst) {
  dst.wrapS = src.wrapS; dst.wrapT = src.wrapT;
  dst.repeat.copy(src.repeat); dst.offset.copy(src.offset); dst.center.copy(src.center); dst.rotation = src.rotation;
  dst.flipY = src.flipY;
}
/** height (joints low) and a tangent-space normal map from a canvas texture */
function hqMapsFor(tex, strength = 2.2) {
  const key = tex;
  if (HQ_MAPS.has(key)) return HQ_MAPS.get(key);
  const img = tex.image;
  let res = null;
  try {
    const W = img.width, H = img.height;
    if (!W || !H || W > 2048 || H > 2048) throw new Error('size');
    let data;
    if (img.getContext) data = img.getContext('2d').getImageData(0, 0, W, H).data;
    else { const c = makeCanvas(W, H); const g = c.getContext('2d'); g.drawImage(img, 0, 0); data = g.getImageData(0, 0, W, H).data; }
    const lum = new Float32Array(W * H);
    let mean = 0;
    for (let i = 0; i < W * H; i++) { const v = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255; lum[i] = v; mean += v; }
    mean /= W * H;
    // joints are the smaller part: when they are lighter than the bricks (mortar), the light parts are low
    const sorted = Float32Array.from(lum).sort();
    const median = sorted[Math.floor(sorted.length / 2)];
    const invert = mean > median + 0.004;
    // a little blur: rounded edges instead of steps
    const blur = (src, r) => {
      const out = new Float32Array(src.length), tmp = new Float32Array(src.length);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let k = -r; k <= r; k++) s += src[y * W + ((x + k + W) % W)]; tmp[y * W + x] = s / (2 * r + 1); }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let k = -r; k <= r; k++) s += tmp[((y + k + H) % H) * W + x]; out[y * W + x] = s / (2 * r + 1); }
      return out;
    };
    let hgt = lum.map(v => (invert ? 1 - v : v));
    hgt = blur(hgt, Math.max(1, Math.round(W / 256)));
    let lo = Infinity, hi = -Infinity;
    for (const v of hgt) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = Math.max(1e-4, hi - lo);
    for (let i = 0; i < hgt.length; i++) hgt[i] = (hgt[i] - lo) / span;
    const hc = makeCanvas(W, H), nc = makeCanvas(W, H);
    const hctx = hc.getContext('2d'), nctx = nc.getContext('2d');
    const hd = hctx.createImageData(W, H), nd = nctx.createImageData(W, H);
    const at = (x, y) => hgt[((y + H) % H) * W + ((x + W) % W)];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4, v = Math.round(at(x, y) * 255);
      hd.data[o] = hd.data[o + 1] = hd.data[o + 2] = v; hd.data[o + 3] = 255;
      // ∂h/∂u to the right; ∂h/∂v upwards (the canvas runs downwards, the texture is flipped)
      const du = (at(x + 1, y) - at(x - 1, y)) * strength, dv = (at(x, y - 1) - at(x, y + 1)) * strength;
      const L = Math.hypot(du, dv, 1);
      nd.data[o] = Math.round((-du / L * 0.5 + 0.5) * 255); nd.data[o + 1] = Math.round((-dv / L * 0.5 + 0.5) * 255); nd.data[o + 2] = Math.round((1 / L * 0.5 + 0.5) * 255); nd.data[o + 3] = 255;
    }
    hctx.putImageData(hd, 0, 0); nctx.putImageData(nd, 0, 0);
    const normal = new THREE.CanvasTexture(nc), height = new THREE.CanvasTexture(hc);
    for (const t2 of [normal, height]) { copyTransform(tex, t2); t2.colorSpace = THREE.NoColorSpace; t2.anisotropy = HQ_ANISO; }
    res = { normal, height };
  } catch (e) { res = null; }
  HQ_MAPS.set(key, res);
  return res;
}
let HQ_ANISO = 8;
/** a fine plaster grain for painted walls and ceilings (50 cm tiles) */
function plasterNormal() {
  if (TEX.has('hq-plaster')) return TEX.get('hq-plaster');
  const N = 256, c = makeCanvas(N, N), g = c.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const hgt = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) hgt[i] = rnd();
  // a few passes of smoothing: soft bumps of a few millimetres
  for (let pass = 0; pass < 2; pass++) {
    const nx = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += hgt[((y + dy + N) % N) * N + ((x + dx + N) % N)];
      nx[y * N + x] = s / 9;
    }
    hgt.set(nx);
  }
  const d = g.createImageData(N, N);
  const at = (x, y) => hgt[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const du = (at(x + 1, y) - at(x - 1, y)) * 9, dv = (at(x, y - 1) - at(x, y + 1)) * 9, L = Math.hypot(du, dv, 1), o = (y * N + x) * 4;
    d.data[o] = Math.round((-du / L * 0.5 + 0.5) * 255); d.data[o + 1] = Math.round((-dv / L * 0.5 + 0.5) * 255); d.data[o + 2] = Math.round((1 / L * 0.5 + 0.5) * 255); d.data[o + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t2 = new THREE.CanvasTexture(c);
  t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
  t2.repeat.set(5, 5);
  t2.colorSpace = THREE.NoColorSpace;
  t2.anisotropy = HQ_ANISO;
  TEX.set('hq-plaster', t2);
  return t2;
}

/* ───────── parallax occlusion mapping (a patch on the standard material) ─────────
   The uv is moved along the view ray until it meets the height map, so joints sink in and hide behind the
   bricks as you move. The surface frame comes from screen-space derivatives (no tangents needed); the depth is
   in metres, whatever the texture's size, rotation or the mesh's uv. */
const RELIEF_GLSL = `
uniform sampler2D reliefMap;
uniform float reliefDepth;
vec2 reliefUv(vec2 uv) {
  vec3 N = normalize(vNormal);
  N *= gl_FrontFacing ? 1.0 : -1.0;
  vec3 V = normalize(vViewPosition);
  vec3 dp1 = dFdx(-vViewPosition), dp2 = dFdy(-vViewPosition);
  vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  float det = du1.x * du2.y - du1.y * du2.x;
  float vn = dot(V, N);
  if (abs(det) < 1e-14 || vn < 0.03) return uv;
  vec3 Pu = (dp1 * du2.y - dp2 * du1.y) / det;
  vec3 Pv = (dp2 * du1.x - dp1 * du2.x) / det;
  vec3 s = -(V - N * vn) / vn;
  vec3 cPv = cross(Pv, N), cNu = cross(N, Pu);
  float a = dot(Pu, cPv), b = dot(Pv, cNu);
  if (abs(a) < 1e-12 || abs(b) < 1e-12) return uv;
  vec2 duv = vec2(dot(s, cPv) / a, dot(s, cNu) / b) * reliefDepth;
  // far away the joints are too small to matter: fade the effect out
  float pix = max(length(du1), length(du2));
  float fade = 1.0 - smoothstep(0.004, 0.02, pix);
  if (fade <= 0.0) return uv;
  duv *= fade;
  float layers = mix(28.0, 10.0, vn);
  float stepD = 1.0 / layers;
  float depth = 0.0;
  vec2 cur = uv;
  float h = textureGrad(reliefMap, cur, du1, du2).r;
  for (int i = 0; i < 32; i++) {
    if (float(i) >= layers || depth >= 1.0 - h) break;
    depth += stepD;
    cur = uv + duv * depth;
    h = textureGrad(reliefMap, cur, du1, du2).r;
  }
  vec2 prev = uv + duv * max(0.0, depth - stepD);
  float hPrev = textureGrad(reliefMap, prev, du1, du2).r;
  float after = (1.0 - h) - depth, before = (1.0 - hPrev) - (depth - stepD);
  float w = after / (after - before + 1e-6);
  return mix(cur, prev, clamp(w, 0.0, 1.0));
}
`;
function reliefPatch(heightTex, depth) {
  return sh => {
    sh.uniforms.reliefMap = { value: heightTex };
    sh.uniforms.reliefDepth = { value: depth };
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', RELIEF_GLSL + '\nvoid main() {')
      .replace('#include <map_fragment>', 'vec2 pUv = reliefUv(vMapUv);\n' + THREE.ShaderChunk.map_fragment.replace(/vMapUv/g, 'pUv'))
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(/vNormalMapUv/g, 'pUv'))
      .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replace(/vRoughnessMapUv/g, 'pUv'));
  };
}

/* ───────── the materials of the High preset ───────── */
const HQ_MAT = new WeakMap();
/** the High version of a material (made once, then shared): normal map (+ relief) from its texture, plaster grain on
 *  painted surfaces; materials it can't improve come back as they are */
function hqMaterial(m) {
  if (m && m.isMeshStandardMaterial && m.transparent && m.envMapIntensity === 1) m.envMapIntensity = 0.4;   // glass: a soft reflection of the sky, not milky
  if (!m || !m.isMeshStandardMaterial || m.transparent || m.userData.noHQ || m.userData.hqOf) return m;
  if (HQ_MAT.has(m)) return HQ_MAT.get(m);
  const hint = m.userData.hq || (m.map && m.map.userData && m.map.userData.hq) || {};
  let out = m, patch = null;
  if (m.map && m.map.image && !m.normalMap && hint.normal !== false) {
    const maps = hqMapsFor(m.map, hint.strength || 2.2);
    if (maps) {
      out = m.clone();
      out.normalMap = maps.normal;
      out.normalScale = new THREE.Vector2(1, 1).multiplyScalar(hint.normalScale || 1);
      const depth = hint.relief != null ? hint.relief : 0;
      if (depth > 0) patch = reliefPatch(maps.height, depth);
      if ((out.map.anisotropy || 1) < HQ_ANISO) { out.map.anisotropy = HQ_ANISO; out.map.needsUpdate = true; }
    }
  } else if (!m.map && !m.normalMap && hint.plaster) {
    out = m.clone();
    out.normalMap = plasterNormal();
    out.normalScale = new THREE.Vector2(0.14, 0.14);
  }
  if (out !== m) {
    out.userData = { ...m.userData, hqOf: true };
    delete out.userData.capPatched; delete out.userData.side0;
    if (patch) {
      out.userData.hqPatch = patch;
      out.onBeforeCompile = sh => { if (out.userData.soft) softPatch(sh); patch(sh); };
      out.customProgramCacheKey = () => (out.userData.soft ? 'soft|' : '') + 'relief';
    } else if (out.userData.soft) {
      out.onBeforeCompile = sh => softPatch(sh);
      out.customProgramCacheKey = () => 'soft';
    }
    out.needsUpdate = true;
  }
  HQ_MAT.set(m, out);
  return out;
}

/* ───────── a sky that lights and reflects ───────── */
function hqSkyTexture() {
  if (TEX.has('hq-sky')) return TEX.get('hq-sky');
  const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H / 2);
  sky.addColorStop(0, '#8eaad0'); sky.addColorStop(0.6, '#c3d2e2'); sky.addColorStop(1, '#eceeee');
  g.fillStyle = sky; g.fillRect(0, 0, W, H / 2);
  const ground = g.createLinearGradient(0, H / 2, 0, H);
  ground.addColorStop(0, '#b0ab9e'); ground.addColorStop(0.25, '#8f8a78'); ground.addColorStop(1, '#6a6656');
  g.fillStyle = ground; g.fillRect(0, H / 2, W, H / 2);
  // the sun's glow (south-west, 40° up) and a few soft clouds
  const sx = W * 0.62, sy = H * (0.5 - 40 / 180);
  const glow = g.createRadialGradient(sx, sy, 0, sx, sy, 70);
  glow.addColorStop(0, 'rgba(255,250,235,1)'); glow.addColorStop(0.15, 'rgba(255,244,214,0.8)'); glow.addColorStop(1, 'rgba(255,244,214,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H / 2);
  let seed = 5;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(rnd() * W, H * (0.18 + rnd() * 0.26), 20 + rnd() * 50, 5 + rnd() * 9, 0, 0, 7); g.fill(); }
  const t2 = new THREE.CanvasTexture(c);
  t2.mapping = THREE.EquirectangularReflectionMapping;
  t2.colorSpace = THREE.SRGBColorSpace;
  TEX.set('hq-sky', t2);
  return t2;
}

/** the sky over you while walking: as the sky light's picture, but the horizon is the colour of the haze, so the
 *  ground fades into it without a seam */
/** glass and water reflect the sky (Beautiful too): the material's own sky, made ready per view by three.js; costs only
 *  where there is glass or water */
function skyReflect(m, k) {
  const sky = libSky('day');
  m.envMap = sky || hqSkyTexture();
  m.envMapIntensity = sky ? k * Math.min(2, 0.55 / Math.max(0.05, sky.userData.avg)) : k;
  return m;
}
function walkSkyTexture() {
  if (TEX.has('walk-sky')) return TEX.get('walk-sky');
  const W = 1024, H = 512, c = makeCanvas(W, H), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H / 2);
  sky.addColorStop(0, '#7f9fcb'); sky.addColorStop(0.55, '#b9cbe0'); sky.addColorStop(0.9, '#d6e0ea'); sky.addColorStop(1, '#dde5ec');
  g.fillStyle = sky; g.fillRect(0, 0, W, H / 2);
  g.fillStyle = '#dde5ec'; g.fillRect(0, H / 2, W, H / 2);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // soft clouds, flatter and smaller towards the horizon
  for (let i = 0; i < 60; i++) {
    const y = H * (0.08 + rnd() * 0.36), k = 1 - y / (H / 2);
    g.fillStyle = `rgba(255,255,255,${(0.1 + rnd() * 0.16).toFixed(3)})`;
    g.beginPath(); g.ellipse(rnd() * W, y, (30 + rnd() * 90) * (0.5 + k), (6 + rnd() * 14) * (0.4 + k), 0, 0, 7); g.fill();
  }
  const t2 = new THREE.CanvasTexture(c);
  t2.mapping = THREE.EquirectangularReflectionMapping;
  t2.colorSpace = THREE.SRGBColorSpace;
  TEX.set('walk-sky', t2);
  return t2;
}

Object.assign(View3D.prototype, {
  /** High: set up once per view (the renderer's settings) */
  hqSetup() {
    HQ_ANISO = Math.max(4, Math.min(16, this.maxAniso || 8));
    MAX_ANISO = HQ_ANISO;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.normalBias = 0.015;
    this.sun.shadow.bias = -0.0002;
  },
  /** Beautiful and High (since 30 Oct also Beautiful, phones too): light from the whole sky – surfaces facing the
   *  sky are lit a little cooler and brighter than those facing the ground, shiny things (glass, metal, water, tiles)
   *  reflect the sky. Made once per view (a blurred copy of the sky picture); costs a few texture reads per pixel */
  skySetup() {
    try {
      const pm = new THREE.PMREMGenerator(this.renderer);
      // the real sky (texlib.js; a sunset in the evening), else the drawn one
      const sky = libSky(this.evening ? 'sunset' : 'day') || libSky('day');
      this.hqEnv = pm.fromEquirectangular(sky || hqSkyTexture());
      pm.dispose();
      this.scene.environment = this.hqEnv.texture;
      this.skyInfo = sky ? sky.userData : null;
      this.skyTurn();
    } catch (e) { console.warn('sky light', e); }
  },
  /** the real sky turned so that its sun stands in the direction of the app's sun */
  skyTurn() {
    const S = this.skyInfo;
    if (!S || !this.sun || !this.scene.environmentRotation) return;
    const d = this.sun.position.clone().sub(this.sun.target.position);
    const fa = Math.atan2(d.z, d.x), fh = (S.sunU - 0.5) * Math.PI * 2;
    this.scene.environmentRotation.set(0, fa - fh, 0);
  },
  /** the light balance with the sky light (after Day / Evening / Sun have set theirs) */
  hqLight() {
    if (!this.scene.environment) return;
    const ev = this.evening;
    // the sky picture again when the real skies arrived or day turned to evening
    const sk = TEXLIB.gen + '|' + (ev ? 1 : 0);
    if (this.high && this._skyKey !== sk) {
      const first = this._skyKey == null;
      this._skyKey = sk;
      if (!first || TEXLIB.ready) { if (this.hqEnv) this.hqEnv.dispose(); this.skySetup(); }
    }
    // (the real sky is brighter than the drawn one: scaled to the same mean brightness)
    const k = this.skyInfo ? Math.min(2, 0.55 / Math.max(0.05, this.skyInfo.avg)) : 1;
    this.scene.environmentIntensity = (ev ? 0.12 : 0.55) * k;
    this.skyTurn();
    this.hemi.intensity *= ev ? 0.8 : 0.62;
    if (!ev) this.sun.intensity *= 1.18;
  },
  /** High: every mesh gets the High version of its materials */
  hqApply(root) {
    if (!this.high) return;
    root.traverse(o => {
      // furniture models (their colour atlas would make false bumps) and plants have their own look
      if (!o.isMesh || !o.material || o.userData.furn || o.userData.plant || o.userData.noHQ) return;
      if (Array.isArray(o.material)) { const arr = o.material.map(hqMaterial); if (arr.some((x, i) => x !== o.material[i])) o.material = arr; }
      else { const x = hqMaterial(o.material); if (x !== o.material) o.material = x; }
    });
  },
});
