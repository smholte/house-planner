/* ───────────── texlib.js — real material pictures: bricks, roof tiles, floors, garden, kitchen, fabric, metal ─────────────
   build/textures.json (tools/build-textures.py, from ambientCG – CC0): per set the colour picture, its relief (normal
   map) and gloss (roughness, for metals also the metalness), its size in metres and what one plank or tile can be cut
   from (rows of planks between their joints, the cells of a tile grid, squares without a joint). The single file has it
   inside (TEXLIB_DATA); the hosted versions load textures.json next to index.html (the service worker keeps it offline).
   The pictures are decoded once at start; until then – and if they can't be had – the drawn textures are used, as
   before. When they arrive, the 3D views are built again with them.
   The bricks: one waalformaat wall in wildverband, coloured from a palette – the builder's three bricks as they are on
   the photo of the house, other brick colours (other houses, the neighbours) around their own colour (libBrick).
   Used as they are: the roof, the grass, gravel, bark, asphalt, decking, the kitchen's worktops and fronts, black metal (door handles,
   sink). Tinted to the chosen colour (the picture's light and dark over that colour): floors (oak in its tone, tiles,
   stone, concrete, carpet), roofs of the neighbours, the sofa fabric.
   Fast quality: colour only (no relief and gloss maps). */

const TEXLIB = { data: null, img: new Map(), ready: false, gen: 0, base: new Map(), detail: new Map(), sky: {} };

async function texlibInit() {
  try {
    let data = typeof TEXLIB_DATA !== 'undefined' ? TEXLIB_DATA : null;
    if (!data && /^https?:$/.test(location.protocol)) {
      const r = await fetch('textures.json');
      if (r.ok) data = await r.json();
    }
    if (!data || !data.sets) return false;
    TEXLIB.data = data;
    const jobs = [];
    for (const [id, s] of Object.entries(data.sets)) {
      for (const k of ['color', 'normal', 'rough', 'metal', 'kit', 'detail']) {
        if (!s[k]) continue;
        const im = new Image();
        im.decoding = 'async';
        im.src = s[k];
        TEXLIB.img.set(id + '|' + k, im);
        jobs.push(im.decode().catch(() => null));
      }
    }
    await Promise.all(jobs);
    // the skies (Poly Haven, CC0): day and sunset, high dynamic range
    for (const which of Object.keys(data.skies || {})) {
      try { TEXLIB.sky[which] = await libSkyDecode(data.skies[which]); } catch (e) { console.warn('sky', which, e); }
    }
    TEXLIB.ready = true;
    TEXLIB.gen++;
    // everything drawn before is made again with the pictures
    TEX.clear(); MAT.clear(); KMAT.clear(); FMAT.clear();
    if (app.project && app.panes && app.panes.some(p => p.kind === '3d')) app.refreshViews(false);
    return true;
  } catch (e) {
    console.warn('material pictures', e);
    return false;
  }
}
const libOn = () => TEXLIB.ready && !(app.settings && app.settings.realTex === false);
function libSet(id) { return libOn() ? TEXLIB.data.sets[id] || null : null; }
function libImg(id, kind = 'color') { const im = TEXLIB.img.get(id + '|' + kind); return im && im.complete && im.naturalWidth ? im : null; }
const libFast = () => quality3d(app.settings || {}) === 'fast';
/** a phone (or Fast): the pictures that are made in the app are made smaller – less memory (1 Nov) */
const libLowMem = () => libFast() || window.matchMedia('(pointer: coarse)').matches;
/** [w, h] in metres of one picture: the given size (a number or [w, h]), else the set's own */
const libSize = (s, size) => { const v = size == null ? s.size : size; return Array.isArray(v) ? v : [v, v]; };

/** one of a set's pictures as a texture repeating at size (metres of one picture: a number, or [w, h]), turned rot
 *  degrees (90: a wood's grain upright on a door) */
