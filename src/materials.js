/* ───────────── materials.js — floors laid in a pattern, wood tones, paint sheen and renovlies ─────────────
   A room's floor: { material, color, pattern?, l?, w?, dir?, grout? }. Wood, laminate and PVC come in planks,
   wide planks, herringbone (visgraat) or chevron (Hongaarse punt); tiles and natural stone straight, in half bond,
   a third offset or herringbone. l × w is the plank or tile (length along the run × width), dir 0 = the run goes
   left–right in the plan, 90 = top–bottom. Without these the defaults of the material are used, so old houses look
   as before. The same layout is drawn in 3D (a texture at true size) and in the plan (a fine line pattern). */

const WOODY = new Set(['oak', 'laminate', 'pvc']);
const TILED = new Set(['tiles', 'stone']);
const FLOOR_PATTERNS = {
  wood: [['plank', 'Planks'], ['wide', 'Wide planks'], ['herringbone', 'Herringbone (visgraat)'], ['chevron', 'Chevron (Hongaarse punt)']],
  tile: [['grid', 'Straight'], ['half', 'Half bond'], ['third', 'Third offset'], ['herringbone', 'Herringbone']],
};
/** plank sizes [length, width] per material and pattern */
const PLANK_SIZES = {
  oak: { plank: [1.8, 0.19], wide: [2.2, 0.26], herringbone: [0.6, 0.1], chevron: [0.6, 0.12] },
  laminate: { plank: [1.28, 0.19], wide: [2.05, 0.24], herringbone: [0.6, 0.12], chevron: [0.6, 0.12] },
  pvc: { plank: [1.22, 0.18], wide: [1.5, 0.23], herringbone: [0.6, 0.12], chevron: [0.6, 0.12] },
};
/** floor tile sizes [length, width] */
const FLOOR_TILE_SIZES = [[0.3, 0.3], [0.45, 0.45], [0.6, 0.6], [0.8, 0.8], [1, 1], [0.6, 0.3], [1.2, 0.6], [0.6, 0.15]];
const WOOD_TONES = [['Natural oak', '#C49A6C'], ['White oak', '#D8C3A0'], ['Smoked oak', '#8A6A4E'], ['Grey oak', '#A49A8C'], ['Walnut', '#6B4A35'], ['Light ash', '#DCCDB2']];
const SHEENS = [['matt', 'Matt'], ['satin', 'Satin (zijdeglans)'], ['gloss', 'Gloss (hoogglans)']];
const SHEEN_ROUGH = { matt: 0.92, satin: 0.5, gloss: 0.24 };

/** the floor with its defaults filled in */
function floorSpec(fl) {
  fl = fl || {};
  const material = fl.material || 'screed', color = fl.color || '#B9B5AC';
  const kind = WOODY.has(material) ? 'wood' : TILED.has(material) ? 'tile' : null;
  // a photo of a sample: one plank or tile (in every plank or tile of the layout), or a piece of floor repeated at its size
  const ph = fl.photo && fl.photo.img ? { img: fl.photo.img, mode: kind && fl.photo.mode !== 'pattern' ? 'piece' : 'pattern', w: fl.photo.w > 0 ? fl.photo.w : 0.5, h: fl.photo.h > 0 ? fl.photo.h : 0.5 } : null;
  if (!kind) return { material, color, kind: null, photo: ph };
  const pats = FLOOR_PATTERNS[kind].map(p => p[0]);
  const pattern = pats.includes(fl.pattern) ? fl.pattern : pats[0];
  let l, w;
  if (fl.l > 0 && fl.w > 0) { l = fl.l; w = fl.w; }
  else if (kind === 'wood') [l, w] = PLANK_SIZES[material][pattern];
  else [l, w] = material === 'stone' ? [0.4, 0.4] : [0.6, 0.6];
  const grout = fl.grout || (luminance(color) > 0.45 ? shadeHex(color, 0.82) : shadeHex(color, 1.25));
  return { material, color, kind, pattern, l, w, dir: fl.dir === 90 ? 90 : 0, grout, photo: ph };
}
/** the sample photo of a floor, once it is decoded */
const floorPhotoEl = F => (F.photo ? imageEl(F.photo.img) : null);
const floorPhotoKey = F => (F.photo ? ['ph', F.photo.img, F.photo.mode, F.photo.w, F.photo.h, floorPhotoEl(F) ? floorPhotoEl(F).dataset.src : 'x'].join(':') : '');
function shadeHex(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  return '#' + [r, g, b].map(v => clamp(Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f), 0, 255).toString(16).padStart(2, '0')).join('');
}
const floorSpecKey = F => (F.kind ? [F.material, F.color, F.pattern, F.l, F.w, F.dir, F.grout].join('|') : F.material + '|' + F.color) + floorPhotoKey(F);
/** in words: "Herringbone, 600 × 100 mm" */
function floorPatternLabel(fl) {
  const F = floorSpec(fl);
  if (!F.kind) return '';
  const pat = (FLOOR_PATTERNS[F.kind].find(p => p[0] === F.pattern) || ['', ''])[1].replace(/ \(.*\)$/, '');
  return t(pat) + ', ' + fmtMM(F.l) + ' × ' + fmtMM(F.w) + ' mm';
}

