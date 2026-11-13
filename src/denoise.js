/* ───────────── denoise.js — the grain of a path traced picture cleaned up, its edges and patterns kept ─────────────
   With few samples a path traced picture is grainy: each pixel has followed only a few paths of light. The grain is in
   the light, not in the surfaces. So the same view is drawn once more, plainly: each pixel's surface colour (the
   material's colour and picture, without light) and its distance. The picture divided by the surface colours is the
   light on each pixel. How grainy that light is around each pixel is measured (how much it varies among neighbours in
   the same plane); then it is smoothed over its neighbours that lie in the same plane, face the same way and whose
   light differs by no more than about three times that grain – five passes with steps of 1, 2, 4, 8 and 16 pixels
   ("à trous", the grain measure carried along) – and multiplied by the surface colours again. The bricks, the joints,
   the wood grain, the edges and the shadows stay; the grain in the light goes, the more the grainier it was. Glass is
   left out of the plain drawing (the path tracer looks through it); the sky is left as it is. All on the graphics chip,
   a few milliseconds a picture. */

const DN_LUM = 'const vec3 LUMW = vec3(0.2126, 0.7152, 0.0722);';
const DN_SIGMA = 2.5;   // how many times its grain the light of a neighbour may differ and still count much
const DN_VS = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// how alike two surface colours are: the light is shared only between alike surfaces (a joint and a brick, a dark and
// a light tile each keep their own: what they reflect like a mirror differs, so their light as worked out differs too)
const DN_ALB = 'float albW(vec3 a, vec3 b) { vec3 d = abs(a - b) / (0.25 * (a + b) + 0.01); return exp(-max(d.r, max(d.g, d.b))); }';
// a point of the view from where it is in the picture and its distance
const DN_P = 'uniform vec2 tanHalf;\nvec3 viewPos(vec2 uv, float z) { return vec3((uv * 2.0 - 1.0) * tanHalf * z, -z); }';
// the light on each pixel: the picture ÷ the surface colour (the sky, with no surface, as it is); its brightness alongside
const DN_SPLIT = `uniform sampler2D tColor, tAlb; varying vec2 vUv;
${DN_LUM}
void main() {
  vec4 c = texture2D(tColor, vUv), a = texture2D(tAlb, vUv);
  if (a.a <= 0.0) { gl_FragColor = vec4(c.rgb, 0.0); return; }
  vec3 il = c.rgb / max(a.rgb, vec3(0.02));
  gl_FragColor = vec4(il, dot(il, LUMW));
}`;
// which way each pixel faces: from the distances of its neighbours (the nearer side across an edge)
const DN_NORMAL = `uniform sampler2D tAlb; uniform vec2 texel; varying vec2 vUv;
${DN_P}
void main() {
  float z = texture2D(tAlb, vUv).a;
  if (z <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec3 p = viewPos(vUv, z);
  vec2 ex = vec2(texel.x, 0.0), ey = vec2(0.0, texel.y);
  float zr = texture2D(tAlb, vUv + ex).a, zl = texture2D(tAlb, vUv - ex).a, zu = texture2D(tAlb, vUv + ey).a, zd = texture2D(tAlb, vUv - ey).a;
  bool useR = zr > 0.0 && (zl <= 0.0 || abs(zr - z) < abs(zl - z)), useU = zu > 0.0 && (zd <= 0.0 || abs(zu - z) < abs(zd - z));
  vec3 dx = useR ? viewPos(vUv + ex, zr) - p : (zl > 0.0 ? p - viewPos(vUv - ex, zl) : vec3(1.0, 0.0, 0.0));
  vec3 dy = useU ? viewPos(vUv + ey, zu) - p : (zd > 0.0 ? p - viewPos(vUv - ey, zd) : vec3(0.0, 1.0, 0.0));
  gl_FragColor = vec4(normalize(cross(dx, dy)), z);
}`;
// how much the light varies around each pixel (its grain): over its 5 × 5 neighbours in the same plane facing the same way
const DN_VAR = `uniform sampler2D tIn, tN, tAlb; uniform vec2 texel; uniform float pix; varying vec2 vUv;
${DN_P}
${DN_ALB}
void main() {
  vec4 c = texture2D(tIn, vUv), g = texture2D(tN, vUv);
  if (g.a <= 0.0) { gl_FragColor = vec4(c.a, 0.0, 0.0, 1.0); return; }
  vec3 np = g.rgb, pp = viewPos(vUv, g.a), ap = texture2D(tAlb, vUv).rgb;
  float tol = g.a * pix * 3.0 + 1e-4, m1 = 0.0, m2 = 0.0, ws = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 uv = vUv + vec2(float(i), float(j)) * texel;
    vec4 gq = texture2D(tN, uv);
    if (gq.a <= 0.0) continue;
    float w = exp(-abs(dot(np, viewPos(uv, gq.a) - pp)) / tol) * pow(max(0.0, dot(np, gq.rgb)), 32.0) * albW(ap, texture2D(tAlb, uv).rgb);
    float l = texture2D(tIn, uv).a;
    m1 += w * l; m2 += w * l * l; ws += w;
  }
  m1 /= max(ws, 1e-6); m2 /= max(ws, 1e-6);
  // (the local mean light – the guide of the first pass – and the grain)
  gl_FragColor = vec4(m1, max(0.0, m2 - m1 * m1), 0.0, 1.0);
}`;
// one pass: the light averaged over 5 × 5 neighbours stepw pixels apart – those in the same plane, facing the same
// way, whose light differs by no more than its grain does (a shadow's edge is kept); the grain left is carried along
const DN_ATROUS = `uniform sampler2D tIn, tN, tAlb, tV; uniform vec2 texel; uniform float stepw, sigL, pix, guide; varying vec2 vUv;
${DN_P}
${DN_LUM}
${DN_ALB}
float kw(int i) { return i == 0 ? 0.375 : ((i == 1 || i == -1) ? 0.25 : 0.0625); }
void main() {
  vec4 c = texture2D(tIn, vUv), g = texture2D(tN, vUv);
  if (g.a <= 0.0) { gl_FragColor = c; return; }
  vec3 np = g.rgb, pp = viewPos(vUv, g.a), ap = texture2D(tAlb, vUv).rgb;
  vec2 vp = texture2D(tV, vUv).rg;
  float lp = guide > 0.5 ? vp.r : dot(c.rgb, LUMW), tol = g.a * pix * stepw * 1.5 + 1e-4;
  float vr = guide > 0.5 ? vp.g : c.a;
  float sd = sigL * sqrt(max(vr, 0.0)) + 0.002 + 0.01 * lp;
  vec3 sum = vec3(0.0); float wsum = 0.0, vsum = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 uv = vUv + vec2(float(i), float(j)) * stepw * texel;
    vec4 gq = texture2D(tN, uv);
    if (gq.a <= 0.0) continue;
    vec4 cq = texture2D(tIn, uv);
    vec2 vq = texture2D(tV, uv).rg;
    float lq = guide > 0.5 ? vq.r : dot(cq.rgb, LUMW);
    if (guide > 0.5) cq.a = vq.g;
    float wP = exp(-abs(dot(np, viewPos(uv, gq.a) - pp)) / tol);
    float wN = pow(max(0.0, dot(np, gq.rgb)), 32.0);
    float wL = exp(-abs(lp - lq) / sd);
    float w = kw(i) * kw(j) * wP * wN * wL * albW(ap, texture2D(tAlb, uv).rgb);
    sum += cq.rgb * w; wsum += w; vsum += w * w * cq.a;
  }
  wsum = max(wsum, 1e-6);
  gl_FragColor = vec4(sum / wsum, vsum / (wsum * wsum));
}`;
// the smoothed light × the surface colour again (the sky as it was)
const DN_MERGE = `uniform sampler2D tIllum, tAlb, tColor; varying vec2 vUv;
void main() {
  vec4 a = texture2D(tAlb, vUv), c = texture2D(tColor, vUv);
  if (a.a <= 0.0) { gl_FragColor = c; return; }
  gl_FragColor = vec4(texture2D(tIllum, vUv).rgb * max(a.rgb, vec3(0.02)), c.a);
}`;

