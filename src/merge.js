/* ───────────── merge.js — merging two copies of one house, change by change ─────────────
   When the house file someone sends is a copy of a house you have (the same house id), "Merge" lists what is
   different in their copy: things they have and you don't, things you both have but differently, and things only
   you have (perhaps they removed them). Each can be taken or skipped; a save point of your copy is made first.
   Without a shared history the app can't know who changed what, so what is newer (the version's last change) is
   ticked by default, and things only in your copy are kept unless you tick them. */

const MERGE_PLAN_LISTS = [
  ['walls', 'Walls'], ['openings', 'Doors and windows'], ['rooms', 'Rooms'], ['points', 'Electrics'], ['stairs', 'Stairs'], ['voids', 'Floor openings'],
];

function mergeChanges(mine, theirs) {
  const out = [];
  const add = (group, label, tag, on, apply) => out.push({ id: out.length, group, label, tag, on, apply });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const stName = (p, sid) => { const st = (p.storeys || []).find(s2 => s2.id === sid); return st ? st.name : ''; };
  /** an id list in both copies; get(m) finds the array in the merged copy */
  const lists = (group, A, B, label, get, newer) => {
    const ma = new Map((A || []).map(x => [x.id, x])), mb = new Map((B || []).map(x => [x.id, x]));
    for (const x of B || []) {
      const y = ma.get(x.id);
      if (!y) add(group, label(x), 'new', true, m => { const arr = get(m); if (arr && !arr.some(z => z.id === x.id)) arr.push(clone(x)); });
      else if (!same(x, y)) add(group, label(x), 'changed', newer, m => { const arr = get(m); if (!arr) return; const i = arr.findIndex(z => z.id === x.id); if (i >= 0) arr[i] = clone(x); else arr.push(clone(x)); });
    }
    for (const y of A || []) if (!mb.has(y.id)) add(group, label(y), 'only-mine', false, m => { const arr = get(m); if (!arr) return; const i = arr.findIndex(z => z.id === y.id); if (i >= 0) arr.splice(i, 1); });
  };
  // the versions and what is in them
  for (const tv of theirs.versions || []) {
    const mv = (mine.versions || []).find(v => v.id === tv.id);
    if (!mv) { add(t('Versions'), t('Version: {n}', { n: tv.name }), 'new', true, m => { if (!m.versions.some(v => v.id === tv.id)) m.versions.push(clone(tv)); }); continue; }
    const newer = (tv.updated || 0) > (mv.updated || 0);
    const vName = mv.kind === 'original' ? t('Original') : mv.name;
    const V2 = m => m.versions.find(v => v.id === tv.id);
    for (const k of ['name', 'note', 'locked', 'status']) if ((tv[k] ?? null) !== (mv[k] ?? null)) add(vName, t('Version: {k}', { k: t(k === 'note' ? 'its note' : k === 'locked' ? 'locked or not' : k) }) + ' → ' + String(tv[k] ?? '–').slice(0, 40), 'changed', newer, m => { const v = V2(m); if (v) v[k] = clone(tv[k]); });
    const plabel = {
      walls: w => t('Wall {l}', { l: fmtM(V.dist(w.a, w.b)) }) + ' · ' + stName(theirs, w.storey),
      openings: o => t({ door: 'Door', window: 'Window', opening: 'Opening' }[o.kind] || 'Opening') + ' ' + fmtMM(o.w) + (o.leaf ? ' (' + t('façade layer') + ')' : ''),
      rooms: r => r.name + ' · ' + stName(theirs, r.storey),
      points: pt => ptName(pt) + ' · ' + stName(theirs, pt.storey),
      stairs: s2 => t('Stair') + ' · ' + stName(theirs, s2.storey),
      voids: () => t('Floor opening'),
    };
    for (const [key, gl] of MERGE_PLAN_LISTS) lists(vName + ' · ' + t(gl), mv.plan[key], tv.plan[key], plabel[key], m => { const v = V2(m); if (!v) return null; v.plan[key] = v.plan[key] || []; return v.plan[key]; }, newer);
    // the garden of the version
    const mg = mv.plan.garden, tg = tv.plan.garden;
    if (tg && !mg) add(vName + ' · ' + t('Garden'), t('The whole garden'), 'new', true, m => { const v = V2(m); if (v) v.plan.garden = clone(tg); });
    else if (tg && mg) {
      if (tg.base !== mg.base) add(vName + ' · ' + t('Garden'), t('Everywhere else: {k}', { k: t((G_AREAS[tg.base] || {}).label || tg.base) }), 'changed', newer, m => { const v = V2(m); if (v && v.plan.garden) v.plan.garden.base = tg.base; });
      const G2 = key => m => { const v = V2(m); if (!v) return null; v.plan.garden = v.plan.garden || emptyGarden(); return v.plan.garden[key]; };
      lists(vName + ' · ' + t('Garden'), mg.areas, tg.areas, a => a.name || t((G_AREAS[a.kind] || {}).label || a.kind), G2('areas'), newer);
      lists(vName + ' · ' + t('Garden'), mg.lines, tg.lines, l => t(((G_LINES[l.kind] || {}).label || l.kind).replace(/ \(.*\)$/, '')) + ' ' + fmtM(gLineLen(l)), G2('lines'), newer);
      lists(vName + ' · ' + t('Garden'), mg.plants, tg.plants, pl => pl.name || t((G_PLANTS[pl.kind] || {}).label || pl.kind), G2('plants'), newer);
    }
  }
  const pNewer = (theirs.updated || 0) > (mine.updated || 0);
  // storeys
  lists(t('Storeys'), mine.storeys, theirs.storeys, s2 => s2.name, m => m.storeys, pNewer);
  // furniture: layouts and their pieces
  const mlays = (mine.furniture && mine.furniture.layouts) || [], tlays = (theirs.furniture && theirs.furniture.layouts) || [];
  for (const tl of tlays) {
    const ml = mlays.find(l => l.id === tl.id);
    if (!ml) { add(t('Furniture'), t('Layout: {n}', { n: tl.name }), 'new', true, m => { if (!m.furniture.layouts.some(l => l.id === tl.id)) m.furniture.layouts.push(clone(tl)); }); continue; }
    lists(t('Furniture') + ' · ' + tl.name, ml.items, tl.items, f => furnName(f) + (f.storey ? ' · ' + stName(theirs, f.storey) : ''), m => (m.furniture.layouts.find(l => l.id === tl.id) || {}).items, pNewer);
  }
  // notes (with their own dates)
  {
    const mm = new Map((mine.notes || []).map(n => [n.id, n]));
    for (const n of theirs.notes || []) {
      const y = mm.get(n.id);
      const lab = noteTitle(n);
      if (!y) add(t('Notes'), lab, 'new', true, m => { if (!m.notes.some(z => z.id === n.id)) m.notes.push(clone(n)); });
      else if (!same(n, y)) add(t('Notes'), lab, 'changed', (n.updated || n.created || 0) >= (y.updated || y.created || 0), m => { const i = m.notes.findIndex(z => z.id === n.id); if (i >= 0) m.notes[i] = clone(n); });
    }
  }
  // the task board: one line per cell
  {
    const mc = (mine.tasks && mine.tasks.cells) || {}, tc = (theirs.tasks && theirs.tasks.cells) || {};
    const rooms = new Map(); for (const v of theirs.versions || []) for (const r of v.plan.rooms) rooms.set(r.id, r.name);
    const steps = new Map(); for (const ph of (theirs.tasks && theirs.tasks.phases) || []) for (const s2 of ph.steps) steps.set(s2.id, s2.name);
    for (const [k, c] of Object.entries(tc)) {
      if (same(c, mc[k])) continue;
      const [rid, sid] = k.split('|');
      const lab = (rooms.get(rid) || '?') + ' – ' + (steps.get(sid) || '?') + ': ' + t({ todo: 'to do', doing: 'busy', done: 'done', skip: 'not here' }[c.s] || c.s || 'to do');
      const order = { undefined: 0, todo: 0, doing: 1, done: 2, skip: 2 };
      add(t('Task board'), lab, mc[k] ? 'changed' : 'new', (order[c.s] || 0) >= (order[(mc[k] || {}).s] || 0), m => { m.tasks = m.tasks || { phases: clone((theirs.tasks || {}).phases || []), cells: {} }; m.tasks.cells = m.tasks.cells || {}; m.tasks.cells[k] = clone(c); });
    }
    if (theirs.tasks && (!mine.tasks || !same(mine.tasks.phases, theirs.tasks.phases))) add(t('Task board'), t('The phases and steps'), mine.tasks ? 'changed' : 'new', !mine.tasks || pNewer, m => { m.tasks = m.tasks || { cells: {} }; m.tasks.phases = clone(theirs.tasks.phases); });
  }
  // budget
  if (theirs.budget) {
    const mb = mine.budget || { items: [] };
    lists(t('Budget'), mb.items, theirs.budget.items, it => it.name || t('Item'), m => { m.budget = m.budget || { total: theirs.budget.total, cats: clone(theirs.budget.cats || []), items: [] }; return m.budget.items; }, pNewer);
    if (!same(mb.total, theirs.budget.total) || !same(mb.cats, theirs.budget.cats)) add(t('Budget'), t('Budget totals and categories'), 'changed', pNewer, m => { m.budget = m.budget || { items: [] }; m.budget.total = theirs.budget.total; m.budget.cats = clone(theirs.budget.cats); });
  }
  // smaller lists
  lists(t('Colours'), mine.colours, theirs.colours, c => c.name || c.hex, m => (m.colours = m.colours || []), pNewer);
  lists(t('Saved views'), mine.viewpoints, theirs.viewpoints, x => x.name || t('View'), m => (m.viewpoints = m.viewpoints || []), pNewer);
  lists(t('Documents'), mine.docs, theirs.docs, x => x.name || t('Document'), m => (m.docs = m.docs || []), pNewer);
  lists(t('Walking routes'), mine.walk && mine.walk.routes, theirs.walk && theirs.walk.routes, x => x.name || t('Route'), m => { m.walk = m.walk || { nodes: [], edges: [], routes: [] }; return m.walk.routes; }, pNewer);
  for (const key of ['images', 'models']) for (const [id, x] of Object.entries(theirs[key] || {})) {
    const y = (mine[key] || {})[id];
    if (!y || !same(x, y)) add(key === 'images' ? t('Wallpaper pictures') : t('3D models'), x.name || id, y ? 'changed' : 'new', !y || pNewer, m => { m[key] = m[key] || {}; m[key][id] = clone(x); });
  }
  if (theirs.site && !same(theirs.site, mine.site)) add(t('Plot and garden'), t('Plot, levels, water and north'), mine.site ? 'changed' : 'new', !mine.site || pNewer, m => { m.site = clone(theirs.site); });
  return out;
}