/** one period of the layout, in metres: { pw, ph, polys } — polygons may stick out of the period; draw them
 *  shifted by ±pw / ±ph as well. Rotation (herringbone 45°, dir) is applied by whoever draws it. */
function floorLayout(F) {
  let seed = 17;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const { pattern, l: L, w: W } = F;
  const polys = [];
  if (pattern === 'plank' || pattern === 'wide') {
    const rows = 6, pw = L * 2, ph = W * rows;
    for (let r = 0; r < rows; r++) {
      const o = rnd() * pw, a = pw * (0.38 + rnd() * 0.24);
      polys.push(rect(o, r * W, a, W), rect(o + a, r * W, pw - a, W));
      polys.push(rect(o - pw, r * W, a, W), rect(o + a - pw, r * W, pw - a, W));
    }
    return { pw, ph, polys, angle: 0 };
  }
  if (pattern === 'grid') return { pw: L, ph: W, polys: [rect(0, 0, L, W)], angle: 0 };
  if (pattern === 'half' || pattern === 'third') {
    const n = pattern === 'half' ? 2 : 3;
    for (let r = 0; r < n; r++) { const o = (r * L) / n; polys.push(rect(o, r * W, L, W), rect(o - L, r * W, L, W)); }
    return { pw: L, ph: W * n, polys, angle: 0 };
  }
  if (pattern === 'herringbone') {
    // a staircase of a lying and a standing plank, repeated by (W, W) and (2L, 0); L a whole number of widths
    const n = Math.max(2, Math.round(L / W)), Ln = n * W, P = 2 * Ln;
    for (let j = -1; j <= 1; j++) for (let i = -2; i < 2 * n + 2; i++) {
      const ox = i * W + j * P, oy = i * W;
      const H = rect(ox, oy, Ln, W), Vt = rect(ox + Ln, oy + W - Ln, W, Ln);
      for (const q of [H, Vt]) {
        // keep what lies (partly) in one period, folded into it vertically
        const k = Math.floor(Math.min(...q.map(p => p[1])) / P);
        const qq = q.map(([x, y]) => [x, y - k * P]);
        const xs = qq.map(p => p[0]);
        if (Math.max(...xs) > 0 && Math.min(...xs) < P) polys.push(qq);
      }
    }
    return { pw: P, ph: P, polys, angle: 45 };
  }
  if (pattern === 'chevron') {
    // spine along x: rows of slanted planks pointing right, mirrored every other row
    const c = L * Math.SQRT1_2, hh = W * Math.SQRT2;
    for (let k = -1; k <= Math.ceil(c / hh) + 1; k++) {
      const x = k * hh;
      polys.push([[x, 0], [x + hh, 0], [x + hh + c, c], [x + c, c]]);
      polys.push([[x + c, c], [x + hh + c, c], [x + hh, 2 * c], [x, 2 * c]]);
    }
    return { pw: hh, ph: 2 * c, polys, angle: 0 };
  }
  return { pw: 1, ph: 1, polys: [], angle: 0 };
}

