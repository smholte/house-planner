/* ───────────── trees.js — trees, shrubs, grasses, hedges and reeds in 3D ─────────────
   Three levels, from the 3D quality:
   – Fast keeps the simple shapes (garden.js gTree): a trunk and a lumpy ball.
   – Beautiful (also phones and tablets) grows a real tree: a trunk and branches (tapered tubes with bark) and a
     crown of leaf cards – small pictures of twigs with leaves, cut out along the leaves – in clumps at the ends of
     the branches, so the crown has depth, gaps and a ragged outline. Fewer, larger cards.
   – High (computers) the same with about three times as many smaller cards, a second level of branches and
     rounder tubes.
   The cards are lit as one volume: their normals point out of the crown and cards deep inside are darker (the
   crown shades itself), so it does not look like a heap of flat cards. Each kind of tree is grown a few times
   (variants, per size) and the geometry is shared by every tree of that kind and size, so many trees cost little.
   Species follow the plant's kind and its name: maple / esdoorn / acer, willow / wilg, poplar / populier,
   birch / berk, multi-stem / meerstammig / Amelanchier; otherwise a broadleaf tree (a small tree: Japanese maple). */

const VEG_Q = {
  mid: { dens: 0.3, card: 1.6, sub: 2, nb: 0.7, radial: 5, trunkRadial: 7, strands: 0.45 },
  high: { dens: 1, card: 1, sub: 4, nb: 1, radial: 7, trunkRadial: 11, strands: 1 },
};
/* Many trees, one shape (task 0029). In a merged view (batch.js) the plants are not copied into the batches: each grown
   shape (species, size, variant) is held once and drawn for all its trees in one go (three.js InstancedMesh: one draw
   call per shape and material). Each tree has two lighter versions (VEG_LOD: the same branches and leaf clumps – the
   same random numbers – but no twigs, thinner tubes, fewer and bigger cards covering the crown as fully (their area × count about the same)): the light one
   from VEG_NEAR[0] m from the camera, the far one from VEG_NEAR[1] m. Which tree is drawn with which, and only the trees
   in view, follows the camera (vegLodStep, from the view's frame loop; a few metres' margin so a tree on the edge
   doesn't flip back and forth). The shadows come from a fixed set (layer 1, which only the sun's shadow cameras see):
   every tree in its light version, in squares of VEG_CELL m – the shadow map is only drawn again when something changes,
   so it must hold the trees out of view too. Nothing is kept hidden for tapping: a ray finds the tree drawn (far away the
   light one). Views that make drawings (not merged) keep one mesh per plant, as before. */
const VEG_LOD = [null, { card: 2, dens: 1 / 4 }, { card: 3.3, dens: 1 / 10, stems: true }];
const VEG_NEAR = [32, 90];
const VEG_CELL = 48;
const VEG_SP = {
  broadleaf: { shape: 'round', leaf: 'broad', bark: 'grey', crownBot: 0.33, stems: 1, nb: 7, card: 0.42, thick: 1 },
  multistem: { shape: 'round', leaf: 'broad', bark: 'grey', crownBot: 0.26, stems: 4, lean: 0.3, nb: 10, card: 0.38, thick: 0.75 },
  birch: { shape: 'round', leaf: 'birch', bark: 'birch', crownBot: 0.3, stems: 1, nb: 8, card: 0.36, thick: 0.8 },
  maple: { shape: 'round', leaf: 'maple', bark: 'dark', crownBot: 0.22, stems: 3, lean: 0.62, nb: 10, card: 0.32, thick: 0.7, flat: 0.75 },
  poplar: { shape: 'column', leaf: 'round', bark: 'grey', crownBot: 0.08, stems: 1, nb: 22, card: 0.46, thick: 0.85 },
  willow: { shape: 'weep', leaf: 'narrow', bark: 'brown', crownBot: 0.22, stems: 1, nb: 6, card: 0.42, thick: 1.15 },
  shrub: { shape: 'bush', leaf: 'small', bark: 'brown', crownBot: 0, stems: 6, nb: 0, card: 0.28, thick: 0.4 },
};
/** which species a garden plant is grown as */
function vegSpecies(pl) {
  const n = (pl.name || '').toLowerCase();
  if (pl.kind === 'shrub') return 'shrub';
  if (pl.kind === 'grass' || pl.kind === 'pot') return pl.kind;
  if (/willow|wilg|salix|pil\b/.test(n)) return 'willow';
  if (/poplar|populier|populus|poppel/.test(n)) return 'poplar';
  if (/birch|berk|betula|bjørk/.test(n)) return 'birch';
  if (/multi|meerstam|flerstam|amelanch|krent|søtmispel/.test(n)) return 'multistem';
  if (/maple|esdoorn|acer|lønn/.test(n)) return 'maple';
  return pl.kind === 'small' ? 'maple' : 'broadleaf';
}
function vegRng(seed) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/* ───────── textures: twigs with leaves, bark, grass blades, reeds ───────── */
const VEG_LEAF = {
  broad: { cols: ['#3d6829', '#4b7731', '#5a8638', '#6a9442', '#44702d'], n: 18, len: 0.24, wid: 0.5, shape: 'oval' },
  round: { cols: ['#3a6230', '#477238', '#558140', '#64904a'], n: 20, len: 0.18, wid: 0.85, shape: 'oval' },
  maple: { cols: ['#7a2018', '#93291d', '#ab3824', '#c04c2b', '#86261c'], n: 18, len: 0.2, shape: 'palm' },
  narrow: { cols: ['#748f3f', '#86a24c', '#97b358', '#678337'], n: 26, len: 0.26, wid: 0.16, shape: 'oval' },
  birch: { cols: ['#5b8a35', '#6a983d', '#7aa647', '#527c30'], n: 22, len: 0.16, wid: 0.64, shape: 'oval' },
  small: { cols: ['#34602a', '#406e30', '#4d7b37', '#5a873f'], n: 30, len: 0.12, wid: 0.56, shape: 'oval', mat: true },
  hedge: { cols: ['#2d5823', '#38662a', '#447332', '#4f7f39'], n: 34, len: 0.1, wid: 0.62, shape: 'oval', mat: true },
};
function vegLeafShape(g, L, W, shape) {
  g.beginPath();
  if (shape === 'palm') {
    const lobes = [-1.25, -0.62, 0, 0.62, 1.25], k = [0.6, 0.84, 1, 0.84, 0.6];
    g.moveTo(0, 0);
    lobes.forEach((a, i) => {
      const r = L * k[i];
      g.lineTo(Math.cos(a - 0.2) * r * 0.4, Math.sin(a - 0.2) * r * 0.4);
      g.quadraticCurveTo(Math.cos(a - 0.12) * r * 0.85, Math.sin(a - 0.12) * r * 0.85, Math.cos(a) * r, Math.sin(a) * r);
      g.quadraticCurveTo(Math.cos(a + 0.12) * r * 0.85, Math.sin(a + 0.12) * r * 0.85, Math.cos(a + 0.2) * r * 0.4, Math.sin(a + 0.2) * r * 0.4);
    });
    g.closePath();
  } else {
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.22, -W * 0.56, L * 0.68, -W * 0.52, L, 0);
    g.bezierCurveTo(L * 0.68, W * 0.52, L * 0.22, W * 0.56, 0, 0);
    g.closePath();
  }
}
/** a cut-out texture from a canvas: transparent pixels take the mean colour of the leaves (no dark fringe when it
 *  is made smaller), rows flipped for WebGL */