/** the plain drawing's material for m: its colour and picture, the distance in alpha; glass and shadow catchers left out */
function dnMaterial(m, cache) {
  if (cache.has(m)) return cache.get(m);
  let b;
  const glass = m.transmission > 0 || (m.transparent && (m.opacity ?? 1) < 0.6 && !m.alphaMap && !m.map) || m.isShadowMaterial;
  if (glass || m.visible === false) { b = new THREE.MeshBasicMaterial(); b.visible = false; }
  else {
    b = new THREE.MeshBasicMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, vertexColors: !!m.vertexColors, alphaMap: m.alphaMap || null,
      alphaTest: m.alphaTest || (m.transparent && (m.alphaMap || m.map) ? 0.5 : 0), side: m.side, transparent: false, toneMapped: false });
    // (the soft-lit colours as the path tracer sees them: twice, over a grey picture whose middle is a half – texlib.js)
    if (m.userData && m.userData.soft && m.map) b.color.multiplyScalar(2);
    // (what a surface sends back of the light: its colour, and the few per cent every non-metal reflects like a mirror –
    //  otherwise a dark tile would seem to get more light than the light one next to it)
    const metal = clamp(m.metalness || 0, 0, 1);
    b.onBeforeCompile = sh => {
      sh.uniforms.hpMetal = { value: metal };
      sh.vertexShader = 'varying float vHpZ;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vHpZ = -mvPosition.z;');
      sh.fragmentShader = 'varying float vHpZ;\nuniform float hpMetal;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor = vec4(mix(diffuseColor.rgb * 0.96 + 0.04, diffuseColor.rgb, hpMetal), vHpZ);');
    };
    b.customProgramCacheKey = () => 'hp-dn-gbuf';
  }
  cache.set(m, b);
  return b;
}