/** 3D: the floor as a texture at true size */
function floorPatternTexture(F) {
  const key = 'fp|' + floorSpecKey(F);
  if (TEX.has(key)) return TEX.get(key);
  const lay = floorLayout(F);
  const ppm = clamp(Math.round(640 / Math.max(lay.pw, lay.ph)), 120, 900);
  const cw = clamp(Math.round(lay.pw * ppm), 8, 2048), ch = clamp(Math.round(lay.ph * ppm), 8, 2048);
  const sx = cw / lay.pw, sy = ch / lay.ph;
  const cv = makeCanvas(cw, ch), g = cv.getContext('2d');
  let seed = 5;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const wood = F.kind === 'wood';
  const photo = F.photo && F.photo.mode === 'piece' ? floorPhotoEl(F) : null;
  // the real picture (texlib.js): each plank or tile cut from it, its light and dark over the chosen colour
  const libId = !photo && LIB_FLOOR[F.material] ? LIB_FLOOR[F.material][0] : null;
  const det = libId && libSet(libId) ? libDetail(libId, LIB_FLOOR[F.material][1]) : null;
  g.fillStyle = wood ? shade(F.color, 0.7) : F.grout;
  g.fillRect(0, 0, cw, ch);
  const joint = wood ? Math.max(0.8, 0.0012 * sx) : Math.max(1, 0.003 * sx);
  for (const q of lay.polys) {
    const f = wood ? 0.88 + rnd() * 0.2 : 0.975 + rnd() * 0.05;
    for (const dx of [-lay.pw, 0, lay.pw]) for (const dy of [-lay.ph, 0, lay.ph]) {
      const pts = q.map(([x, y]) => [(x + dx) * sx, (y + dy) * sy]);
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      if (Math.max(...xs) < 0 || Math.min(...xs) > cw || Math.max(...ys) < 0 || Math.min(...ys) > ch) continue;
      g.save();
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
      g.fillStyle = shade(F.color, f); g.fill();
      g.clip();
      if (photo && pts.length === 4) {
        // the sample photo in this plank or tile: its long side along the plank's long side; planks turned at random
        const [a, b, , d] = pts;
        let U = [b[0] - a[0], b[1] - a[1]], W2 = [d[0] - a[0], d[1] - a[1]], O = a;
        if ((Math.hypot(...U) >= Math.hypot(...W2)) !== (photo.naturalWidth >= photo.naturalHeight)) [U, W2] = [W2, U];
        if (wood && rnd() < 0.5) { O = [O[0] + U[0] + W2[0], O[1] + U[1] + W2[1]]; U = [-U[0], -U[1]]; W2 = [-W2[0], -W2[1]]; }
        g.transform(U[0] / photo.naturalWidth, U[1] / photo.naturalWidth, W2[0] / photo.naturalHeight, W2[1] / photo.naturalHeight, O[0], O[1]);
        g.drawImage(photo, 0, 0);
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (wood) { g.fillStyle = f < 1 ? `rgba(0,0,0,${((1 - f) * 0.6).toFixed(3)})` : `rgba(255,255,255,${((f - 1) * 0.5).toFixed(3)})`; g.fill(); }
      } else if (det && pts.length === 4) {
        // a part of the picture in this plank or tile (the long side along the plank's grain)
        const [a, b, , d] = pts;
        let U = [b[0] - a[0], b[1] - a[1]], W2 = [d[0] - a[0], d[1] - a[1]], O = a;
        if (Math.hypot(...U) < Math.hypot(...W2)) [U, W2] = [W2, U];
        const asp = Math.hypot(...U) / Math.max(1e-6, Math.hypot(...W2));
        const [px, py, pw, ph] = libPiece(libId, rnd, asp);
        if (rnd() < 0.5) { O = [O[0] + U[0] + W2[0], O[1] + U[1] + W2[1]]; U = [-U[0], -U[1]]; W2 = [-W2[0], -W2[1]]; }
        g.globalCompositeOperation = 'soft-light';
        g.transform(U[0] / pw, U[1] / pw, W2[0] / ph, W2[1] / ph, O[0], O[1]);
        g.drawImage(det, px, py, pw, ph, 0, 0, pw, ph);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over';
      } else if (wood) {
        // grain along the long side
        const [a, b, c2] = pts;
        const e1 = Math.hypot(b[0] - a[0], b[1] - a[1]), e2 = Math.hypot(c2[0] - b[0], c2[1] - b[1]);
        const [p0, p1, side] = e1 >= e2 ? [a, b, [c2[0] - b[0], c2[1] - b[1]]] : [b, c2, [a[0] - b[0], a[1] - b[1]]];
        g.strokeStyle = shade(F.color, 0.8); g.globalAlpha = 0.22; g.lineWidth = Math.max(0.6, sx * 0.0015);
        for (let k = 0; k < 4; k++) {
          const tt = 0.15 + rnd() * 0.7, ox = side[0] * tt, oy = side[1] * tt, wob = (rnd() - 0.5) * 3;
          g.beginPath(); g.moveTo(p0[0] + ox, p0[1] + oy);
          g.bezierCurveTo(p0[0] + (p1[0] - p0[0]) * 0.33 + ox, p0[1] + (p1[1] - p0[1]) * 0.33 + oy + wob, p0[0] + (p1[0] - p0[0]) * 0.66 + ox, p0[1] + (p1[1] - p0[1]) * 0.66 + oy - wob, p1[0] + ox, p1[1] + oy);
          g.stroke();
        }
        g.globalAlpha = 1;
      } else {
        const gr = g.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
        gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.04)');
        g.fillStyle = gr; g.fill();
      }
      g.restore();
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
      g.strokeStyle = wood ? 'rgba(0,0,0,0.28)' : F.grout; g.lineWidth = joint; g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / lay.pw, 1 / lay.ph);
  tex.rotation = -((lay.angle + F.dir) * Math.PI) / 180;
  tex.center.set(0, 0);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  tex.userData.hq = wood ? { relief: 0.0015, strength: 1.6 } : { relief: 0.003 };
  if (det) tex.userData.lib = libId;
  TEX.set(key, tex);
  return tex;
}
function floorMaterial(fl) {
  const F = floorSpec(fl);
  // a photo of a piece of floor, repeated at its size
  if (F.photo && F.photo.mode === 'pattern') {
    const base = imageTex(F.photo.img);
    if (base) return mat('flph|' + floorSpecKey(F), () => {
      const tex = base.clone(); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1 / F.photo.w, 1 / F.photo.h); tex.center.set(0, 0); tex.rotation = -((F.dir || 0) * Math.PI) / 180; tex.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: F.kind === 'tile' ? 0.4 : 0.7, metalness: 0 });
    });
  }
  if (!F.kind) return floorMat(F.material, F.color);
  const rough = F.kind === 'tile' ? (F.material === 'stone' ? 0.6 : 0.4) : F.material === 'pvc' ? 0.7 : 0.62;
  return mat('flp|' + floorSpecKey(F), () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorPatternTexture(F), roughness: rough, metalness: 0 }));
}

