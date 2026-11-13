// The made-up test house → build/example.json (the public app's example and the house the public tests use):
//   python3 tools/testhouse/make_ifc.py && python3 tools/testhouse/make_pdf.py && node tools/testhouse/build.mjs
// Reads tools/testhouse/testhouse.ifc with the app's own IFC import (src/ifc2house.js) and adds what an owner would
// add in the app: two planned versions (the kitchen opened to the living room: a wall taken out; the living room split
// into a living room and a study), floors and colours, floor heating, two furniture layouts with a kitchen, the
// electrics (sockets, switches, lights, data, valves, water points, units), a plot with a street and a garden in every
// version, and a small PDF in the house's documents. Ids are made from a fixed seed, so a run gives the same file.
// Positions below are in the IFC's metres (x 0 … 8 inside the outside walls, y 0 at the front, y 9.6 at the back);
// pt() turns them into plan coordinates. Nothing here comes from a real house.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
process.env.THREE_DIR = process.env.THREE_DIR || path.join(ROOT, 'vendor', 'three');
const { loadSrc } = await import('../load.mjs');
// a fixed sequence instead of Math.random, so the ids are the same on every run
let seed = 20261112;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
// … and a fixed clock (uid() also puts the time in an id)
Date.now = () => Date.UTC(2026, 10, 12, 12);
const L = loadSrc(['util.js', 'model.js', 'ifc.js', 'ifc2house.js'],
  ['IFC', 'IfcHouse', 'uid', 'clone', 'V', 'wallDir', 'wallLen', 'splitWall', 'findAllRooms', 'labelPoint', 'pointInPolygon', 'bboxOfPoints', 'roomArea', 'joinWalls']);
const { IFC, IfcHouse, uid, clone, V } = L;
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'rooms.json'), 'utf8'));
const model = IFC.parse(fs.readFileSync(path.join(here, 'testhouse.ifc'), 'utf8'));
const res = IfcHouse.convert([model], cfg);
const NOW = Date.UTC(2026, 10, 12, 12);
const O = res.origin;
const pt = (x, y) => [+(x - O.X0).toFixed(3), +(O.Y1 - y).toFixed(3)];
const st = name => res.storeys.find(s => s.name === name);
const [BG, V1, ZO] = ['Begane grond', '1e verdieping', 'Zolder'].map(st);
const room = (plan, s, name) => plan.rooms.find(r => r.storey === s.id && r.name === name);
const roomAt = (plan, s, x, y) => plan.rooms.find(r => r.storey === s.id && !r.storage && L.pointInPolygon(pt(x, y), r.poly));
const wallAt = (plan, s, x, y, kind = 'interior') => plan.walls.find(w => w.storey === s.id && w.kind === kind && !w.leaf &&
  (() => { const p = pt(x, y), pr = projectOn(p, w); return pr.d < w.t / 2 + 0.02 && pr.u > 0.05 && pr.u < L.wallLen(w) - 0.05; })());
function projectOn(p, w) { const d = L.wallDir(w), r = V.sub(p, w.a), u = V.dot(r, d); return { u, d: Math.abs(V.cross(d, r)) }; }
const reRoom = (plan, s, keep) => {
  const found = L.findAllRooms(plan.walls.filter(w => w.storey === s.id), 0.6);
  const lp = L.labelPoint(keep.poly), f = found.find(x => L.pointInPolygon(lp, x.poly));
  if (f) keep.poly = f.poly;
};
const r3 = v => +v.toFixed(3);

/* ───────── the original, as delivered ───────── */
const orig = res.plan;
for (const r of orig.rooms) { r.notes = r.notes || ''; r.items = r.items || []; }
// floor heating downstairs and in the bathroom, as the builder delivers it
for (const r of orig.rooms) if (r.storey === BG.id && !/Meterkast/.test(r.name) || r.name === 'Badkamer') r.heat = { on: true, zone: 'Verdeler in de bijkeuken' };
const original = { id: uid('v_'), name: 'Original (as delivered)', kind: 'original', locked: true, status: 'active', created: NOW, updated: NOW,
  note: 'Het testhuis zoals de bouwer het oplevert (casco). Een verzonnen huis voor de app en haar tests.', plan: orig };