/** a denoiser for pictures of W × H of the view `cam` sees in `scene` (drawn plainly once, now) */
function makeDenoiser(r, scene, cam, W, H) {
  const HF = THREE.HalfFloatType;
  const tgt = (samples = 0) => new THREE.WebGLRenderTarget(W, H, { type: HF, format: THREE.RGBAFormat, depthBuffer: samples > 0 || undefined, samples, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  // the surfaces: colour and distance (with their edges smoothed like the path tracer's, unless very large)
  const alb = new THREE.WebGLRenderTarget(W, H, { type: HF, format: THREE.RGBAFormat, depthBuffer: true, samples: W * H <= 4.2e6 ? 4 : 0, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const nrm = tgt(), A = tgt(), B = tgt(), V = tgt(), out = tgt();
  const swaps = [], cache = new Map();
  scene.traverse(o => {
    if (!o.material) return;
    if (o.isLine || o.isPoints || o.isSprite) { swaps.push([o, o.material, o.visible]); o.visible = false; return; }
    if (!o.isMesh) return;
    swaps.push([o, o.material, o.visible]);
    o.material = Array.isArray(o.material) ? o.material.map(m => dnMaterial(m, cache)) : dnMaterial(o.material, cache);
  });
  const keep = { bg: scene.background, fog: scene.fog, target: r.getRenderTarget(), cc: r.getClearColor(new THREE.Color()), ca: r.getClearAlpha(), tm: r.toneMapping, ac: r.autoClear, ov: scene.overrideMaterial };
  try {
    scene.background = null; scene.fog = null; scene.overrideMaterial = null;
    r.setRenderTarget(alb); r.setClearColor(0x000000, 0); r.autoClear = true; r.clear(); r.render(scene, cam);
  } finally {
    for (const [o, m, vis] of swaps) { o.material = m; o.visible = vis; }
    for (const b of cache.values()) b.dispose();
    scene.background = keep.bg; scene.fog = keep.fog; scene.overrideMaterial = keep.ov;
    r.setRenderTarget(keep.target); r.setClearColor(keep.cc, keep.ca); r.autoClear = keep.ac;
  }
  // the passes: one triangle pair over the whole picture
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / (cam.zoom || 1), tanHalf = new THREE.Vector2(tanY * cam.aspect, tanY);
  const texel = new THREE.Vector2(1 / W, 1 / H);
  const mat = (fs, u) => new THREE.ShaderMaterial({ vertexShader: DN_VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
  const mSplit = mat(DN_SPLIT, { tColor: { value: null }, tAlb: { value: alb.texture } });
  const mNormal = mat(DN_NORMAL, { tAlb: { value: alb.texture }, texel: { value: texel }, tanHalf: { value: tanHalf } });
  const mVar = mat(DN_VAR, { tIn: { value: null }, tN: { value: nrm.texture }, tAlb: { value: alb.texture }, texel: { value: texel }, pix: { value: 2 * tanY / H }, tanHalf: { value: tanHalf } });
  const mAtrous = mat(DN_ATROUS, { tIn: { value: null }, tN: { value: nrm.texture }, tAlb: { value: alb.texture }, tV: { value: V.texture }, guide: { value: 0 }, texel: { value: texel }, stepw: { value: 1 }, sigL: { value: DN_SIGMA }, pix: { value: 2 * tanY / H }, tanHalf: { value: tanHalf } });
  const mMerge = mat(DN_MERGE, { tIllum: { value: null }, tAlb: { value: alb.texture }, tColor: { value: null } });
  const pass = (m, target) => { quad.material = m; r.setRenderTarget(target); r.render(qScene, quadCam); };
  const prevT = r.getRenderTarget();
  pass(mNormal, nrm);
  r.setRenderTarget(prevT);
  return {
    out, alb, nrm,
    /** the cleaned picture of `tex` (linear light, W × H) after n samples; strength 0 … 2 (1: normal) */
    run(tex, n, strength = 1) {
      const prev = r.getRenderTarget(), ac = r.autoClear, tm = r.toneMapping;
      r.autoClear = false; r.toneMapping = THREE.NoToneMapping;
      try {
        mSplit.uniforms.tColor.value = tex; pass(mSplit, A);
        mVar.uniforms.tIn.value = A.texture; pass(mVar, V);
        // five passes, 1 … 16 pixels apart; how alike the light must be follows its grain (less after each pass);
        // the first compares local means (V), not single grainy values
        let src = A, dst = B;
        for (let i = 0; i < 5; i++) {
          mAtrous.uniforms.tIn.value = src.texture; mAtrous.uniforms.stepw.value = 1 << i; mAtrous.uniforms.sigL.value = DN_SIGMA * strength; mAtrous.uniforms.guide.value = i === 0 ? 1 : 0;
          pass(mAtrous, dst);
          [src, dst] = [dst, src];
        }
        mMerge.uniforms.tIllum.value = src.texture; mMerge.uniforms.tColor.value = tex; pass(mMerge, out);
      } finally { r.setRenderTarget(prev); r.autoClear = ac; r.toneMapping = tm; }
      return out.texture;
    },
    dispose() {
      for (const t of [alb, nrm, A, B, V, out]) t.dispose();
      for (const m of [mSplit, mNormal, mVar, mAtrous, mMerge]) m.dispose();
      quad.geometry.dispose();
    },
  };
}