/* ───────── walls: paint sheen and renovlies ───────── */
function renovliesTexture() {
  if (TEX.has('renovlies')) return TEX.get('renovlies');
  const N = 256, cv = makeCanvas(N, N), g = cv.getContext('2d');
  let seed = 23;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, N, N);
  // a fine glass-fibre weave
  const step = 4;
  for (let y = 0; y < N; y += step) for (let x = 0; x < N; x += step) {
    const on = ((x / step) + (y / step)) % 2 === 0;
    g.fillStyle = on ? `rgba(0,0,0,${0.035 + rnd() * 0.03})` : `rgba(255,255,255,${0.05 + rnd() * 0.04})`;
    g.fillRect(x, y, on ? step : step - 1, on ? step - 1 : step);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 0.12, 1 / 0.12);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  tex.userData.hq = { strength: 1.4 };
  TEX.set('renovlies', tex);
  return tex;
}
/** paint (any sheen) or renovlies with paint */
function paintMat(color, sheen, base) {
  const r = SHEEN_ROUGH[sheen] ?? SHEEN_ROUGH.matt;
  if (base === 'renovlies') return mat('reno|' + color + '|' + sheen, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), map: renovliesTexture(), roughness: r, metalness: 0 }));
  if (r === SHEEN_ROUGH.matt) return wallMat(color);
  return mat('w|' + color + '|' + sheen, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: r, metalness: 0 }));
}