function vegCutTex(cv, key) {
  const W = cv.width, H = cv.height, d = cv.getContext('2d').getImageData(0, 0, W, H).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  n = Math.max(1, n); r /= n; gg /= n; b /= n;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (y * W + x) * 4, o = ((H - 1 - y) * W + x) * 4, a = d[s + 3];
    if (a === 0) { out[o] = r; out[o + 1] = gg; out[o + 2] = b; out[o + 3] = 0; }
    else { out[o] = d[s]; out[o + 1] = d[s + 1]; out[o + 2] = d[s + 2]; out[o + 3] = a; }
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = Math.min(4, MAX_ANISO);
  tex.needsUpdate = true;
  TEX.set(key, tex);
  return tex;
}
function vegLeafTex(type, hi) {
  const key = 'veg-leaf|' + type + '|' + (hi ? 1 : 0);
  if (TEX.has(key)) return TEX.get(key);
  const L = VEG_LEAF[type] || VEG_LEAF.broad, S = hi ? 512 : 256, cv = makeCanvas(S, S), g = cv.getContext('2d');
  const rnd = vegRng(type.length * 97 + 11);
  g.clearRect(0, 0, S, S);
  g.lineCap = 'round';
  // the twig: a main stem from the bottom middle, with two side shoots
  const stems = [];
  const stem = (x0, y0, x1, y1, bend, w) => {
    const cx = (x0 + x1) / 2 + bend, cy = (y0 + y1) / 2;
    g.strokeStyle = '#5b4632'; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
    stems.push({ x0, y0, cx, cy, x1, y1 });
  };
  if (L.mat) for (let i = 0; i < 6; i++) { const a = rnd() * Math.PI * 2; stem(S / 2, S / 2, S / 2 + Math.cos(a) * S * 0.36, S / 2 + Math.sin(a) * S * 0.36, S * 0.04, S * 0.008); }
  else {
    stem(S * 0.5, S, S * (0.47 + rnd() * 0.06), S * 0.07, S * (rnd() - 0.5) * 0.12, S * 0.014);
    stem(S * 0.5, S * 0.62, S * 0.16, S * 0.22, -S * 0.05, S * 0.009);
    stem(S * 0.5, S * 0.48, S * 0.84, S * 0.16, S * 0.05, S * 0.009);
  }
  const at = (st, t) => { const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; return [a * st.x0 + b * st.cx + c * st.x1, a * st.y0 + b * st.cy + c * st.y1]; };
  const fine = S * L.len < 40;
  const leaf = (x, y, ang, len, dark = 1) => {
    const col = shadeHex(L.cols[Math.floor(rnd() * L.cols.length)], dark);
    g.save(); g.translate(x, y); g.rotate(ang);
    // a short stalk
    g.strokeStyle = '#5d6b33'; g.lineWidth = Math.max(1, S * 0.004);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.12, 0); g.stroke();
    g.translate(len * 0.1, 0);
    vegLeafShape(g, len, len * (L.wid || 0.5), L.shape);
    const gr = g.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, shadeHex(col, 0.78)); gr.addColorStop(0.45, col); gr.addColorStop(1, shadeHex(col, 1.08));
    g.fillStyle = gr; g.fill();
    // one half a little lighter: the leaf is folded along its middle
    g.save(); g.clip(); g.fillStyle = 'rgba(255,255,240,0.07)'; g.fillRect(0, -len, len * 1.2, len); g.restore();
    g.strokeStyle = 'rgba(20,30,10,0.35)'; g.lineWidth = Math.max(0.8, S * 0.002); g.stroke();
    // the veins (not on small leaves: at this size they only make the leaves look pale)
    if (fine) { g.restore(); return; }
    g.strokeStyle = 'rgba(235,240,200,0.32)'; g.lineWidth = Math.max(0.8, S * 0.0025);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.92, 0);
    if (L.shape !== 'palm') for (let k = 1; k <= 3; k++) { const vx = len * k * 0.22; g.moveTo(vx, 0); g.lineTo(vx + len * 0.14, -len * (L.wid || 0.5) * 0.32); g.moveTo(vx, 0); g.lineTo(vx + len * 0.14, len * (L.wid || 0.5) * 0.32); }
    else for (const a of [-1.25, -0.62, 0.62, 1.25]) { g.moveTo(0, 0); g.lineTo(Math.cos(a) * len * 0.7, Math.sin(a) * len * 0.7); }
    g.stroke();
    g.restore();
  };
  if (L.mat) {
    // a dense mat of small leaves (a clipped hedge, a box or laurel shrub): darker inside, the outer leaves on top
    const pts = [];
    for (let i = 0; i < L.n * 4; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()); pts.push([a, r]); }
    pts.sort((p1, p2) => p1[1] - p2[1]);
    for (const [a, r] of pts) leaf(S / 2 + Math.cos(a) * r * S * 0.4, S / 2 + Math.sin(a) * r * S * 0.4, rnd() * Math.PI * 2, S * L.len * (0.75 + rnd() * 0.45), 0.72 + 0.36 * r);
    return vegCutTex(cv, key);
  }
  for (const st of stems) {
    const n = Math.round(L.n * (st === stems[0] ? 0.6 : 0.3));
    for (let i = 0; i < n; i++) {
      const t2 = 0.18 + (i / Math.max(1, n - 1)) * 0.78 + (rnd() - 0.5) * 0.05;
      const p = at(st, Math.min(1, t2)), p2 = at(st, Math.min(1, t2 + 0.02));
      const dir = Math.atan2(p2[1] - p[1], p2[0] - p[0]);
      const side = i % 2 ? 1 : -1;
      leaf(p[0], p[1], dir + side * (0.5 + rnd() * 0.45), S * L.len * (0.75 + rnd() * 0.4));
    }
    const tip = at(st, 1), pre = at(st, 0.95);
    leaf(tip[0], tip[1], Math.atan2(tip[1] - pre[1], tip[0] - pre[0]), S * L.len * 0.9);
  }
  return vegCutTex(cv, key);
}
/** grass blades (an ornamental grass) or reeds with their plumes */
function vegBladeTex(kind, hi) {
  const key = 'veg-blade|' + kind + '|' + (hi ? 1 : 0);
  if (TEX.has(key)) return TEX.get(key);
  const S = hi ? 512 : 256, cv = makeCanvas(S, S), g = cv.getContext('2d');
  const rnd = vegRng(kind === 'reed' ? 31 : 17);
  const reed = kind === 'reed';
  // reeds: a whole stand across the card (autumn: mostly straw, some still green); grass: a fan from the middle
  const n = reed ? 78 : 46;
  for (let i = 0; i < n; i++) {
    const x0 = S * (reed ? 0.04 + rnd() * 0.92 : 0.38 + rnd() * 0.24), lean = (rnd() - 0.5) * S * (reed ? 0.12 : 0.9);
    const top = S * (reed ? 0.02 + rnd() * 0.32 : 0.03 + rnd() * 0.25);
    const w = S * (reed ? 0.009 : 0.008) * (0.7 + rnd() * 0.6);
    const col = reed ? ['#9c9466', '#b0a675', '#8a875a', '#77804a', '#c0b283', '#a39a6a'][Math.floor(rnd() * 6)] : ['#8f9a55', '#a5a462', '#b9b178', '#7f8c4a', '#c4b582'][Math.floor(rnd() * 5)];
    const x1 = x0 + lean, cx = x0 + lean * 0.2, cy = S * 0.45;
    g.fillStyle = col;
    g.beginPath(); g.moveTo(x0 - w, S); g.quadraticCurveTo(cx - w * 0.6, cy, x1, top); g.quadraticCurveTo(cx + w * 0.6, cy, x0 + w, S); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,220,0.18)'; g.lineWidth = Math.max(0.6, w * 0.3);
    g.beginPath(); g.moveTo(x0, S); g.quadraticCurveTo(cx, cy, x1, top); g.stroke();
    if (reed && i % 3 === 0) {
      // a plume: a soft brown feather at the top of a straight stalk
      const px = x0 + lean * 0.35, py = S * (0.05 + rnd() * 0.12);
      g.strokeStyle = '#8a7a58'; g.lineWidth = Math.max(1, S * 0.004);
      g.beginPath(); g.moveTo(x0, S); g.lineTo(px, py + S * 0.1); g.stroke();
      for (let k = 0; k < 22; k++) {
        g.fillStyle = `rgba(${150 + rnd() * 40},${125 + rnd() * 30},${92 + rnd() * 25},0.95)`;
        g.beginPath(); g.ellipse(px + (rnd() - 0.5) * S * 0.025, py + rnd() * S * 0.09, S * 0.004, S * 0.016, (rnd() - 0.5) * 0.6, 0, 7); g.fill();
      }
    }
  }
  return vegCutTex(cv, key);
}
function vegBarkTex(kind) {
  const key = 'veg-bark|' + kind;
  if (TEX.has(key)) return TEX.get(key);
  const W = 128, H = 256;
  const base = { grey: '#6f6a62', dark: '#4e4640', brown: '#5f4c3b', birch: '#e3dfd6' }[kind] || '#6b5a48';
  // the real bark picture (texlib.js) in the tree's own colour (not the birch: its bark is white with dark bands)
  const lib = kind !== 'birch' && libSet('Bark012') ? libTintCanvas('Bark012', base, 1.15) : null;
  const cv = lib || makeCanvas(W, H), g = cv.getContext('2d');
  const rnd = vegRng(kind.length * 31 + 3);
  if (lib) {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO;
    t.userData.hq = { strength: 3 };
    t.userData.lib = 'Bark012';
    TEX.set(key, t);
    return t;
  }
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  if (kind === 'birch') {
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(30,28,26,${0.5 + rnd() * 0.4})`; g.fillRect(rnd() * W, rnd() * H, 4 + rnd() * 16, 1 + rnd() * 2.5); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(170,160,150,0.35)'; g.fillRect(rnd() * W, rnd() * H, 10 + rnd() * 30, 1); }
  } else {
    // furrows running up the trunk, broken into plates
    for (let x = 0; x < W; x += 3 + rnd() * 5) {
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '20,16,12' : '200,190,175'},${0.12 + rnd() * 0.22})`;
      g.lineWidth = 1 + rnd() * 2.5;
      g.beginPath(); let xx = x; g.moveTo(xx, 0);
      for (let y = 0; y <= H; y += 16) { xx += (rnd() - 0.5) * 4; g.lineTo(xx, y); }
      g.stroke();
    }
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(20,16,12,0.25)'; g.fillRect(rnd() * W, rnd() * H, 6 + rnd() * 10, 1.5); }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  tex.userData.hq = { strength: 3 };
  TEX.set(key, tex);
  return tex;
}