/* ───────── plan A: the kitchen open to the living room (a wall taken out) ───────── */
const planA = clone(orig);
{
  const kitchen = room(planA, BG, 'Keuken'), living = room(planA, BG, 'Woonkamer');
  const wall = wallAt(planA, BG, 6.0, 4.45);
  if (!wall) throw new Error('the wall between the kitchen and the living room was not found');
  // the wall runs the whole width: cut it at the hall's wall and take out the kitchen's part (with its passage)
  const d = L.wallDir(wall), cutAt = V.dot(V.sub(pt(4.1, 4.45), wall.a), d);
  const w2 = L.splitWall(planA, wall, cutAt);
  const mid = w => V.lerp(w.a, w.b, 0.5)[0];
  const kPart = mid(w2) > mid(wall) === (pt(6, 0)[0] > pt(2, 0)[0]) ? w2 : wall;
  planA.walls = planA.walls.filter(w => w !== kPart);
  planA.openings = planA.openings.filter(o => o.wall !== kPart.id);
  planA.rooms = planA.rooms.filter(r => r !== kitchen);
  reRoom(planA, BG, living);
  Object.assign(living, { name: 'Woonkeuken', notes: 'Keuken en woonkamer samen: de wand met de doorgang eruit (niet dragend volgens de bouwer? navragen).' });
}
const versionA = { id: uid('v_'), name: 'Plan – open kitchen', kind: 'plan', locked: false, status: 'active', created: NOW, updated: NOW, basedOn: original.id,
  note: 'De wand tussen keuken en woonkamer eruit: één woonkeuken.', plan: planA };

/* ───────── plan B: the living room split into a living room and a study ───────── */
const planB = clone(orig);
{
  const living = room(planB, BG, 'Woonkamer');
  const t = 0.1, x = 2.0;
  const a = pt(x, 4.5), b = pt(x, 9.6);
  const w = { id: uid('w_'), storey: BG.id, a: [r3(a[0]), r3(a[1] + 0.0)], b: [r3(b[0]), r3(b[1])], t, kind: 'interior', h: null };
  planB.walls.push(w);
  // a door from the living room into the study, near the hall's side
  const along = V.dist(w.a, pt(x, 5.3));
  planB.openings.push({ id: uid('o_'), wall: w.id, kind: 'door', pos: r3(along), w: 0.83, h: 2.315, sill: 0, hinge: 'start', swing: 'left' });
  const study = { ...clone(living), id: uid('r_'), name: 'Werkkamer', notes: 'Nieuwe wand op de lijn van de hal; deur vanuit de woonkamer.', items: [],
    poly: [pt(0, 4.5), pt(1.95, 4.5), pt(1.95, 9.6), pt(0, 9.6)] };
  planB.rooms.push(study);
  reRoom(planB, BG, living);
  reRoom(planB, BG, study);
}
console.log('joined new wall ends:', L.joinWalls(planA) + L.joinWalls(planB));
const versionB = { id: uid('v_'), name: 'Plan – study', kind: 'plan', locked: false, status: 'active', created: NOW, updated: NOW, basedOn: original.id,
  note: 'De woonkamer gesplitst: een werkkamer aan de tuinkant.', plan: planB };

/* ───────── finishes in the planned versions ───────── */
const oak = { material: 'oak', color: '#C49A6C' };
for (const [plan, warm] of [[planA, false], [planB, true]]) for (const r of plan.rooms) {
  if (r.storage) continue;
  if (/Woon|Hal|Overloop|Slaapkamer|Zolder|Werkkamer/.test(r.name)) { r.floor = warm ? { ...oak } : { material: 'pvc', color: '#8C8780' }; r.wallColor = warm ? '#F1EDE4' : '#D9D5CC'; r.wallColorName = warm ? 'Warm wit (RAL 9001)' : 'Greige (RAL 7044)'; }
  if (/Toilet|Badkamer/.test(r.name)) { r.floor = { material: 'tiles', color: '#8D9192' }; r.wallColor = '#E9E6DF'; }
  // the toilets tiled to 1.5 m (30 × 60, stacked), as builders often deliver them
  if (/Toilet/.test(r.name)) Object.assign(r, { wallColorName: '', tiles: { to: 1.5, w: 0.3, h: 0.6, joint: 0.003, color: '#E9E6DF', grout: '#C9C4BA', lay: 'stack', waste: 10, name: '' } });
  if (/Keuken|Bijkeuken/.test(r.name)) r.floor = { material: 'tiles', color: '#9A9488' };
}
Object.assign(room(planA, V1, 'Badkamer'), { notes: 'Inloopdouche onder het raam, wastafelmeubel 100.', items: [{ id: uid('i_'), text: 'Inloopdouche 90 × 120' }, { id: uid('i_'), text: 'Wastafelmeubel 100' }] });