function libTex(id, kind = 'color', size = null, rot = 0) {
  const s = libSet(id), im = s && libImg(id, kind);
  if (!im) return null;
  const sz = libSize(s, size);
  const key = 'lib|' + id + '|' + kind + '|' + sz.map(v => (+v).toFixed(3)).join('x') + (rot ? '|r' + rot : '');
  if (TEX.has(key)) return TEX.get(key);
  // one texture per picture on the graphics card; the copies only repeat differently (they share the picture)
  let base = TEXLIB.base.get(id + '|' + kind);
  if (!base) {
    base = new THREE.Texture(im);
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    if (kind === 'color') base.colorSpace = THREE.SRGBColorSpace;
    base.anisotropy = MAX_ANISO;
    base.needsUpdate = true;
    TEXLIB.base.set(id + '|' + kind, base);
  }
  const t = base.clone();
  t.repeat.set(1 / sz[0], 1 / sz[1]);
  if (rot) t.rotation = rot * Math.PI / 180;
  t.userData = { lib: id };
  t.needsUpdate = true;
  TEX.set(key, t);
  return t;
}
/** the picture's light and dark only, around mid-grey (for tinting): 128 = the picture's own average */
function libDetail(id, contrast = 1) {
  const key = id + '|' + contrast;
  if (TEXLIB.detail.has(key)) return TEXLIB.detail.get(key);
  const im = libImg(id);
  if (!im) return null;
  const N = im.naturalWidth, M = im.naturalHeight, cv = makeCanvas(N, M), g = cv.getContext('2d');
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, N, M), p = d.data;
  let sum = 0;
  for (let i = 0; i < p.length; i += 4) sum += 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
  const mean = sum / (p.length / 4);
  for (let i = 0; i < p.length; i += 4) {
    const L = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
    const v = clamp(Math.round(128 + (L - mean) * contrast), 0, 255);
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  TEXLIB.detail.set(key, cv);
  return cv;
}
/** a colour with the picture's light and dark laid over it (soft light) */
function libTintCanvas(id, color, contrast = 1) {
  const det = libDetail(id, contrast);
  if (!det) return null;
  const cv = makeCanvas(det.width, det.height), g = cv.getContext('2d');
  g.fillStyle = typeof color === 'string' ? color : '#' + new THREE.Color().setRGB(...color, THREE.SRGBColorSpace).getHexString();
  g.fillRect(0, 0, cv.width, cv.height);
  g.globalCompositeOperation = 'soft-light';
  g.drawImage(det, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return cv;
}
function libTintTex(id, color, size, contrast = 1) {
  const s = libSet(id);
  if (!s) return null;
  const sz = libSize(s, size);
  const ckey = typeof color === 'string' ? color : color.map(v => (+v).toFixed(3)).join(',');
  const key = 'libt|' + id + '|' + ckey + '|' + contrast + '|' + sz.map(v => (+v).toFixed(3)).join('x');
  if (TEX.has(key)) return TEX.get(key);
  const cv = libTintCanvas(id, color, contrast);
  if (!cv) return null;
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / sz[0], 1 / sz[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  t.userData = { lib: id };
  TEX.set(key, t);
  return t;
}
/* ───────── one picture per pattern, for all its colours (1 Nov) ─────────
   A tinted material doesn't get a coloured copy of the picture: the picture's light and dark (libDetail) is one
   texture per pattern, and the material's colour is laid over it in the shader the way the canvas did (soft light, in
   screen values) – every colour of a stone floor, a fabric, a worktop, the neighbours' roofs shares one texture. */
const SOFT_GLSL = `
vec3 slD(vec3 c) { return mix(sqrt(c), ((16.0 * c - 12.0) * c + 4.0) * c, step(c, vec3(0.25))); }
vec3 slSoft(vec3 baseLin, float d) {
	vec3 cb = sRGBTransferOETF(vec4(clamp(baseLin, 0.0, 1.0), 1.0)).rgb;
	vec3 r = d <= 0.5 ? cb - (1.0 - 2.0 * d) * cb * (1.0 - cb) : cb + (2.0 * d - 1.0) * (slD(cb) - cb);
	return sRGBTransferEOTF(vec4(r, 1.0)).rgb;
}`;
/** the shader: the colour (the material's) soft-lit by the picture's light and dark (its map's red, 128 = as is) –
 *  before the High preset's relief (which takes the map's include over) */
function softPatch(sh) {
  sh.fragmentShader = sh.fragmentShader.replace('void main() {', SOFT_GLSL + '\nvoid main() {')
    .replace('#include <map_fragment>', 'vec3 slBase = diffuseColor.rgb;\n#include <map_fragment>\n#ifdef USE_MAP\n\tdiffuseColor.rgb = slSoft(slBase, sampledDiffuseColor.r);\n#endif');
}
/** a material that is soft-lit (its colour over a light-and-dark picture) */
function softMaterial(m) {
  m.userData.soft = true;
  m.onBeforeCompile = sh => softPatch(sh);
  m.customProgramCacheKey = () => 'soft';
  return m;
}
/** the light and dark of a set's picture as a texture (raw values, 128 = the picture's average), at size, turned rot:
 *  one on the graphics card per picture and contrast */
function libDetailTex(id, contrast = 1, size = null, rot = 0) {
  const s = libSet(id);
  if (!s) return null;
  const sz = libSize(s, size);
  const key = 'libd|' + id + '|' + contrast + '|' + sz.map(v => (+v).toFixed(3)).join('x') + (rot ? '|r' + rot : '');
  if (TEX.has(key)) return TEX.get(key);
  let base = TEXLIB.base.get('d|' + id + '|' + contrast);
  if (!base) {
    const cv = libDetail(id, contrast);
    if (!cv) return null;
    base = new THREE.CanvasTexture(cv);
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    base.colorSpace = THREE.NoColorSpace;
    base.anisotropy = MAX_ANISO;
    TEXLIB.base.set('d|' + id + '|' + contrast, base);
  }
  const t = base.clone();
  t.repeat.set(1 / sz[0], 1 / sz[1]);
  if (rot) t.rotation = rot * Math.PI / 180;
  t.userData = { lib: id, detail: true };
  t.needsUpdate = true;
  TEX.set(key, t);
  return t;
}
/** a colour ('#rrggbb' or [r, g, b] 0 … 1, screen values) as a material colour */
const libColor = c => typeof c === 'string' ? new THREE.Color(c) : new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

/** a material of a set at its true size: { size, tint (colour), contrast, rough (×), normal (strength), side, metal, rot } */
function libMaterial(id, o = {}) {
  const s = libSet(id);
  if (!s) return null;
  const key = 'libm|' + id + '|' + JSON.stringify(o) + '|' + (libFast() ? 'f' : '');
  return mat(key, () => {
    const size = o.size || s.size;
    const p = { color: 0xffffff, roughness: o.rough ?? 1, metalness: 0 };
    // tinted: the colour over the picture's light and dark (one texture for all colours), else the picture itself
    p.map = o.tint ? libDetailTex(id, o.contrast ?? 1, size, o.rot || 0) : libTex(id, 'color', size, o.rot || 0);
    if (o.tint) p.color = libColor(o.tint);
    if (!libFast()) {
      const n = libTex(id, 'normal', size, o.rot || 0), r = libTex(id, 'rough', size, o.rot || 0);
      if (n) { p.normalMap = n; p.normalScale = new THREE.Vector2(1, 1).multiplyScalar(o.normal ?? 1); }
      if (r) p.roughnessMap = r;
    } else p.roughness = (o.rough ?? 1) * (s.roughAvg ?? 0.8);
    if (s.metal) { const mm = libTex(id, 'metal', size); if (mm && !libFast()) p.metalnessMap = mm; p.metalness = o.metal ?? 1; }
    if (o.side) p.side = o.side;
    const m = new THREE.MeshStandardMaterial(p);
    m.userData.lib = id;
    if (o.tint && p.map) softMaterial(m);
    return m;
  });
}
/* ───────── the bricks: one waalformaat wall in wildverband (tools/brickkit.py), coloured from a palette ─────────
   The kit picture says per pixel how much is joint (R) and which brick it is (G); the detail picture is the brick's own
   light and dark (128 = its average). A palette: the brick colours with how often each is laid (a nuanced brick: some
   darker, some lighter), the joint colour, how much one brick differs from the next (jitter) and how strongly a brick's
   own light and dark show (contrast). */
const BRICK_PAL = {
  // the three bricks of the builder's facade drawing (renvooi metselwerk: oranje-rood, wit, bruin) as they are on the photo of the
  // house (1 Nov 2026): red-orange with darker red-brown and aubergine bricks among them and grey joints; cream-white
  // with light grey joints; dark brown, almost black, with dark grey joints (the plinth and around the front door)
  red: { bricks: [[55, '#B07660'], [24, '#BC8468'], [14, '#966450'], [7, '#6E4C44']], mortar: '#9A968F', jitter: 0.05, contrast: 0.85 },
  white: { bricks: [[60, '#DCD9D0'], [25, '#D3D1CB'], [15, '#E1DCD0']], mortar: '#BFBCB5', jitter: 0.025, contrast: 0.55 },
  brown: { bricks: [[55, '#3B3132'], [25, '#322A2B'], [20, '#463A38']], mortar: '#5A5856', jitter: 0.06, contrast: 0.8 },
};
// the colours the builder's model (and the drawing) gives those three
const BRICK_MODEL = [['red', [0.51, 0.31, 0.24]], ['white', [1, 1, 1]], ['brown', [0.31, 0.21, 0.16]]];
const LIB_BRICK = 'HouseBrick';
// (not THREE.Color: it turns '#…' into linear light)
const hexRgb255 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const brickHex = c => '#' + c.map(v => clamp(Math.round(v * 255), 0, 255).toString(16).padStart(2, '0')).join('');
/** the palette for a brick colour of a model: one of the three above when it is theirs, else one around the colour itself */
function brickPalette(rgb) {
  const c = rgb || BRICK_MODEL[0][1];
  for (const [name, m] of BRICK_MODEL) if (Math.hypot(c[0] - m[0], c[1] - m[1], c[2] - m[2]) < 0.06) return Object.assign({ name }, BRICK_PAL[name]);
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  // a model's white is whiter than any brick
  const k = L > 0.86 ? 0.86 / L : 1, b = c.map(v => v * k);
  const sh = f => brickHex(b.map(v => v * f));
  const mortar = L > 0.6 ? brickHex(b.map(v => (v * 0.85 + 0.6) / 2 * 0.95)) : L < 0.25 ? '#57534F' : '#8E8B86';
  return { name: 'c' + brickHex(c).slice(1), bricks: [[55, sh(1)], [20, sh(1.08)], [15, sh(0.88)], [10, sh(0.72)]], mortar, jitter: 0.05, contrast: L > 0.7 ? 0.55 : 1 };
}
/** which palette a brick colour of the builder's model gets (its name: red, white, brown or c + the colour) */
const libBrickFor = rgb => brickPalette(rgb).name;
/** the colour picture of a palette (a canvas; half: half the size, for the neighbours) */
function libBrickCanvas(pal, half = false) {
  const kit = libImg(LIB_BRICK, 'kit'), det = libImg(LIB_BRICK, 'detail');
  if (!kit || !det) return null;
  const W = kit.naturalWidth >> (half ? 1 : 0), H = kit.naturalHeight >> (half ? 1 : 0);
  const read = (im, smooth) => {
    const cv = makeCanvas(W, H), g = cv.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = smooth;
    g.drawImage(im, 0, 0, W, H);
    return g.getImageData(0, 0, W, H).data;
  };
  const K = read(kit, false), D = read(det, true);
  // per brick number: which colour and how much lighter or darker (always the same for a palette)
  const cols = pal.bricks.map(([, h]) => hexRgb255(h));
  const ws = pal.bricks.map(([w]) => w), tot = ws.reduce((a, b) => a + b, 0);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const tab = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    let r = rnd() * tot, w = 0;
    while (w < ws.length - 1 && r > ws[w]) r -= ws[w++];
    const j = 1 + (pal.jitter ?? 0.05) * (rnd() * 2 - 1);
    for (let k = 0; k < 3; k++) tab[i * 3 + k] = cols[w][k] * j;
  }
  const mo = hexRgb255(pal.mortar), ct = pal.contrast ?? 1;
  const cv = makeCanvas(W, H), g = cv.getContext('2d'), out = g.createImageData(W, H), o = out.data;
  for (let p = 0; p < o.length; p += 4) {
    const j = K[p] / 255, b = K[p + 1] * 3, d = D[p] / 128 - 1, fb = 1 + d * ct, fm = 1 + d;
    o[p] = tab[b] * fb * (1 - j) + mo[0] * fm * j;
    o[p + 1] = tab[b + 1] * fb * (1 - j) + mo[1] * fm * j;
    o[p + 2] = tab[b + 2] * fb * (1 - j) + mo[2] * fm * j;
    o[p + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return cv;
}
/** the neighbours' bricks: one grey wall (half size) for all of them, their colour laid over it (soft light) */
const BRICK_GREY = { name: 'grey', bricks: [[55, '#808080'], [20, '#8C8C8C'], [15, '#727272'], [10, '#646464']], mortar: '#A6A6A6', jitter: 0.06, contrast: 1 };
function libBrickShared(rgb, o = {}) {
  const s = libSet(LIB_BRICK);
  if (!s || !libImg(LIB_BRICK, 'kit')) return null;
  return mat('libbs|' + rgb.map(v => (+v).toFixed(3)).join(',') + '|' + (o.side || '') + '|' + (libFast() ? 'f' : ''), () => {
    let map = TEX.get('libbs-grey');
    if (!map) {
      map = new THREE.CanvasTexture(libBrickCanvas(BRICK_GREY, true));
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(1 / s.size[0], 1 / s.size[1]);
      map.colorSpace = THREE.NoColorSpace;
      map.anisotropy = MAX_ANISO;
      map.userData = { lib: LIB_BRICK, brick: 'grey', detail: true };
      TEX.set('libbs-grey', map);
    }
    const p = { color: libColor(rgb), map, roughness: 1, metalness: 0 };
    if (!libFast()) { const n = libTex(LIB_BRICK, 'normal'), r = libTex(LIB_BRICK, 'rough'); if (n) p.normalMap = n; if (r) p.roughnessMap = r; } else p.roughness = s.roughAvg ?? 0.85;
    if (o.side) p.side = o.side;
    const m = softMaterial(new THREE.MeshStandardMaterial(p));
    m.userData.lib = LIB_BRICK;
    m.userData.brick = 'shared';
    return m;
  });
}
/** the brick material for a palette (or a model's brick colour): real size, relief, gloss; { half, side } */
function libBrick(palOrRgb, o = {}) {
  const s = libSet(LIB_BRICK);
  if (!s || !libImg(LIB_BRICK, 'kit')) return null;
  const pal = Array.isArray(palOrRgb) || palOrRgb == null ? brickPalette(palOrRgb) : palOrRgb;
  // (on a phone the colour picture at half size; the relief stays sharp)
  o = libLowMem() ? Object.assign({}, o, { half: true }) : o;
  const key = 'libb|' + JSON.stringify([pal.bricks, pal.mortar, pal.jitter, pal.contrast]) + '|' + (o.half ? 'h' : '') + (o.side || '') + '|' + (libFast() ? 'f' : '');
  return mat(key, () => {
    const tk = 'libbt|' + JSON.stringify([pal.bricks, pal.mortar, pal.jitter, pal.contrast]) + (o.half ? '|h' : '');
    let map = TEX.get(tk);
    if (!map) {
      const cv = libBrickCanvas(pal, !!o.half);
      map = new THREE.CanvasTexture(cv);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(1 / s.size[0], 1 / s.size[1]);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = MAX_ANISO;
      map.userData = { lib: LIB_BRICK, brick: pal.name || '' };
      TEX.set(tk, map);
    }
    const p = { color: 0xffffff, map, roughness: 1, metalness: 0 };
    if (!libFast()) {
      const n = libTex(LIB_BRICK, 'normal'), r = libTex(LIB_BRICK, 'rough');
      if (n) { p.normalMap = n; p.normalScale = new THREE.Vector2(1, 1); }
      if (r) p.roughnessMap = r;
    } else p.roughness = s.roughAvg ?? 0.85;
    if (o.side) p.side = o.side;
    const m = new THREE.MeshStandardMaterial(p);
    m.userData.lib = LIB_BRICK;
    m.userData.brick = pal.name || '';
    return m;
  });
}
/** a piece to cut for one plank or tile: [sx, sy, sw, sh] in the picture's pixels, picked with rnd */
function libPiece(id, rnd, aspect = 1) {
  const s = libSet(id), im = libImg(id);
  if (!s || !im) return null;
  const W = im.naturalWidth, H = im.naturalHeight;
  if (s.strips && s.strips.length) {
    // a row of planks between two joints: a part as long as the plank is (relative to its width)
    const [x0, y0, x1, y1] = s.strips[Math.floor(rnd() * s.strips.length)];
    const sh = (y1 - y0) * H, full = (x1 - x0) * W, sw = Math.min(full, sh * aspect);
    return [x0 * W + rnd() * (full - sw), y0 * H, sw, sh];
  }
  if (s.squares && s.squares.length) {
    // (a little in from the square's edges: no trace of the joint around it, a light line at the tile's edge)
    const [x0, y0, x1, y1] = s.squares[Math.floor(rnd() * s.squares.length)], m = 0.03;
    const w = (x1 - x0) * W, h = (y1 - y0) * H;
    return [x0 * W + w * m, y0 * H + h * m, w * (1 - 2 * m), h * (1 - 2 * m)];
  }
  if (s.grid) {
    // inside one cell of the tile grid (away from its joints)
    const n = s.grid, cw = W / n, ch = H / n, i = Math.floor(rnd() * n), j = Math.floor(rnd() * n), m = 0.14;
    return [(i + m) * cw, (j + m) * ch, cw * (1 - 2 * m), ch * (1 - 2 * m)];
  }
  // anywhere: a square part as large as the piece is (the caller gives the piece's size in metres as aspect … here 1)
  const sw = W * 0.4, sh = sw / aspect;
  return [rnd() * (W - sw), rnd() * (H - sh), sw, sh];
}
/** an area of cols × rows tiles (each sz metres), every tile cut from a part of the picture: a repeating texture */
function libPieceTex(id, key, cols, rows, sz, joint = 0.004, tint = null) {
  const s = libSet(id), im = libImg(id);
  if (!s || !im) return null;
  const k = 'libp|' + key + '|' + id + '|' + (tint || '') + (libLowMem() ? '|s' : '');
  if (TEX.has(k)) return TEX.get(k);
  const ppm = clamp(Math.round((libLowMem() ? 384 : 640) / Math.max(cols * sz[0], rows * sz[1])), 64, 1000);
  const cw = sz[0] * ppm, ch = sz[1] * ppm, W = Math.round(cols * cw), H = Math.round(rows * ch);
  const cv = makeCanvas(W, H), g = cv.getContext('2d');
  const a = s.avg || [0.5, 0.5, 0.5];
  g.fillStyle = tint ? shade(tint, 0.62) : `rgb(${a.map(v => Math.round(v * 255 * 0.62)).join(',')})`;
  g.fillRect(0, 0, W, H);
  // tinted: each piece the colour, with the picture's light and dark over it
  const det = tint ? libDetail(id, 1) : null;
  let seed = 9;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const jp = Math.max(1, joint * ppm);
  // stone squares (Tiles050): each tile turned a quarter at random and maybe mirrored, and never the same part of the
  // picture as the tile left of it or above it (also across the edge where the pattern repeats) – no two alike side by side
  const turn = !!(s.squares && s.squares.length), got = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
    const near = () => [got[(i - 1 + cols) % cols * rows + j], got[i * rows + (j - 1 + rows) % rows], i === cols - 1 ? got[j] : null, j === rows - 1 ? got[i * rows] : null];
    let pc = libPiece(id, rnd, sz[0] / sz[1]);
    for (let k = 0; turn && k < 12 && near().some(q => same(q, pc)); k++) pc = libPiece(id, rnd, sz[0] / sz[1]);
    got[i * rows + j] = pc;
    const [sx, sy, sw, sh] = pc;
    const x = i * cw + jp / 2, y = j * ch + jp / 2, w = cw - jp, hh = ch - jp;
    if (det) {
      g.fillStyle = shade(tint, 0.95 + rnd() * 0.1); g.fillRect(x, y, w, hh);
      g.globalCompositeOperation = 'soft-light'; g.drawImage(det, sx, sy, sw, sh, x, y, w, hh); g.globalCompositeOperation = 'source-over';
    } else if (turn) {
      const q = Math.floor(rnd() * 4), flip = rnd() < 0.5, dw = q % 2 ? hh : w, dh = q % 2 ? w : hh;
      g.save(); g.translate(x + w / 2, y + hh / 2); g.rotate(q * Math.PI / 2); if (flip) g.scale(-1, 1);
      g.drawImage(im, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
      g.restore();
    } else g.drawImage(im, sx, sy, sw, sh, x, y, w, hh);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / (cols * sz[0]), 1 / (rows * sz[1]));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  t.userData = { lib: id, hq: { relief: 0.006 } };
  TEX.set(k, t);
  return t;
}

/* ───────── the skies ───────── */
/** a packed sky (gzip + base64 of a Radiance .hdr) → an equirectangular texture; userData: its mean brightness (without
 *  the sun) and where its sun is (u across, v up) */
async function libSkyDecode(sk) {
  const bin = Uint8Array.from(atob(sk.hdr), ch => ch.charCodeAt(0));
  const buf = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const { HDRLoader } = await addon('loaders/HDRLoader.js');
  const d = new HDRLoader().setDataType(THREE.HalfFloatType).parse(buf);
  const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
  t.colorSpace = THREE.LinearSRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = true;
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.needsUpdate = true;
  const H = THREE.DataUtils.fromHalfFloat, n = d.width * d.height;
  let sum = 0, cnt = 0, best = -1, bi = 0;
  for (let i = 0; i < n; i += 5) {
    const L = 0.2126 * H(d.data[i * 4]) + 0.7152 * H(d.data[i * 4 + 1]) + 0.0722 * H(d.data[i * 4 + 2]);
    if (L > best) { best = L; bi = i; }
    if (L < 20) { sum += L; cnt++; }
  }
  t.userData = { avg: sum / Math.max(1, cnt), sunU: (bi % d.width) / d.width, sunV: 1 - Math.floor(bi / d.width) / d.height };
  // the sun's light in the picture: what is above the bright clouds (as libSkyNoSun clips it), summed over the sky's
  // solid angle – the light the sun gives on a surface facing it (irradiance), and its colour (1 Nov, evening: the
  // path tracer's sun had about a quarter of the photo's sun:sky balance)
  const cap = Math.max(2, t.userData.avg * 4), Wd = d.width, Hd = d.height, sunRGB = [0, 0, 0];
  for (let y = 0; y < Hd; y++) {
    const th = (y + 0.5) / Hd * Math.PI, dOm = (Math.PI / Hd) * (2 * Math.PI / Wd) * Math.sin(th);
    for (let x = 0; x < Wd; x++) {
      const i = (y * Wd + x) * 4, r = H(d.data[i]), g = H(d.data[i + 1]), b = H(d.data[i + 2]);
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (L <= cap) continue;
      const k = (1 - cap / L) * dOm;
      sunRGB[0] += r * k; sunRGB[1] += g * k; sunRGB[2] += b * k;
    }
  }
  t.userData.sunE = 0.2126 * sunRGB[0] + 0.7152 * sunRGB[1] + 0.0722 * sunRGB[2];
  t.userData.sunRGB = sunRGB;
  return t;
}
/** 'day' or 'sunset' (null until decoded, or without the pictures) */
const libSky = which => (libOn() && TEXLIB.sky[which]) || null;
/** the same sky without its sun (clipped to the bright clouds): for the path tracer, which has the app's sun as a
 *  light already – with the picture's sun too it had the sun twice (1 Nov: path traced pictures far too bright) */
function libSkyNoSun(which) {
  const sk = libSky(which);
  if (!sk) return null;
  TEXLIB.skyNS = TEXLIB.skyNS || {};
  if (TEXLIB.skyNS[which]) return TEXLIB.skyNS[which];
  const { data, width, height } = sk.image, H = THREE.DataUtils.fromHalfFloat, F = THREE.DataUtils.toHalfFloat;
  const cap = Math.max(2, (sk.userData.avg || 0.5) * 4), d = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = H(data[i]), g = H(data[i + 1]), b = H(data[i + 2]), L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const k = L > cap ? cap / L : 1;
    d[i] = F(r * k); d[i + 1] = F(g * k); d[i + 2] = F(b * k); d[i + 3] = data[i + 3];
  }
  const t = new THREE.DataTexture(d, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  t.colorSpace = sk.colorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = sk.flipY;
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.needsUpdate = true;
  t.userData = Object.assign({}, sk.userData, { noSun: true });
  return (TEXLIB.skyNS[which] = t);
}