/* ───────── materials ───────── */
/** leaf cards: cut out along the leaves, lit on both sides with the crown's normals */
function vegLeafMat(tex, key, glow) {
  return mat('veg-m|' + key, () => {
    // Lambert: leaves are matt (no shine at the crown's edge), and it is cheaper on phones
    const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true });
    // smooth edges where the screen is drawn with several samples (computers, phones in Beautiful)
    m.alphaToCoverage = true;
    m.emissive = new THREE.Color(glow || '#0b1206');
    m.userData.noHQ = true; m.userData.noCap = true;
    m.onBeforeCompile = sh => {
      // the back of a card has the same (crown) normal as its front: no dark backs
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    m.customProgramCacheKey = () => 'vegleaf';
    return m;
  });
}
const vegLeaves = (type, q) => vegLeafMat(vegLeafTex(type, q === 'high'), 'leaf|' + type + '|' + q, type === 'maple' ? '#140604' : null);
const vegBlades = (kind, q) => vegLeafMat(vegBladeTex(kind, q === 'high'), 'blade|' + kind + '|' + q, '#11120a');
const vegBarkMat = kind => mat('veg-m|bark|' + kind, () => new THREE.MeshStandardMaterial({ map: vegBarkTex(kind), vertexColors: true, roughness: 0.95, metalness: 0 }));

/* ───────── geometry ───────── */
class VegBuf {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.v = 0; }
  vert(p, n, u, v, c) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(u, v); this.c.push(c[0], c[1], c[2]); return this.v++; }
  geo() {
    if (!this.v) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    // (normals and shades in bytes: 26 instead of 44 bytes a corner – task 0029)
    g.setAttribute('normal', new THREE.BufferAttribute(Int8Array.from(this.n, v => Math.round(Math.max(-1, Math.min(1, v)) * 127)), 3, true));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(Uint8Array.from(this.c, v => Math.round(Math.max(0, Math.min(1, v)) * 255)), 3, true));
    g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vLen = a => Math.hypot(a[0], a[1], a[2]);
