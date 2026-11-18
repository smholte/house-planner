/* ───────────── util.js — small helpers shared by every module ───────────── */

/* the app's own version, shown at the bottom of the projects page (2 Nov): its number goes up by one with each round of
   changes that is delivered (the rounds in the notes), the date of that round, and the build – a code made from the app
   itself by build.py (the same code the offline copy's cache carries; the placeholder stays when run from the source) */
const APP_VERSION = { n: 60, date: '2026-11-18', build: '__BUILD__' };

/* the page as it was loaded, before the app changed anything: "Export for viewing" writes the app again with a
   house inside (share.js). Only the small parts are copied now; the script is read when it is needed. */
const PRISTINE = (() => {
  try {
    const app = document.getElementById('app');
    return { head: document.head.innerHTML, app: app ? app.outerHTML : '', script: document.currentScript, lang: document.documentElement.lang || 'en' };
  } catch (e) { return null; }
})();

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid(prefix = '') {
  const r = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-5);
  return prefix + t + r;
}

function clone(o) {
  if (typeof structuredClone === 'function') return structuredClone(o);
  return JSON.parse(JSON.stringify(o));
}

/** Tiny DOM builder: h('div', {class:'x', onclick:fn}, child, 'text') */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  appendChildren(el, children);
  return el;
}
function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function debounce(fn, ms) {
  let t = null;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
  d.flush = (...args) => { if (t) { clearTimeout(t); t = null; fn(...args); } };
  d.cancel = () => { clearTimeout(t); t = null; };
  return d;
}

function rafThrottle(fn) {
  let queued = false, lastArgs;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
  };
}

class Emitter {
  constructor() { this._l = new Map(); }
  on(ev, fn) { if (!this._l.has(ev)) this._l.set(ev, new Set()); this._l.get(ev).add(fn); return () => this._l.get(ev).delete(fn); }
  emit(ev, ...a) { const set = this._l.get(ev); if (set) for (const fn of [...set]) fn(...a); }
}

/* ───────── geometry (plan coordinates are metres, y points "down" the drawing) ───────── */
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, k) => [a[0] * k, a[1] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  cross: (a, b) => a[0] * b[1] - a[1] * b[0],
  len: a => Math.hypot(a[0], a[1]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  norm: a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
  perp: a => [-a[1], a[0]],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
  eq: (a, b, tol = 1e-3) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol,
};

/** Closest point on segment ab to p → {t (0..1), point, d, along (metres from a)} */
function projectOnSegment(p, a, b) {
  const ab = V.sub(b, a);
  const L2 = V.dot(ab, ab) || 1e-12;
  let t = V.dot(V.sub(p, a), ab) / L2;
  t = Math.max(0, Math.min(1, t));
  const point = V.add(a, V.mul(ab, t));
  return { t, point, d: V.dist(p, point), along: t * Math.sqrt(L2) };
}

function polygonArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function distToPolygonEdges(p, poly) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = projectOnSegment(p, poly[i], poly[(i + 1) % poly.length]).d;
    if (d < m) m = d;
  }
  return m;
}

/** A good label point inside (also L-shaped) polygons: grid search for the point farthest from the edges
 *  (and out of any holes, such as a stairwell). */
function labelPoint(poly, holes = []) {
  if (!poly || poly.length < 3) return [0, 0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  let best = null, bestD = -1;
  const N = 18;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const p = [minX + (maxX - minX) * i / N, minY + (maxY - minY) * j / N];
    if (!pointInPolygon(p, poly) || holes.some(hl => pointInPolygon(p, hl))) continue;
    // prefer the middle slightly so labels don't hug one side of big rooms
    const d = Math.min(distToPolygonEdges(p, poly), ...holes.map(hl => distToPolygonEdges(p, hl)));
    // (equally good – along the middle of a long path or room: the one nearest the middle)
    const mid = q => Math.hypot(q[0] - (minX + maxX) / 2, q[1] - (minY + maxY) / 2);
    if (d > bestD + 1e-6 || (d > bestD - 1e-6 && mid(p) < mid(best))) { bestD = Math.max(d, bestD); best = p; }
  }
  return best || [(minX + maxX) / 2, (minY + maxY) / 2];
}

/** convex hull (counter-clockwise) of 2D points */
function convexHull(points) {
  const pts = points.map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-9) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 1e-9) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

/** smallest rectangle around 2D points (its sides follow one of the hull's edges) */
function minAreaRect(points) {
  const hull = convexHull(points);
  if (hull.length < 3) return hull;
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1], u[0]];
    let u0 = Infinity, u1 = -Infinity, n0 = Infinity, n1 = -Infinity;
    for (const p of hull) { const pu = p[0] * u[0] + p[1] * u[1], pn = p[0] * n[0] + p[1] * n[1]; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); n0 = Math.min(n0, pn); n1 = Math.max(n1, pn); }
    const area = (u1 - u0) * (n1 - n0);
    if (!best || area < best.area - 1e-9) best = { area, u, n, u0, u1, n0, n1 };
  }
  const { u, n, u0, u1, n0, n1 } = best;
  const pt = (pu, pn) => [u[0] * pu + n[0] * pn, u[1] * pu + n[1] * pn];
  return [pt(u0, n0), pt(u1, n0), pt(u1, n1), pt(u0, n1)];
}

/** the part of polygon `subject` inside the convex polygon `clip` (Sutherland–Hodgman) */
function clipToConvex(subject, clip) {
  if (polygonArea(clip) < 0) clip = clip.slice().reverse();
  let out = subject.slice();
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const side = p => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const inp = out;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
  }
  return out;
}