/* ───────── the electrics (in every version; a point on a wall a version took out is left out there) ───────── */
// [storey, kind, sub, x, y, height (wall points), { n: sockets, l: label, size / rot: units }]
const POINTS = [
  [BG, 'switch', '', 2.06, 0.9, 1.05], [BG, 'light', '', 3.0, 2.2], [BG, 'smoke', '', 2.6, 3.6], [BG, 'bell', 'chime', 2.06, 3.9, 2.2],
  [BG, 'light', '', 1.0, 0.7], [BG, 'switch', '', 1.94, 1.2, 1.05], [BG, 'wallvent', 'extract', 0.02, 0.8, 2.2],
  [BG, 'socket', '', 0.6, 1.5, 0.3, { n: 2 }], [BG, 'unit', 'board', 1.0, 1.55, 0, { size: [0.6, 0.12, 0.8], rot: 0 }],
  [BG, 'socket', 'group', 0.02, 3.2, 0.3, { n: 1, l: 'Wasmachine' }], [BG, 'socket', 'group', 0.02, 3.9, 0.3, { n: 1, l: 'Droger' }],
  [BG, 'water', 'cold', 0.02, 3.5, 0.55], [BG, 'water', 'drain', 0.02, 3.6, 0.4], [BG, 'manifold', '', 1.5, 4.38, 0.5], [BG, 'light', '', 1.0, 3.5],
  [BG, 'socket', 'perilex', 7.98, 2.6, 0.3, { n: 1 }], [BG, 'socket', 'group', 7.98, 1.6, 0.3, { n: 1, l: 'Vaatwasser' }],
  [BG, 'socket', '', 7.98, 0.6, 1.2, { n: 2 }], [BG, 'socket', '', 7.98, 3.6, 1.2, { n: 2 }], [BG, 'water', 'hotcold', 7.98, 2.0, 0.55], [BG, 'water', 'drain', 7.98, 2.1, 0.4],
  [BG, 'light', '', 6.0, 1.4], [BG, 'light', '', 6.0, 3.2], [BG, 'switch', 'double', 4.1, 1.15, 1.05], [BG, 'vent', 'extract', 5.0, 2.0],
  [BG, 'socket', '', 0.02, 5.2, 0.3, { n: 2 }], [BG, 'socket', '', 0.02, 9.0, 0.3, { n: 2 }], [BG, 'socket', '', 7.98, 5.85, 0.3, { n: 2 }], [BG, 'socket', '', 7.98, 9.0, 0.3, { n: 2 }],
  [BG, 'tv', '', 4.0, 9.58, 0.3], [BG, 'data', '', 4.3, 9.58, 0.3], [BG, 'socket', '', 4.6, 9.58, 0.3, { n: 2 }],
  [BG, 'light', '', 2.0, 7.0], [BG, 'light', '', 6.0, 7.0], [BG, 'switch', 'twoway', 3.1, 4.52, 1.05], [BG, 'thermostat', '', 0.02, 6.5, 1.5],
  [BG, 'walllight', 'outside', -0.38, 6.8, 2.0, { out: true }],
  [V1, 'light', '', 3.0, 2.5], [V1, 'smoke', '', 2.6, 4.8], [V1, 'switch', 'twoway', 2.06, 0.3, 1.05],
  [V1, 'light', '', 1.0, 1.7], [V1, 'vent', 'extract', 1.0, 2.8], [V1, 'water', 'hotcold', 0.02, 1.2, 0.55], [V1, 'water', 'hotcold', 0.02, 2.6, 1.0], [V1, 'socket', 'waterproof', 1.94, 0.6, 1.2, { n: 1 }],
  [V1, 'light', '', 1.0, 4.5], [V1, 'vent', 'extract', 1.0, 5.0],
  [V1, 'light', '', 6.0, 2.7], [V1, 'switch', '', 4.1, 5.35, 1.05], [V1, 'socket', '', 4.1, 1.0, 0.3, { n: 2 }], [V1, 'socket', '', 7.98, 4.8, 0.3, { n: 2 }], [V1, 'socket', '', 7.98, 0.6, 0.3, { n: 2 }], [V1, 'data', '', 7.98, 0.9, 0.3],
  [V1, 'light', '', 1.5, 7.6], [V1, 'switch', '', 2.95, 5.8, 1.05], [V1, 'socket', '', 0.02, 6.5, 0.3, { n: 2 }], [V1, 'socket', '', 2.93, 8.8, 0.3, { n: 2 }],
  [V1, 'light', '', 5.5, 7.6], [V1, 'switch', '', 3.1, 5.8, 1.05], [V1, 'socket', '', 7.98, 6.5, 0.3, { n: 2 }], [V1, 'socket', '', 7.98, 8.8, 0.3, { n: 2 }], [V1, 'conduit', '', 3.1, 9.0, 0.3],
  [ZO, 'light', '', 4.5, 2.5], [ZO, 'socket', '', 3.5, 5.48, 0.3, { n: 2 }], [ZO, 'unit', 'wtw', 6.2, 2.0, 0, { size: [0.725, 0.57, 0.81], rot: 90 }],
  [ZO, 'unit', 'inverter', 6.2, 3.4, 0, { size: [0.35, 0.15, 0.45], rot: 90 }], [ZO, 'light', '', 4.0, 7.5], [ZO, 'socket', '', 2.5, 5.62, 0.3, { n: 2 }],
  [BG, 'water', 'cold', 1.6, 0.02, 0.55],   // the hand basin in the toilet (added last: the other points keep their ids)
];
const CEIL = new Set(['light', 'vent', 'smoke']);
function makePoint(plan, i, [s, kind, sub, x, y, h, o = {}]) {
  const p = pt(x, y);
  const id = 'pt_ex_' + String(i).padStart(3, '0');
  const P = { id, storey: s.id, kind, sub: sub || '', x: p[0], y: p[1], h: CEIL.has(kind) ? null : h };
  if (kind === 'socket') P.n = o.n || 2;
  if (o.l) P.label = o.l;
  if (kind === 'unit') { P.size = o.size.slice(); P.rot = o.rot || 0; return P; }
  if (CEIL.has(kind)) return P;
  // on the nearest wall face (inside walls and the inner leaf; outside points on the brick)
  let best = null;
  for (const w of plan.walls) {
    if (w.storey !== s.id || w.kind === 'insulation' || (w.leaf === 'outer') !== !!o.out) continue;
    const L0 = L.wallLen(w), d = L.wallDir(w), n = V.perp(d), u = V.dot(V.sub(p, w.a), d);
    if (L0 < 0.1 || u < 0.02 || u > L0 - 0.02) continue;
    const off = V.dot(V.sub(p, w.a), n), side = off >= 0 ? 1 : -1, dist = Math.abs(Math.abs(off) - w.t / 2);
    if (dist > 0.12 || (best && dist >= best.dist)) continue;
    const nn = V.mul(n, side);
    best = { w, side, dist, pos: V.add(V.add(w.a, V.mul(d, u)), V.mul(nn, w.t / 2 + 0.02)), rot: Math.round(Math.atan2(nn[1], nn[0]) * 180 / Math.PI) };
  }
  if (!best) return null;
  return Object.assign(P, { x: r3(best.pos[0]), y: r3(best.pos[1]), wall: best.w.id, side: best.side, rot: best.rot });
}
for (const plan of [orig, planA, planB]) {
  plan.points = [];
  POINTS.forEach((row, i) => { const P = makePoint(plan, i + 1, row); if (P) plan.points.push(P); });
}
const missing = POINTS.filter((row, i) => !orig.points.some(q => q.id === 'pt_ex_' + String(i + 1).padStart(3, '0')));
if (missing.length) throw new Error('points without a wall: ' + JSON.stringify(missing.map(r => r.slice(1, 5))));
planA.elecColor = '#F4F4F2';