const vNorm = a => { const l = vLen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vRand = rnd => { const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), z, r * Math.sin(a)]; };
const vLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** a tapered tube along points (a trunk or a branch) */
function vegTube(B, pts, r0, r1, radial, col) {
  const n = pts.length;
  if (n < 2) return;
  let len = 0;
  const acc = [0];
  for (let i = 1; i < n; i++) { len += vLen(vSub(pts[i], pts[i - 1])); acc.push(len); }
  // frames by parallel transport
  let T = vNorm(vSub(pts[1], pts[0]));
  let N = vNorm(vCross(T, Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const base = B.v;
  for (let i = 0; i < n; i++) {
    const T2 = vNorm(vSub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    // turn the frame with the tangent
    const ax = vCross(T, T2), s = vLen(ax);
    if (s > 1e-6) { const k = vNorm(ax), c = vDot(T, T2), sn = s; N = vAdd(vAdd(vMul(N, c), vMul(vCross(k, N), sn)), vMul(k, vDot(k, N) * (1 - c))); }
    T = T2;
    const Bn = vCross(T, N);
    const t = acc[i] / (len || 1), r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, d = vAdd(vMul(N, Math.cos(a)), vMul(Bn, Math.sin(a)));
      B.vert(vAdd(pts[i], vMul(d, r)), d, j / radial, acc[i] * 0.9, col);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = base + i * (radial + 1) + j, b = a + radial + 1;
    B.i.push(a, b, a + 1, a + 1, b, b + 1);
  }
}
/** points on a curved branch from p0 to p1 (bending through c), with a little wobble */
function vegCurve(p0, c, p1, steps, rnd, wob) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
    let p = [a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1], a * p0[2] + b * c[2] + d * p1[2]];
    if (wob && i > 0 && i < steps) p = vAdd(p, vMul(vRand(rnd), wob));
    out.push(p);
  }
  return out;
}
/** one leaf card: from its base along u (the twig's direction), facing n; lit with the crown's normals */
function vegCard(B, base, u, n, w, h, col, C) {
  const r = vNorm(vCross(u, n));
  const pts = [vAdd(base, vMul(r, -w / 2)), vAdd(base, vMul(r, w / 2)), vAdd(vAdd(base, vMul(r, w / 2)), vMul(u, h)), vAdd(vAdd(base, vMul(r, -w / 2)), vMul(u, h))];
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const i0 = B.v;
  for (let k = 0; k < 4; k++) {
    const p = pts[k];
    let nn;
    if (C) { const d = [(p[0] - C.x) / (C.R * C.R), (p[1] - C.y) / (C.RY * C.RY), (p[2] - C.z) / (C.R * C.R)]; nn = vNorm(vAdd(vNorm(d), [0, 0.32, 0])); }
    else nn = vNorm(vAdd(n, [0, 0.5, 0]));
    B.vert(p, nn, uvs[k][0], uvs[k][1], col);
  }
  B.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
}
/** how dark a card deep in the crown is (the crown shades itself), and lower down */
function vegShade(p, C, rnd) {
  const e = Math.hypot((p[0] - C.x) / C.R, (p[1] - C.y) / C.RY, (p[2] - C.z) / C.R);
  const ao = 0.36 + 0.64 * Math.min(1, Math.max(0, (e - 0.18) / 0.85));
  const hy = Math.min(1, Math.max(0, (p[1] - (C.y - C.RY)) / (2 * C.RY)));
  const k = ao * (0.72 + 0.28 * hy) * (0.9 + rnd() * 0.2);
  return [k * (0.97 + rnd() * 0.06), k * (0.97 + rnd() * 0.06), k * (0.95 + rnd() * 0.05)];
}
/** the surface area of an ellipsoid (Knud Thomsen), for how many cards a crown needs */
function vegArea(R, RY) { const p = 1.6075, a = R, c = RY; return 4 * Math.PI * Math.pow((Math.pow(a * a, p) + 2 * Math.pow(a * c, p)) / 3, 1 / p); }