/* ───────── the plan: the floor pattern as fine lines ───────── */
Object.assign(PlanView.prototype, {
  floorFill(r) {
    const F = floorSpec(r.floor);
    if (this.spec.floorPatterns === false) return F.color;
    const src = F.photo ? imageSrc(projectImage(F.photo.img)) : null;
    if (!F.kind && !src) return F.color;
    let defs = this.svg.querySelector('defs');
    if (!defs) defs = this.svg.insertBefore(s('defs'), this.svg.firstChild);
    const id = 'fp-' + hashStr(floorSpecKey(F) + (src ? ':' + src.length : ''));
    if (src) {
      // the sample photo: once in the defs, used in every plank / tile or as one repeat of the floor
      const iid = 'fpi-' + hashStr(F.photo.img + ':' + src.length);
      if (!defs.querySelector('#' + iid)) defs.appendChild(s('image', { id: iid, href: src, x: 0, y: 0, width: 1, height: 1, preserveAspectRatio: 'none' }));
      if (!defs.querySelector('#' + id)) {
        const im = projectImage(F.photo.img) || {};
        if (F.photo.mode === 'pattern' || !F.kind) {
          const p = s('pattern', { id, patternUnits: 'userSpaceOnUse', width: F.photo.w, height: F.photo.h, patternTransform: `rotate(${F.dir || 0})` });
          p.appendChild(s('use', { href: '#' + iid, transform: `scale(${F.photo.w} ${F.photo.h})` }));
          defs.appendChild(p);
        } else {
          const lay = floorLayout(F);
          const p = s('pattern', { id, patternUnits: 'userSpaceOnUse', width: lay.pw, height: lay.ph, patternTransform: `rotate(${lay.angle + F.dir})` });
          p.appendChild(s('rect', { x: 0, y: 0, width: lay.pw, height: lay.ph, fill: F.kind === 'wood' ? shadeHex(F.color, 0.7) : F.grout }));
          const landscape = (im.w || 1) >= (im.h || 1);
          let d = '', k = 0;
          for (const q of lay.polys) for (const dx of [-lay.pw, 0, lay.pw]) for (const dy of [-lay.ph, 0, lay.ph]) {
            if (q.length !== 4) continue;
            const [a, b, , dd] = q.map(([x, y]) => [x + dx, y + dy]);
            let U = [b[0] - a[0], b[1] - a[1]], W2 = [dd[0] - a[0], dd[1] - a[1]], O = a;
            if ((Math.hypot(...U) >= Math.hypot(...W2)) !== landscape) [U, W2] = [W2, U];
            if (F.kind === 'wood' && (k++ % 3 === 1)) { O = [O[0] + U[0] + W2[0], O[1] + U[1] + W2[1]]; U = [-U[0], -U[1]]; W2 = [-W2[0], -W2[1]]; }
            p.appendChild(s('use', { href: '#' + iid, transform: `matrix(${[U[0], U[1], W2[0], W2[1], O[0], O[1]].map(v => +v.toFixed(4)).join(' ')})` }));
            d += 'M' + q.map(([x, y]) => (x + dx).toFixed(4) + ' ' + (y + dy).toFixed(4)).join('L') + 'Z';
          }
          p.appendChild(s('path', { d, fill: 'none', stroke: F.kind === 'wood' ? 'rgba(0,0,0,0.35)' : F.grout, 'stroke-width': F.kind === 'wood' ? 0.004 : 0.006, class: 'floor-joints' }));
          defs.appendChild(p);
        }
      }
      return `url(#${id})`;
    }
    if (!F.kind) return F.color;
    if (!defs.querySelector('#' + id)) {
      const lay = floorLayout(F);
      const p = s('pattern', { id, patternUnits: 'userSpaceOnUse', width: lay.pw, height: lay.ph, patternTransform: `rotate(${lay.angle + F.dir})` });
      p.appendChild(s('rect', { x: 0, y: 0, width: lay.pw, height: lay.ph, fill: F.color }));
      let d = '';
      for (const q of lay.polys) for (const dx of [-lay.pw, 0, lay.pw]) for (const dy of [-lay.ph, 0, lay.ph]) d += 'M' + q.map(([x, y]) => (x + dx).toFixed(4) + ' ' + (y + dy).toFixed(4)).join('L') + 'Z';
      p.appendChild(s('path', { d, fill: 'none', stroke: F.kind === 'wood' ? shadeHex(F.color, 0.62) : F.grout, 'stroke-width': F.kind === 'wood' ? 0.008 : 0.012, 'stroke-opacity': 0.75, class: 'floor-joints' }));
      defs.appendChild(p);
    }
    return `url(#${id})`;
  },
});
function hashStr(str) { let h1 = 5381; for (let i = 0; i < str.length; i++) h1 = ((h1 << 5) + h1 + str.charCodeAt(i)) | 0; return (h1 >>> 0).toString(36); }