Object.assign(app, {
  /** merge their copy into mine; true when it was done */
  async mergeDialog(mine, theirs, fromName) {
    const changes = mergeChanges(mine, theirs);
    if (!changes.length) { this.toast(t('Their copy is the same as yours: nothing to merge.')); return false; }
    const body = h('div', { class: 'merge' });
    const tags = { new: t('Only theirs'), changed: t('Different'), 'only-mine': t('Only yours') };
    const counts = { new: 0, changed: 0, 'only-mine': 0 };
    for (const c of changes) counts[c.tag]++;
    body.appendChild(h('p', { class: 'note-muted' }, t('{a} things only in their copy, {b} different, {c} only in yours. Ticked = take it from their copy (for "only yours": remove it). A save point of your copy is made first.', { a: counts.new, b: counts.changed, c: counts['only-mine'] })));
    const count = h('span', { id: 'merge-count' });
    const upd = () => { count.textContent = String(changes.filter(c => c.on).length); };
    const groups = new Map();
    for (const c of changes) { if (!groups.has(c.group)) groups.set(c.group, []); groups.get(c.group).push(c); }
    const list = h('div', { class: 'merge-list' });
    for (const [g, items] of groups) {
      const head = h('div', { class: 'merge-group' }, h('span', null, g), h('button', { class: 'linklike', onclick: () => { const all = items.every(c => c.on); for (const c of items) c.on = !all; for (const c of items) c.cb.checked = c.on; upd(); } }, t('all / none')));
      list.appendChild(head);
      for (const c of items) {
        c.cb = h('input', { type: 'checkbox', checked: c.on, 'data-merge': String(c.id) });
        c.cb.addEventListener('change', () => { c.on = c.cb.checked; upd(); });
        list.appendChild(h('label', { class: 'merge-row check' }, c.cb, h('span', { class: 'merge-lab' }, c.label), h('span', { class: 'tag merge-' + c.tag }, tags[c.tag])));
      }
    }
    body.appendChild(list);
    upd();
    const go = await UI.dialog({ title: t('Merge “{n}”', { n: fromName || theirs.name }), body, wide: true, enterKey: false, actions: [{ label: t('Cancel'), value: false }, { label: h('span', null, t('Merge'), ' (', count, ')'), value: true, kind: 'primary' }] });
    if (!go) return false;
    const merged = clone(mine);
    for (const c of changes) if (c.on) { try { c.apply(merged); } catch (e) { console.warn('merge step failed', c.label, e); } }
    merged.updated = Date.now();
    migrateProject(merged);
    await Snapshots.create(mine, 'backup', t('Before merging a copy ({d})', { d: fmtDate(Date.now()) }));
    await DB.put('projects', merged);
    this._lastMerge = { taken: changes.filter(c => c.on).length, total: changes.length };
    return true;
  },

  /** ⋯ menu: merge a copy of this house from a file */
  async mergeFileFlow() {
    const files = await pickFiles(HOUSE_ACCEPT);
    if (!files || !files.length) return;
    let data;
    try { data = await readHouseFile(files[0]); } catch (e) { this.toast(t('This file could not be read. Choose a file exported from House Planner.')); return; }
    if (!data || data.format !== 'house-planner' || !Array.isArray(data.projects)) { this.toast(t('This is not a House Planner file.')); return; }
    const entry = data.projects.find(x => x.project && this.project && x.project.id === this.project.id);
    if (!entry) { this.toast(t('This file is not a copy of this house. Use “Import a house file” instead.')); return; }
    for (const [id, a] of Object.entries(data.assets || {})) if (!(await DB.get('assets', id))) await Assets.putRecord(a.kind === 'shell' ? { id, kind: 'shell', json: a.json, created: Date.now() } : { id, dataUrl: a.dataUrl, w: a.w, h: a.h, ...(a.kind ? { kind: a.kind } : {}), created: Date.now() });
    await Saver.flushNow();
    const mine = clone(this.project);
    const ok = await this.mergeDialog(mine, migrateProject(entry.project), files[0].name);
    if (!ok) return;
    await this.openProject(mine.id);
    this.toast(t('Merged: {a} of {b} changes taken. Your copy before the merge is in Save points.', { a: this._lastMerge.taken, b: this._lastMerge.total }), { ms: 7000 });
  },
});