function bboxOfPoints(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Ramer–Douglas–Peucker on a closed ring */
function simplifyRing(points, eps) {
  if (points.length < 4) return points;
  // split the ring at the two farthest-apart points so both halves are open polylines
  let i0 = 0, i1 = 0, best = -1;
  for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / 64))) {
    for (let j = 0; j < points.length; j++) {
      const d = V.dist(points[i], points[j]);
      if (d > best) { best = d; i0 = i; i1 = j; }
    }
  }
  if (i0 > i1) [i0, i1] = [i1, i0];
  const a = points.slice(i0, i1 + 1);
  const b = points.slice(i1).concat(points.slice(0, i0 + 1));
  const ra = rdp(a, eps), rb = rdp(b, eps);
  return ra.slice(0, -1).concat(rb.slice(0, -1));
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let idx = -1, dmax = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = projectOnSegment(pts[i], a, b).d;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [a, b];
}

/* ───────── formatting ───────── */
const round = (v, step) => Math.round(Math.round(v / step) * step * 1e6) / 1e6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtMM = m => String(Math.round(m * 1000));
/** a decimal number as written in the chosen language (Dutch and Norwegian: comma) */
const fmtDec = s => (I18N.lang === 'en' ? s : s.replace('.', ','));
const fmtM = m => fmtDec((Math.round(m * 100) / 100).toFixed(2)) + ' m';
const fmtArea = a => fmtDec((Math.round(Math.abs(a) * 10) / 10).toFixed(1)) + ' m²';
/** the date formatters are made once per language (a new one for every line cost 12–72 ms at the start, 0018) */
const FMT_CACHE = { loc: null, date: null, time: null };
function fmtDate(ts, withTime = true) {
  const loc = i18nLocale();
  if (FMT_CACHE.date === null || FMT_CACHE.loc !== loc) {
    FMT_CACHE.loc = loc;
    FMT_CACHE.date = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' });
    FMT_CACHE.time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' });
  }
  const d = new Date(ts), date = FMT_CACHE.date.format(d);
  return withTime ? date + ' ' + FMT_CACHE.time.format(d) : date;
}
function fmtTime(ts) { return new Date(ts).toLocaleTimeString(i18nLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function fmtAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return t('just now');
  if (s < 60) return t('{n} s ago', { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return t('{n} min ago', { n: m });
  const hh = Math.round(m / 60);
  if (hh < 24) return t('{n} h ago', { n: hh });
  return fmtDate(ts, false);
}
/** like fmtAgo, but in days up to two months ("12 days ago"), for "Exported …" */
function fmtAgoDays(ts) {
  const d = Math.floor((Date.now() - ts) / 864e5);
  if (d < 1) return fmtAgo(ts);
  if (d === 1) return t('yesterday');
  if (d < 60) return t('{n} days ago', { n: d });
  return fmtDate(ts, false);
}
function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}
function slugify(name) {
  return String(name || 'house').trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'house';
}
function todayStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** colour helpers */
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [200, 200, 200];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function readFileAs(file, how) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    if (how === 'text') r.readAsText(file);
    else if (how === 'buffer') r.readAsArrayBuffer(file);
    else r.readAsDataURL(file);
  });
}
/** a house file: plain JSON, or gzip-compressed JSON (.house) */
/** a house file (.house.json, or packed: .house.gz) read; max: a packed file that unpacks to more than this many bytes
 *  is not read on (an error with code 'HP_TOO_BIG' – a small .gz can unpack to far more than a phone has; task 0022) */
async function readHouseFile(file, max) {
  const buf = new Uint8Array(await readFileAs(file, 'buffer'));
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser can not unpack the file.');
    const rd = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      n += value.length;
      if (max && n > max) {
        try { rd.cancel().catch(() => {}); } catch (e) { /* stopped */ }
        const e = new Error('The file unpacks to more than ' + max + ' bytes.');
        e.code = 'HP_TOO_BIG';
        throw e;
      }
      parts.push(value);
    }
    return JSON.parse(await new Blob(parts).text());
  }
  return JSON.parse(new TextDecoder().decode(buf));
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the image'));
    img.src = src;
  });
}
function pickFiles(accept) {
  return new Promise(resolve => {
    const inp = h('input', { type: 'file', accept, multiple: true, style: { position: 'fixed', left: '-1000px' } });
    inp.addEventListener('change', () => { resolve([...inp.files]); inp.remove(); });
    inp.addEventListener('cancel', () => { resolve([]); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  });
}
function pickFile(accept) {
  return new Promise(resolve => {
    const inp = h('input', { type: 'file', accept, style: { position: 'fixed', left: '-1000px' } });
    inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
    inp.addEventListener('cancel', () => { resolve(null); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  });
}

/** a short name for a storey tab on a phone: Begane grond → BG, 1e verdieping → 1e, Ground floor → GF, Attic → Att */
function shortStoreyName(name) {
  const n = String(name || '').trim();
  const m = n.match(/^(\d+)\s*(e|ste|de|st|nd|rd|th)?\b/i);
  if (m) return m[1] + (m[2] ? m[2].toLowerCase().slice(0, 2) : '');
  if (/^begane\s*grond/i.test(n)) return 'BG';
  if (/^ground/i.test(n)) return 'GF';
  if (/^(first|eerste)\b/i.test(n)) return '1e';
  if (/^(second|tweede)\b/i.test(n)) return '2e';
  if (/^(third|derde)\b/i.test(n)) return '3e';
  const words = n.split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.map(w => w[0]).join('').slice(0, 3).toUpperCase() : n.slice(0, 4);
}