/* ───────── the room's details: pattern, size, direction, wood tones ───────── */
Object.assign(app, {
  /** your own floor from a photo of a sample: one plank / tile, or a piece of the floor with its size */
  /** the floor as a product you buy: its name (brand, name, colour code) and how many m² come in a pack – the
   *  quantities then count it by name, in whole packs */
  floorProductFields(r, ro, upd) {
    const m = (r.floor && r.floor.material) || 'screed';
    if (m === 'screed' || m === 'casco') return null;
    const P = r.floor.product || {};
    const name = h('input', { class: 'input', id: 'f-floor-prod', value: P.name || '', disabled: ro, autocomplete: 'off', placeholder: t('Brand, name, colour code') });
    const pack = h('input', { class: 'input num', id: 'f-floor-pack', type: 'number', min: '0', step: '0.001', value: P.pack > 0 ? String(P.pack) : '', disabled: ro, inputmode: 'decimal', placeholder: '—' });
    const set = (k, v) => upd(rr => {
      const q = { ...(rr.floor.product || {}) };
      if (v === '' || v == null || (k === 'pack' && !(v > 0))) delete q[k]; else q[k] = v;
      if (Object.keys(q).length) rr.floor.product = q; else delete rr.floor.product;
    }, { coalesce: 'fprod:' + k + ':' + r.id });
    name.addEventListener('input', () => set('name', name.value.trim() ? name.value : ''));
    pack.addEventListener('input', () => set('pack', parseFloat(String(pack.value).replace(',', '.'))));
    return h('div', { class: 'field-row' },
      h('div', { class: 'field', style: { flex: '2 1 0' } }, h('label', { for: 'f-floor-prod' }, t('Product')), name),
      h('div', { class: 'field', style: { flex: '1 1 0' } }, h('label', { for: 'f-floor-pack' }, t('m² per pack')), pack));
  },
  floorPhotoControls(r, ro, upd) {
    const F = floorSpec(r.floor), P = (r.floor && r.floor.photo) || null;
    const set = (patch) => upd(rr => { if (patch === null) delete rr.floor.photo; else rr.floor.photo = { ...(rr.floor.photo || {}), ...patch }; }, { keepInspector: false });
    const piece = F.kind === 'wood' ? t('One plank') : t('One tile');
    const choose = async () => {
      const id = await this.pickPicture(P && P.img, { title: t('Photo of a floor sample'), empty: t('No pictures yet. Add a photo of a sample, straight from above: one plank or tile, or a piece of the floor; then set its size.') });
      if (!id) return;
      const im = projectImage(id), asp = im && im.w ? im.h / im.w : 1;
      upd(rr => { rr.floor.photo = { img: id, mode: F.kind ? (P && P.mode) || 'piece' : 'pattern', w: (P && P.w) || 0.5, h: +(((P && P.w) || 0.5) * asp).toFixed(4) }; if (im) rr.floor.color = im.avg; }, { keepInspector: false });
    };
    const box = h('div', { class: 'sub-box floor-photo' });
    box.appendChild(this.photoSampleRow(P && P.img, ro, 'f-floor', t('Photo of a sample'), choose, () => set(null)));
    if (P && P.img) {
      if (F.kind) box.appendChild(this.segRow(t('The photo shows'), [['piece', piece], ['pattern', 'A piece of the floor']], F.photo.mode, k => set({ mode: k }), ro, 'floor-photo-mode'));
      if (F.photo.mode === 'pattern') {
        const im = projectImage(P.img), asp = im && im.w ? im.h / im.w : 1;
        box.appendChild(h('div', { class: 'field-row' },
          this.numField(t('Width in the photo'), 'f-floor-ph-w', F.photo.w * 100, 'cm', v => set({ w: clamp(v, 1, 1000) / 100, h: +(clamp(v, 1, 1000) / 100 * asp).toFixed(4) }), { disabled: ro, min: 1 }),
          this.numField(t('Height in the photo'), 'f-floor-ph-h', F.photo.h * 100, 'cm', v => set({ h: clamp(v, 1, 1000) / 100, w: +(clamp(v, 1, 1000) / 100 / asp).toFixed(4) }), { disabled: ro, min: 1 })));
        box.appendChild(h('p', { class: 'note-muted' }, t('The photo is repeated at this size, in 2D and 3D.')));
      } else box.appendChild(h('p', { class: 'note-muted' }, F.kind === 'wood' ? t('Every plank gets the photo, at the plank size below (planks turned at random).') : t('Every tile gets the photo, at the tile size below.')));
    }
    return box;
  },
  floorPatternControls(r, ro, upd) {
    const F = floorSpec(r.floor);
    if (!F.kind) return null;
    const box = h('div', { class: 'sub-box floor-box' });
    const set = (patch, opts = {}) => upd(rr => { Object.assign(rr.floor, patch); for (const k of Object.keys(patch)) if (patch[k] == null) delete rr.floor[k]; }, { keepInspector: false, ...opts });
    box.appendChild(this.segRow(t('Laid as'), FLOOR_PATTERNS[F.kind], F.pattern, k => set({ pattern: k, ...(F.kind === 'wood' ? { l: null, w: null } : {}) }), ro, 'floor-pat'));
    if (F.kind === 'tile') {
      box.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Tile size')),
        h('div', { class: 'chips floor-sizes' }, ...FLOOR_TILE_SIZES.map(([l, w]) => h('button', { class: 'chip', 'data-k': fmtMM(l) + 'x' + fmtMM(w), disabled: ro, 'aria-pressed': String(Math.abs(F.l - l) < 1e-4 && Math.abs(F.w - w) < 1e-4), onclick: () => set({ l, w }) }, fmtMM(l / 10) + ' × ' + fmtMM(w / 10))))));
    }
    box.appendChild(h('div', { class: 'field-row' },
      this.mmField(F.kind === 'wood' ? t('Plank length') : t('Tile length'), 'f-floor-l', F.l, v => set({ l: clamp(v, 0.05, 3), w: F.w }), { disabled: ro }),
      this.mmField(F.kind === 'wood' ? t('Plank width') : t('Tile width'), 'f-floor-w', F.w, v => set({ w: clamp(v, 0.03, 1.5), l: F.l }), { disabled: ro })));
    box.appendChild(this.segRow(t('Direction'), [['0', '↔ ' + t('Left–right')], ['90', '↕ ' + t('Top–bottom')]], String(F.dir), k => set({ dir: +k || null }), ro, 'floor-dir'));
    if (F.kind === 'wood') box.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Wood tone')),
      h('div', { class: 'chips wood-tones' }, ...WOOD_TONES.map(([name, c]) => h('button', { class: 'chip tone', disabled: ro, 'aria-pressed': String((r.floor.color || '').toLowerCase() === c.toLowerCase()), onclick: () => set({ color: c }) }, h('span', { class: 'tone-dot', style: { background: c } }), t(name))))));
    // floor tiles: the cuts at the sides of the room, slivers, and where the tiles start (task 0036)
    const lay = F.kind === 'tile' ? floorTileLayout(this.shownVersion().plan, r) : null;
    if (lay) {
      const list = floorCutsSummary(lay.cuts);
      box.appendChild(h('p', { class: 'note-muted fs-cuts' }, (lay.start ? t('Tiles start: chosen') : t('Tiles start: centre of the room')) + ' · ' + t('{w} whole and {c} cut pieces', { w: lay.count.whole, c: lay.count.cut }) + (list.length ? ' · ' + list.map(x => x.text).join(' · ') : '')));
      for (const x of list.filter(q => q.sliver)) box.appendChild(h('p', { class: 'wv-warn' }, icon('alert'), ' ', t('{where} {c} mm is a sliver (under ⅓ tile)', { where: x.place.charAt(0).toUpperCase() + x.place.slice(1), c: fmtMM(x.c) })));
      box.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'f-floor-start', onclick: () => this.wallViewsSheet(r, { focus: 'floor' }) }, icon('grid'), t('Where the tiles start…'))));
    }
    if (F.kind === 'tile') {
      const gc = h('input', { type: 'color', id: 'f-floor-grout', value: F.grout, disabled: ro, 'aria-label': t('Grout colour') });
      gc.addEventListener('input', () => set({ grout: gc.value }, { coalesce: 'fg:' + r.id, keepInspector: true }));
      box.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Grout colour')), h('div', { class: 'color-row' }, gc)));
    }
    return box;
  },
});