/* ───────── furniture: two layouts, a kitchen ───────── */
// front: where the piece's front faces, in the IFC's directions: 'street' (y −), 'garden' (y +), 'right' (x +), 'left' (x −)
const ROT = { street: 0, garden: 180, right: 270, left: 90 };
const F = (type, s, x, y, front, w, d, h, extra = {}) => {
  const p = pt(x, y);
  return { id: uid('f_'), type, storey: s.id, x: p[0], y: p[1], rot: ROT[front], w, d, h, color: extra.color || '#B7B2A8', shop: {}, ...extra };
};
const kitchen = [
  // (the run's end against the wall to the living room)
  F('krun', BG, 7.7, 2.6, 'left', 3.6, 0.6, 0.9, { color: '#E9E6E0', top: '#4A4744', topMat: 'marble', units: [{ k: 'fridge', w: 0.6 }, { k: 'drawers', w: 0.6 }, { k: 'sink', w: 0.8 }, { k: 'dw', w: 0.6 }, { k: 'hob', w: 0.8 }, { k: 'drawers', w: 0.2 }], name: 'Keuken – wand' }),
  F('island', BG, 5.4, 2.2, 'right', 2.4, 1.0, 0.9, { color: '#E9E6E0', top: '#4A4744', topMat: 'marble', island: true, ov: 0.3, units: [{ k: 'drawers', w: 0.6 }, { k: 'base', w: 0.6 }, { k: 'base', w: 0.6 }, { k: 'drawers', w: 0.6 }] }),
];
const layout1 = [
  ...kitchen,
  F('sofa3', BG, 5.8, 8.9, 'street', 2.2, 0.9, 0.85, { color: '#6F7A80' }), F('armchair', BG, 3.6, 7.6, 'right', 0.85, 0.85, 0.85, { color: '#A08C74' }),
  F('coffee', BG, 5.8, 7.6, 'street', 1.1, 0.6, 0.42, { color: '#8B6B4E' }), F('tvunit', BG, 5.8, 4.75, 'garden', 1.8, 0.4, 0.5, { color: '#3B3B3B' }),
  F('dtable', BG, 1.6, 7.0, 'garden', 1.8, 0.9, 0.75, { color: '#8B6B4E' }),
  F('chair', BG, 1.1, 6.35, 'garden', 0.45, 0.5, 0.85, { color: '#3B3B3B' }), F('chair', BG, 2.1, 6.35, 'garden', 0.45, 0.5, 0.85, { color: '#3B3B3B' }),
  F('chair', BG, 1.1, 7.65, 'street', 0.45, 0.5, 0.85, { color: '#3B3B3B' }), F('chair', BG, 2.1, 7.65, 'street', 0.45, 0.5, 0.85, { color: '#3B3B3B' }),
  F('washer', BG, 0.35, 3.2, 'right', 0.6, 0.6, 0.85, { color: '#F2F2F2' }), F('dryer', BG, 0.35, 3.85, 'right', 0.6, 0.6, 0.85, { color: '#F2F2F2' }),
  F('wc', BG, 0.4, 0.55, 'right', 0.38, 0.55, 0.8, { color: '#FFFFFF' }), F('basin', BG, 1.6, 0.25, 'garden', 0.4, 0.25, 0.85, { color: '#FFFFFF' }),
  F('bed2', V1, 6.0, 1.0, 'garden', 1.6, 2.0, 1.0, { color: '#D9D2C5' }), F('nightstand', V1, 4.85, 0.25, 'garden', 0.45, 0.4, 0.5, { color: '#8B6B4E' }), F('nightstand', V1, 7.15, 0.25, 'garden', 0.45, 0.4, 0.5, { color: '#8B6B4E' }),
  F('wardrobe', V1, 5.5, 5.15, 'street', 2.0, 0.6, 2.2, { color: '#EDEAE4' }),
  F('bed1', V1, 1.5, 8.55, 'street', 0.9, 2.0, 0.9, { color: '#C9D3DA' }),
  // a piece from the app's 3D model library (Kenney, CC0): a small cabinet beside the bed
  F('model', V1, 2.4, 9.35, 'street', 0.5, 0.4, 0.45, { color: '#7D8790', model: 'k:cabinetBed' }), F('desk', V1, 0.45, 6.6, 'right', 1.2, 0.6, 0.75, { color: '#EDEAE4' }), F('ochair', V1, 1.0, 6.6, 'left', 0.55, 0.55, 0.9, { color: '#3B3B3B' }),
  F('bed2', V1, 5.5, 8.55, 'street', 1.4, 2.0, 1.0, { color: '#D9D2C5' }), F('wardrobe', V1, 7.65, 7.2, 'left', 1.5, 0.6, 2.2, { color: '#EDEAE4' }),
  F('shower', V1, 0.45, 0.45, 'right', 0.9, 0.9, 2.0, { color: '#DDE3E6' }), F('vanity', V1, 1.6, 2.2, 'left', 0.8, 0.5, 0.85, { color: '#FFFFFF' }), F('wc', V1, 0.3, 4.9, 'right', 0.38, 0.55, 0.8, { color: '#FFFFFF' }),
  F('bed2', ZO, 4.0, 8.4, 'street', 1.6, 2.0, 1.0, { color: '#D9D2C5' }), F('sofa2', ZO, 5.5, 1.0, 'street', 1.6, 0.85, 0.85, { color: '#6F7A80' }),
];
const layout2 = clone(layout1).map(f => ({ ...f, id: uid('f_') }));
// the second layout: the sofa turned to the garden, the dining table in the middle
for (const f of layout2) {
  if (f.type === 'sofa3') Object.assign(f, { ...(([x, y]) => ({ x, y }))(pt(5.8, 5.4)), rot: ROT.garden });
  if (f.type === 'tvunit') Object.assign(f, { ...(([x, y]) => ({ x, y }))(pt(5.8, 9.3)), rot: ROT.street });
}
const furniture = { layouts: [
  { id: 'l_ex_1', name: 'Layout 1', items: layout1, created: NOW },
  { id: 'l_ex_2', name: 'Layout 2 – sofa to the garden', items: layout2, created: NOW },
], activeLayoutId: 'l_ex_1', sets: [] };