/** grow one tree / shrub: { bark, leaves } geometries, base at (0, 0, 0) */
function vegGrow(spName, D, H, variant, q, far, lod) {
  const sp = VEG_SP[spName] || VEG_SP.broadleaf;
  // (the lighter versions – task 0029: the same branches and clumps – the same random numbers – but no twigs, thinner
  //  tubes and fewer, bigger cards covering the same crown; the far one has only its stems)
  const LD = VEG_LOD[lod || 0];
  const L = LD ? { ...VEG_Q[q], radial: 3, trunkRadial: LD.stems ? 4 : 5, card: VEG_Q[q].card * LD.card, dens: VEG_Q[q].dens * LD.dens, strands: VEG_Q[q].strands * LD.dens * 1.8 } : VEG_Q[q];
  const rnd = vegRng(spName.length * 7919 + variant * 104729 + Math.round(D * 10) * 31 + Math.round(H * 10));
  const R = D / 2;
  const crownBot = H * sp.crownBot;
  const RY = Math.max(0.2, (H - crownBot) / 2) * (sp.flat || 1);
  const C = { x: 0, y: H - RY, z: 0, R, RY };
  const bark = new VegBuf(), leaves = new VegBuf();
  const tips = [];
  const r0 = Math.max(0.012, (0.02 + 0.017 * H) * sp.thick);
  const white = [1, 1, 1];
  const inCrown = (p, k = 1) => {
    const e = Math.hypot((p[0] - C.x) / C.R, (p[1] - C.y) / C.RY, (p[2] - C.z) / C.R);
    return e <= k ? p : [C.x + (p[0] - C.x) * k / e, C.y + (p[1] - C.y) * k / e, C.z + (p[2] - C.z) * k / e];
  };
  const shellR = y => R * Math.sqrt(Math.max(0, 1 - ((y - C.y) / C.RY) ** 2));
  const subBranches = (path, rb, len, k) => {
    for (let s = 0; s < k; s++) {
      const t = 0.35 + (s + rnd()) / k * 0.55, idx = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
      const m = path[idx], dir = vNorm(vSub(path[idx + 1], path[idx]));
      const out = vNorm([m[0] - C.x, 0.0001, m[2] - C.z]);
      const d2 = vNorm(vAdd(vAdd(vMul(dir, 0.5), vMul(vRand(rnd), 0.75)), vAdd(vMul(out, 0.4), [0, 0.3, 0])));
      const end = inCrown(vAdd(m, vMul(d2, len * (0.3 + rnd() * 0.25))), 0.97);
      const pts = vegCurve(m, vAdd(m, vMul(vSub(end, m), 0.5)), end, 3, rnd, 0.02 * len);
      if (!LD) vegTube(bark, pts, rb * 0.42, 0.006, Math.max(3, L.radial - 2), white);
      tips.push(end);
    }
  };
  if (sp.shape === 'bush') {
    // a shrub: stems from the ground into the crown
    const n = Math.round(sp.stems * (q === 'high' ? 1 : 0.7));
    for (let s = 0; s < n; s++) {
      const a = s * 2.399 + rnd() * 0.5, end = inCrown([Math.cos(a) * R * (0.4 + rnd() * 0.4), C.y + (rnd() - 0.2) * RY * 0.8, Math.sin(a) * R * (0.4 + rnd() * 0.4)], 0.9);
      const pts = vegCurve([Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], [end[0] * 0.3, end[1] * 0.5, end[2] * 0.3], end, 4, rnd, 0.02);
      if (!LD) vegTube(bark, pts, 0.015, 0.004, 3, white);
      tips.push(end);
      if (q === 'high') subBranches(pts, 0.015, R, 1);
    }
    for (let i = 0; i < 6; i++) tips.push(inCrown(vAdd([C.x, C.y, C.z], vMul(vRand(rnd), R * 0.7)), 0.85));
  } else if (sp.shape === 'column') {
    // a column (Lombardy poplar): one straight trunk to the top, many short steep branches
    const top = [0, H * 0.97, 0];
    const trunk = vegCurve([0, 0, 0], [rnd() * 0.1, H * 0.5, rnd() * 0.1], top, 10, rnd, 0.015);
    vegTube(bark, trunk, r0, 0.03, L.trunkRadial, white);
    const nb = Math.round(sp.nb * L.nb);
    for (let i = 0; i < nb; i++) {
      const y = crownBot + 0.6 + (i + rnd()) / nb * (H * 0.9 - crownBot - 0.6), a = i * 2.399 + rnd() * 0.7;
      const p = [0, y, 0], rr = shellR(y + RY * 0.12);
      const end = inCrown([Math.cos(a) * rr * 0.85, y + rr * (1.5 + rnd()), Math.sin(a) * rr * 0.85], 0.95);
      const pts = vegCurve(p, vAdd(p, [Math.cos(a) * rr * 0.4, rr * 0.4, Math.sin(a) * rr * 0.4]), end, 3, rnd, 0.03);
      if (!(LD && LD.stems)) vegTube(bark, pts, r0 * (0.3 - 0.2 * (y / H)), 0.008, Math.max(3, L.radial - 2), white);
      tips.push(end);
      if (q === 'high' && i % 2 === 0) subBranches(pts, r0 * 0.2, rr * 2, 1);
    }
  } else {
    // a round crown on one or more stems (weeping: the branches arch out and hang down at the edge)
    const stems = sp.stems || 1;
    for (let s = 0; s < stems; s++) {
      const a0 = s * (Math.PI * 2 / stems) + rnd() * 0.6;
      const lean = stems > 1 ? (sp.lean || 0.3) * (0.8 + rnd() * 0.4) : 0.04;
      const dirOut = [Math.cos(a0), 0, Math.sin(a0)];
      const base = stems > 1 ? vMul(dirOut, 0.06) : [0, 0, 0];
      const topY = sp.shape === 'weep' ? crownBot + RY * 0.6 : C.y + RY * (stems > 1 ? 0.2 : 0.45);
      const topXZ = Math.min(R * 0.55, Math.tan(lean) * topY);
      const top = [dirOut[0] * topXZ, topY, dirOut[2] * topXZ];
      const stemPts = vegCurve(base, [dirOut[0] * topXZ * 0.6, topY * 0.45, dirOut[2] * topXZ * 0.6], top, 8, rnd, 0.012 * H);
      const rs = r0 / Math.sqrt(stems);
      vegTube(bark, stemPts, rs, rs * 0.35, L.trunkRadial, white);
      const nb = Math.max(2, Math.round(sp.nb * L.nb / Math.sqrt(stems)));
      for (let i = 0; i < nb; i++) {
        // branches leave the stem in the crown's lower half and reach for its outside
        const t = 0.45 + (i + rnd()) / nb * 0.5, idx = Math.min(stemPts.length - 1, Math.round(t * (stemPts.length - 1)));
        const p = stemPts[idx];
        const a = a0 + i * 2.399 + rnd() * 0.6;
        const yT = sp.shape === 'weep' ? C.y + RY * (0.45 + rnd() * 0.45) : C.y + (rnd() * 1.15 - 0.3) * RY * 0.85;
        const rr = shellR(yT) * (0.72 + rnd() * 0.25);
        const end = inCrown([Math.cos(a) * rr + top[0] * 0.3, Math.max(p[1] + 0.2, yT), Math.sin(a) * rr + top[2] * 0.3], 0.96);
        const len = vLen(vSub(end, p));
        const ctrl = vAdd(vAdd(p, vMul(vSub(end, p), 0.45)), [0, len * (sp.shape === 'weep' ? 0.35 : 0.12), 0]);
        const pts = vegCurve(p, ctrl, end, 5, rnd, 0.025 * len);
        if (!(LD && LD.stems)) vegTube(bark, pts, rs * (0.38 + rnd() * 0.15), 0.012, L.radial, white);
        tips.push(end);
        subBranches(pts, rs * 0.42, len, L.sub);
      }
    }
    // a few clumps on the top and outside, where the twigs fill the crown
    for (let i = 0; i < 6; i++) { const d = vRand(rnd); d[1] = Math.abs(d[1]) * 0.8 + 0.2; tips.push(inCrown([d[0] * R * 0.8, C.y + d[1] * RY * 0.8, d[2] * R * 0.8], 0.92)); }
  }
  // the leaves: cards in clumps around the branch ends
  const area = vegArea(R, RY);
  const card = sp.card * L.card;
  let N = Math.round(area * 30 * L.dens * (far ? 0.6 : 1) * (sp.shape === 'bush' ? 1.5 : 1));
  N = Math.max(LD ? 24 : q === 'high' ? 120 : 50, Math.min(q === 'high' ? 6000 : 2000, N));
  if (sp.shape === 'weep') {
    // the willow: curtains of hanging twigs from the upper crown down to near the ground, plus the crown's top
    const strands = Math.round((60 + area * 0.8) * L.strands * (far ? 0.7 : 1));
    const step = card * 0.75;
    let used = 0;
    for (let s = 0; s < strands; s++) {
      const a = rnd() * Math.PI * 2, pol = 0.25 + rnd() * 0.95;
      const s0 = [Math.cos(a) * Math.sin(pol) * R * 0.95, C.y + Math.cos(pol) * RY * 0.95, Math.sin(a) * Math.sin(pol) * R * 0.95];
      const yEnd = H * (0.1 + rnd() * 0.22), out = vNorm([s0[0], 0, s0[2]]);
      const n2 = Math.max(2, Math.floor((s0[1] - yEnd) / step));
      for (let k = 0; k < n2; k++) {
        const t = k / n2, sw = Math.sin(Math.min(1, t * 2.2) * Math.PI / 2);
        const p = vAdd(s0, vAdd(vMul(out, R * 0.12 * sw), [0, -(s0[1] - yEnd) * t, 0]));
        const u = vNorm(vAdd([0, -1, 0], vAdd(vMul(out, 0.18), vMul(vRand(rnd), 0.18))));
        const ang = a + (rnd() - 0.5) * 2.2, n = vNorm([Math.cos(ang), 0, Math.sin(ang)]);
        const w = card * 0.95 * (0.8 + rnd() * 0.4);
        vegCard(leaves, p, u, vNorm(vSub(n, vMul(u, vDot(n, u)))), w, w * 1.5, vegShade(vAdd(p, vMul(out, R * 0.25)), C, rnd), C);
        used++;
      }
    }
    N = Math.max(40, Math.round(N * 0.45));
    void used;
  }
  const per = Math.max(1, Math.round(N / Math.max(1, tips.length)));
  for (const tip of tips) {
    const rc = R * (sp.shape === 'column' ? 0.5 : sp.shape === 'bush' ? 0.55 : 0.34) * (0.8 + rnd() * 0.4);
    for (let j = 0; j < per; j++) {
      const out0 = vNorm([(tip[0] - C.x) / C.R, (tip[1] - C.y) / C.RY, (tip[2] - C.z) / C.R]);
      let p = vAdd(vAdd(tip, vMul(vRand(rnd), rc * Math.cbrt(rnd()))), vMul(out0, rc * 0.25));
      p = inCrown(p, 1.04);
      if (sp.shape === 'bush' && p[1] < 0.06) p[1] = 0.06 + rnd() * 0.1;
      const out = vNorm([(p[0] - C.x) / (C.R * C.R), (p[1] - C.y) / (C.RY * C.RY), (p[2] - C.z) / (C.R * C.R)]);
      const u = vNorm(vAdd(vAdd(vMul(out, 0.75), vMul(vRand(rnd), 0.6)), [0, sp.shape === 'weep' ? -0.1 : 0.22, 0]));
      const n0 = vRand(rnd), n = vNorm(vSub(n0, vMul(u, vDot(n0, u))));
      const w = card * (0.8 + rnd() * 0.4);
      vegCard(leaves, vSub(p, vMul(u, w * 0.35)), u, n, w, w, vegShade(p, C, rnd), C);
    }
  }
  return { bark: bark.geo(), leaves: leaves.geo() };
}
const VEG_TPL = new Map();
function vegTemplate(spName, D, H, variant, q, far, lod) {
  // per 50 cm of size: the cards keep their real size, the rest is scaled
  const d = Math.max(0.5, Math.round(D * 2) / 2), hh = Math.max(0.5, Math.round(H * 2) / 2);
  const key = [spName, d, hh, variant, q, far ? 1 : 0].join('|') + (lod ? '|lod' + lod : '');
  if (!VEG_TPL.has(key)) VEG_TPL.set(key, { ...vegGrow(spName, d, hh, variant, q, far, lod), D: d, H: hh, key });
  return VEG_TPL.get(key);
}
/** an ornamental grass: blades in crossed cards, leaning out */
function vegGrassGeo(D, H, q, seed) {
  const B = new VegBuf(), rnd = vegRng(seed), n = q === 'high' ? 9 : 5;
  const C = { x: 0, y: H * 0.35, z: 0, R: D / 2, RY: H * 0.6 };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI + rnd() * 0.3, tilt = (i % 2 ? 1 : -1) * (0.1 + rnd() * 0.15);
    const n0 = [Math.cos(a), 0, Math.sin(a)], side = vCross([0, 1, 0], n0);
    const u = vNorm(vAdd([0, 1, 0], vMul(side, tilt)));
    const w = D * (0.75 + rnd() * 0.25), h = H * (0.85 + rnd() * 0.25);
    const k = 0.85 + rnd() * 0.25;
    vegCard(B, [(rnd() - 0.5) * 0.06, 0, (rnd() - 0.5) * 0.06], u, n0, w, h, [k, k, k * 0.96], C);
  }
  return B.geo();
}
/** leaves standing out of a clipped hedge: its sides and top get a ragged, leafy outline */
function vegHedgeGeo(LP, y0, h, t, q, seed) {
  const B = new VegBuf(), rnd = vegRng(seed), L = VEG_Q[q];
  const card = 0.34 * L.card, dens = 46 * L.dens;
  for (let i = 1; i < LP.length; i++) {
    const a = LP[i - 1], b = LP[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, nx = -dz, nz = dx;
    const faces = [[1, h], [-1, h], [0, t]];
    for (const [side, extent] of faces) {
      const count = Math.round(len * extent * dens);
      for (let k = 0; k < count; k++) {
        const s = rnd() * len;
        let p, out;
        if (side) {
          const yy = y0 + 0.05 + rnd() * (h - 0.05);
          p = [a[0] + dx * s + nx * side * t / 2, yy, a[1] + dz * s + nz * side * t / 2];
          out = [nx * side, 0, nz * side];
        } else {
          const o = (rnd() - 0.5) * t;
          p = [a[0] + dx * s + nx * o, y0 + h, a[1] + dz * s + nz * o];
          out = [0, 1, 0];
        }
        // a leafy patch facing out of the hedge, a little tilted, standing a few cm proud
        const n = vNorm(vAdd(out, vMul(vRand(rnd), 0.45)));
        const up0 = side ? [0, 1, 0] : [dx, 0, dz];
        const u = vNorm(vAdd(vSub(up0, vMul(n, vDot(up0, n))), vMul(vRand(rnd), 0.25)));
        const w = card * (0.75 + rnd() * 0.5);
        const hy = Math.min(1, Math.max(0, (p[1] - y0) / h));
        const kk = (0.62 + 0.38 * hy) * (0.88 + rnd() * 0.24);
        const base = vAdd(vSub(p, vMul(u, w * 0.5)), vMul(out, 0.01 + rnd() * 0.05));
        const r = vNorm(vCross(u, n));
        const pts = [vAdd(base, vMul(r, -w / 2)), vAdd(base, vMul(r, w / 2)), vAdd(vAdd(base, vMul(r, w / 2)), vMul(u, w)), vAdd(vAdd(base, vMul(r, -w / 2)), vMul(u, w))];
        const nn = vNorm(vAdd(out, [0, 0.35, 0]));
        const i0 = B.v;
        pts.forEach((pp, j) => B.vert(pp, nn, [0, 1, 1, 0][j], [0, 0, 1, 1][j], [kk, kk, kk * 0.97]));
        B.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      }
    }
  }
  return B.geo();
}
/** a belt of reeds along a line (plan points), standing in the water at y0 */
function vegReedGeo(LP, y0, width, H, q, seed) {
  const B = new VegBuf(), rnd = vegRng(seed);
  // a dense belt: wide cards (a stand of reeds each), most of them facing out of the bank, overlapping
  const step = q === 'high' ? 0.32 : 0.55, per = q === 'high' ? 3 : 2;
  for (let i = 1; i < LP.length; i++) {
    const a = LP[i - 1], b = LP[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, nx = -dz, nz = dx;
    const along = Math.atan2(dz, dx);
    for (let s = rnd() * step; s < len; s += step * (0.7 + rnd() * 0.6)) {
      for (let k = 0; k < per; k++) {
        const o = (rnd() - 0.5) * width, x = a[0] + dx * s + nx * o, z = a[1] + dz * s + nz * o;
        const hh = H * (0.6 + rnd() * 0.6);
        // facing across the bank (seen full from the water and the other side), turned up to 60°
        const ang = along + Math.PI / 2 + (rnd() - 0.5) * 2.1, n0 = [Math.cos(ang), 0, Math.sin(ang)];
        const u = vNorm([(rnd() - 0.5) * 0.08, 1, (rnd() - 0.5) * 0.08]);
        const w = 0.9 + rnd() * 0.6, kk = 0.78 + rnd() * 0.3;
        // the card's middle on the belt (vegCard starts at the bottom middle)
        vegCard(B, [x, y0, z], u, vNorm(vSub(n0, vMul(u, vDot(n0, u)))), w, hh, [kk, kk, kk * 0.95], null);
      }
    }
  }
  return B.geo();
}

Object.assign(View3D.prototype, {
  /** 'mid' (Beautiful, phones) or 'high' (computers); Fast: null (garden.js keeps its simple plants) */
  vegLevel() { return this.fast ? null : this.high ? 'high' : 'mid'; },
  /** a garden plant, a street tree or a tree in the park, grown properly */
  vegPlant(G, pl, lv, add, opts = {}) {
    const q = this.vegLevel();
    const K = G_PLANTS[pl.kind] || G_PLANTS.shrub;
    const d = pl.d || K.d, hh = pl.h || K.h;
    const seed = Math.floor(Math.abs(pl.x * 131 + pl.y * 17)) + 7;
    const pick = pl.id ? { plant: pl.id } : null;
    const spName = opts.species || vegSpecies(pl);
    const keys = G.userData.vegKeys || (G.userData.vegKeys = new Set());
    // geos: the shape and its lighter versions (or only the shape), tk: the templates' names (kept while a garden uses them)
    const put = (geos, material, x, y, z, rot, sx, sy, tk) => {
      const geo = geos[0];
      if (!geo) return null;
      for (const k of tk) keys.add(k);
      const inst = this._vegInst;
      if (inst) { vegInstAdd(inst, geos, material, x, y, z, rot, sx, sy, pick); return null; }
      const m = add(geo, material, { cast: true, pick });
      m.position.set(x, y, z); m.rotation.y = rot; m.scale.set(sx, sy, sx);
      m.userData.keep = true; m.userData.veg = true;
      return m;
    };
    const rot = ((seed * 37) % 360) * Math.PI / 180;
    if (spName === 'grass') {
      const key = 'grass|' + Math.round(d * 4) + '|' + Math.round(hh * 4) + '|' + (seed % 3) + '|' + q;
      if (!VEG_TPL.has(key)) VEG_TPL.set(key, vegGrassGeo(Math.round(d * 4) / 4 || 0.25, Math.round(hh * 4) / 4 || 0.25, q, seed % 3 + 5));
      put([VEG_TPL.get(key)], vegBlades('grass', q), pl.x, lv, pl.y, rot, 1, 1, [key]);
      return;
    }
    if (spName === 'pot') {
      add(new THREE.CylinderGeometry(d * 0.42, d * 0.32, hh * 0.45, 20).translate(pl.x, lv + hh * 0.225, pl.y), mat('g|pot', () => new THREE.MeshStandardMaterial({ color: 0x8c5a3c, roughness: 0.8 })), { cast: true, pick });
      const tpl = vegTemplate('shrub', d * 0.95, hh * 0.6, seed % 3, q);
      put([tpl.leaves], vegLeaves('small', q), pl.x, lv + hh * 0.4, pl.y, rot, d * 0.95 / tpl.D, hh * 0.6 / tpl.H, [tpl.key]);
      return;
    }
    const sp = VEG_SP[spName] || VEG_SP.broadleaf;
    const tpl = vegTemplate(spName, d, hh, seed % 3, q, opts.far);
    // (shrubs are small and low: no lighter versions)
    const lo = this._vegInst && sp.shape !== 'bush' ? [1, 2].map(k => vegTemplate(spName, d, hh, seed % 3, q, opts.far, k)) : [];
    const sx = d / tpl.D, sy = hh / tpl.H, tk = [tpl, ...lo].map(x => x.key);
    put([tpl, ...lo].map(x => x.bark), vegBarkMat(sp.bark), pl.x, lv, pl.y, rot, sx, sy, tk);
    put([tpl, ...lo].map(x => x.leaves), vegLeaves(sp.leaf, q), pl.x, lv, pl.y, rot, sx, sy, tk);
  },
  /** the leaves standing out of a hedge (the clipped box stays underneath) */
  vegHedge(LP, lv, l, add, pick) {
    const q = this.vegLevel();
    if (!q) return;
    const seed = Math.floor(Math.abs(LP[0][0] * 71 + LP[0][1] * 13)) + 3;
    const geo = vegHedgeGeo(LP, lv, l.h, l.t, q, seed);
    if (!geo) return;
    const m = add(geo, vegLeaves('hedge', q), { cast: true, pick });
    m.userData.veg = true;
  },
  /** reeds along a bank */
  vegReeds(LP, y0, width, H, add) {
    const q = this.vegLevel();
    if (!q || LP.length < 2) return;
    const geo = vegReedGeo(LP, y0, width, H, q, Math.floor(Math.abs(LP[0][0] * 31 + LP[0][1] * 7)) + 1);
    if (!geo) return;
    const m = add(geo, vegBlades('reed', q), { cast: true });
    m.userData.veg = true;
    // (merged: no hidden copy kept for tapping – batch.js)
    m.userData.standIn = null;
  },
});

/* ───────── many trees, one shape: instancing and the lighter versions far away (task 0029) ───────── */
/** one plant into the garden's list of instances (per shape and material) */
function vegInstAdd(inst, geos, material, x, y, z, rot, sx, sy, pick) {
  const geo = geos[0], k = geo.uuid + '|' + material.uuid;
  let e = inst.get(k);
  // (a missing lighter version: the one before it)
  if (!e) inst.set(k, e = { geos: [0, 1, 2].map(i => geos[Math.min(i, geos.length - 1)] || geo), material, list: [] });
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const bs = geo.boundingSphere, m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(sx, sy, sx));
  // where it is (the middle of its shape) and how big, for the camera's distance and view
  const c = bs.center.clone().applyMatrix4(m);
  e.list.push({ m, c, r: bs.radius * Math.max(sx, sy) * 1.05, pick, lv: -2 });
}
/** the gardens built (their groups): the shapes they use stay, the others are let go (vegPrune) */
const VEG_GARDENS = new Set();
const _vegFr = new THREE.Frustum(), _vegM = new THREE.Matrix4(), _vegS = new THREE.Sphere();
Object.assign(View3D.prototype, {
  /** a garden is about to be built: collect its plants as instances when this view is merged (batch.js) */
  vegInstBegin(G, cutH) {
    VEG_GARDENS.add(G);
    this._vegInst = this.batchOn() ? new Map() : null;
    this._vegCut = cutH != null;
  },
  /** the garden is built: per shape and material an InstancedMesh for each version (drawn, layer 0) and the shadows
   *  (layer 1, in squares) */
  vegInstEnd(G) {
    const inst = this._vegInst;
    this._vegInst = null;
    if (!inst) return;
    const groups = [], full = typeof window !== 'undefined' && window.__hpVegFull;
    const mk = (geo, material, n) => {
      const im = new THREE.InstancedMesh(geo, material, n);
      im.userData.veg = true; im.userData.vegInst = true; im.userData.keep = true;
      material.userData.cutClip = this._vegCut;
      G.add(im);
      return im;
    };
    for (const e of inst.values()) {
      // drawn: one per version (the same shape twice is one); the camera picks the trees for each (vegLodStep)
      const ims = [];
      e.geos.forEach((geo, i) => {
        if (i && geo === e.geos[i - 1]) { ims.push(ims[i - 1]); return; }
        const im = mk(geo, e.material, e.list.length);
        im.count = 0; im.visible = false;
        im.castShadow = false; im.receiveShadow = true;
        // (vegLodStep leaves out what is out of view itself)
        im.frustumCulled = false;
        ims.push(im);
      });
      // the shadows: every tree, in squares (the sun's shadow cameras leave out the squares outside them)
      const cells = new Map();
      for (const it of e.list) {
        const ck = Math.floor(it.c.x / VEG_CELL) + ',' + Math.floor(it.c.z / VEG_CELL);
        if (!cells.has(ck)) cells.set(ck, []);
        cells.get(ck).push(it);
      }
      for (const list of cells.values()) {
        const sh = mk(e.geos[full ? 0 : 1], e.material, list.length);
        list.forEach((it, i) => sh.setMatrixAt(i, it.m));
        sh.castShadow = true; sh.receiveShadow = false;
        sh.layers.set(1);
        sh.userData.vegShadow = true;
        sh.computeBoundingSphere();
      }
      groups.push({ list: e.list, ims });
    }
    groups.G = G;
    G.userData.vegLod = groups;
  },
  /** the sun's shadow cameras also see layer 1 (the trees' shadows) */
  vegShadowLayers() {
    for (const o of this.scene.children) if (o.shadow && o.shadow.camera && !o.shadow.camera.layers.isEnabled(1)) o.shadow.camera.layers.enable(1);
  },
  /** which trees are in view, and in which version (by their distance from the camera); true when that changed */
  vegLodStep(force) {
    const L = this.vegLod;
    if (!L || !L.length) return false;
    this.vegShadowLayers();
    const cam = this.camera;
    cam.updateMatrixWorld();
    _vegM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const key = _vegM.elements.map(v => v.toFixed(4)).join();
    if (!force && key === this._vegKey) return false;
    this._vegKey = key;
    _vegFr.setFromProjectionMatrix(_vegM);
    const G = L.G, gp = G.position, c = cam.position;
    const full = typeof window !== 'undefined' && window.__hpVegFull;
    let any = false;
    for (const g of L) {
      let changed = !!force;
      for (const it of g.list) {
        _vegS.center.copy(it.c).add(gp); _vegS.radius = it.r;
        let lv = -1;
        if (_vegFr.intersectsSphere(_vegS)) {
          const d = _vegS.center.distanceTo(c);
          // (a few metres' margin both ways: a tree on the edge stays as it is)
          const was = it.lv, edge = k => VEG_NEAR[k] + (was > k ? -3 : was >= 0 ? 3 : 0);
          lv = full ? 0 : d < edge(0) ? 0 : d < edge(1) ? 1 : 2;
        }
        if (lv !== it.lv) { it.lv = lv; changed = true; }
      }
      if (!changed) continue;
      any = true;
      const n = new Map(), picks = new Map();
      for (const im of g.ims) { n.set(im, 0); picks.set(im, []); }
      for (const it of g.list) {
        if (it.lv < 0) continue;
        const im = g.ims[it.lv];
        im.setMatrixAt(n.get(im), it.m); n.set(im, n.get(im) + 1); picks.get(im).push(it.pick);
      }
      for (const [im, k] of n) {
        im.count = k; im.visible = k > 0;
        im.instanceMatrix.needsUpdate = true;
        im.userData.picks = picks.get(im);
        im.computeBoundingSphere();
      }
    }
    return any;
  },
  /** for the photo render: the path tracer takes meshes one by one, not instances – the trees become plain meshes for
   *  the render (each in the version for its distance, also those out of view: their shadows and reflections);
   *  returns what puts it back */
  vegFlatten() {
    const L = this.vegLod, added = [], hidden = [];
    if (!L) return () => {};
    const G = L.G, c = this.camera.position.clone().sub(G.position);
    G.traverse(o => { if (o.userData.vegInst && o.visible) { o.visible = false; hidden.push(o); } });
    for (const g of L) {
      const by = new Map();
      for (const it of g.list) {
        const d = it.c.distanceTo(c), im = g.ims[d < VEG_NEAR[0] ? 0 : d < VEG_NEAR[1] ? 1 : 2];
        if (!by.has(im)) by.set(im, []);
        by.get(im).push({ g: im.geometry, M: it.m, start: 0, count: Infinity });
      }
      for (const [im, items] of by) {
        const geo = im.geometry, names = ['position', 'normal', ...['uv', 'uv1', 'color'].filter(n => geo.attributes[n])];
        const flat = batchGeometry({ names, items });
        if (!flat) continue;
        const mesh = new THREE.Mesh(flat, im.material);
        mesh.castShadow = true; mesh.receiveShadow = true;
        G.add(mesh);
        added.push(mesh);
      }
    }
    return () => { for (const mesh of added) { mesh.removeFromParent(); mesh.geometry.dispose(); } for (const o of hidden) o.visible = true; };
  },
  /** how many grown shapes are held (for the tests: none once no view shows the site) */
  vegHeld() { return VEG_TPL.size; },
  /** the shapes no garden uses any more (the site switched off, another species …): let go of them */
  vegPrune() {
    const used = new Set();
    for (const G of [...VEG_GARDENS]) {
      // (a garden that is in no view any more – its view was cleared or closed)
      let root = G;
      while (root.parent) root = root.parent;
      if (!root.isScene) { VEG_GARDENS.delete(G); continue; }
      for (const k of G.userData.vegKeys || []) used.add(k);
    }
    for (const [k, t] of [...VEG_TPL]) {
      if (used.has(k)) continue;
      VEG_TPL.delete(k);
      for (const geo of t && t.isBufferGeometry ? [t] : [t && t.bark, t && t.leaves]) if (geo) geo.dispose();
    }
  },
});