/* ───────── the plot, the street and the garden ───────── */
const plot = [pt(-4.4, -6.4), pt(12.4, -6.4), pt(12.4, 22.0), pt(-4.4, 22.0)];
const site = {
  v: 10, from: 'Made-up plot of the test house', plot, north: 20, lat: 52.09, lon: 5.12, level: -0.15, streetLevel: -0.2,
  // a ditch behind the back gardens (Water & park): water 1 m below the plot, its bed 1.8 m
  water: { level: -1.0, bed: -1.8, poly: [pt(-30, 24.0), pt(40, 24.0), pt(40, 27.5), pt(-30, 27.5)] },
  streets: [
    { kind: 'path', poly: [pt(-30, -6.4), pt(40, -6.4), pt(40, -8.2), pt(-30, -8.2)] },
    { kind: 'road', poly: [pt(-30, -8.2), pt(40, -8.2), pt(40, -14.2), pt(-30, -14.2)] },
  ],
  trees: [[...pt(-2, -11.2), 5], [...pt(10, -11.2), 5], [...pt(22, -11.2), 5]],
  around: { houses: [
    { box: [...pt(16.4, 9.6), ...pt(26.4, -0.4)].map(r3), ridge: 'y', brick: [0.55, 0.32, 0.24], gable: true, pv: 2 },
    { box: [...pt(-18.4, 10.0), ...pt(-8.4, 0)].map(r3), ridge: 'x', brick: [0.5, 0.29, 0.21], pv: 3 },
  ] },
};
for (const h of site.around.houses) { const b = h.box; h.box = [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])]; }
const rect = (x0, y0, x1, y1) => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)];
const line = (kind, pts, h, t, extra = {}) => ({ id: uid('gl_'), kind, pts, h, t, ...extra });
const delivered = {
  base: 'soil',
  areas: [
    { id: uid('ga_'), kind: 'tiles', size: [0.4, 0.4], name: 'Front path', poly: rect(2.3, -0.4, 3.8, -6.4) },
    { id: uid('ga_'), kind: 'pavers', name: 'Drive', poly: rect(8.6, 0, 11.4, -6.4) },
  ],
  lines: [
    line('hedge', [pt(-4.15, -6.0), pt(-4.15, 21.75)], 1.8, 0.5),
    line('fence', [pt(-4.35, 21.95), pt(12.35, 21.95)], 1.8, 0.05),
    line('wall', [pt(-4.3, -6.3), pt(2.2, -6.3)], 0.45, 0.22),
  ],
  plants: [],
};
const sample = g => {
  g = clone(g);
  g.base = 'lawn';
  g.areas.push({ id: 'ga_ex_terrace', kind: 'tiles', size: [0.6, 0.6], name: 'Terrace', poly: rect(-0.4, 10.0, 6.0, 13.5) });
  // the drive becomes a parking place of 50 × 50 cm tiles in the plans (same id as the delivered drive)
  Object.assign(g.areas.find(a => a.name === 'Drive'), { kind: 'tiles', size: [0.5, 0.5], name: 'Parking' });
  g.areas.push({ id: 'ga_ex_border', kind: 'planting', poly: rect(8.5, 12.0, 12.2, 21.5) });
  // a metal gate with its railing across the side passage, just behind the front of the house
  g.lines.push(line('gate', [pt(8.4, 1.5), pt(12.35, 1.5)], 1.8, 0.08, { gate: { w: 1.0, at: 0.5, side: 1, top: true } }));
  g.plants.push({ id: 'gp_ex_tree', kind: 'tree', x: pt(3, 18)[0], y: pt(3, 18)[1], d: 5, h: 7, name: 'Multi-stem tree' });
  for (const [x, y] of [[9.5, 14], [10.8, 17], [9.6, 20]]) g.plants.push({ id: uid('gp_'), kind: 'shrub', x: pt(x, y)[0], y: pt(x, y)[1], d: 1.3, h: 1.2 });
  g.plants.push({ id: uid('gp_'), kind: 'pot', x: pt(5.5, 10.6)[0], y: pt(5.5, 10.6)[1], d: 0.6, h: 0.9 });
  return g;
};
orig.garden = delivered;
planA.garden = sample(delivered);
planB.garden = sample(delivered);
planB.garden.areas.push({ id: uid('ga_'), kind: 'water', name: 'Pond', poly: rect(1.0, 16.0, 3.4, 18.0) });

/* ───────── a document: the floor plans as a PDF ───────── */
const pdf = fs.readFileSync(path.join(here, 'plans.pdf')), thumb = fs.readFileSync(path.join(here, 'plans-thumb.jpg'));
const docs = [{ id: 'doc_ex_plans', name: 'Plattegronden testhuis', file: 'plattegronden-testhuis.pdf', type: 'pdf', added: NOW, storeys: { [BG.id]: [1], [V1.id]: [2] }, rot: 0, pages: 2,
  asset: 'as_ex_plans_pdf', thumb: 'as_ex_plans_th', size: pdf.length }];
const files = {
  as_ex_plans_pdf: { type: 'application/pdf', b64: pdf.toString('base64') },
  as_ex_plans_th: { type: 'image/jpeg', b64: thumb.toString('base64'), w: 200, h: 283 },
};

/* ───────── the house ───────── */
const project = {
  app: 'house-planner', schema: 1, id: 'p_example_testhouse', name: 'Testhuis (made-up example)', created: NOW, updated: NOW,
  storeys: res.storeys.map(({ ifcName, ...s }) => s), underlays: {}, versions: [original, versionB, versionA], activeVersionId: versionB.id,
  example: true, wallsJoined: true, source: { kind: 'ifc', files: ['testhouse.ifc'], origin: res.origin },
  furniture, notes: [], walk: { nodes: [], edges: [], routes: [] }, site, models: {}, images: {}, docs,
};
const shellJson = JSON.stringify(IfcHouse.packShell(res.shell));
const gz = zlib.gzipSync(Buffer.from(shellJson), { level: 9 });
const out = path.join(ROOT, 'build', 'example.json');
fs.writeFileSync(out, JSON.stringify({ project, shellGz: gz.toString('base64'), files }));
const count = (plan, s) => plan.rooms.filter(r => r.storey === s.id).map(r => r.name + ' ' + L.roomArea(r).toFixed(1)).join(', ');
for (const v of project.versions) console.log(v.name + ':', [BG, V1, ZO].map(s => s.name + ': ' + count(v.plan, s)).join(' | '));
console.log(`points ${orig.points.length}, furniture ${layout1.length} + ${layout2.length}, voids ${orig.voids.length}`);
console.log('written:', out, (JSON.stringify(project).length / 1024).toFixed(0), 'KB project,', (gz.length / 1024).toFixed(0), 'KB shell (gzip)');
