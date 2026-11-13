/* ───────────── history.js — the undo history with names (U5) ─────────────
   The History button next to Undo / Redo (and Ctrl+H) lists the steps of this session, newest first: when, and what
   changed ("Wall changed · Begane grond", "Door added", "3 walls moved", "Note added", "Kitchen changed", "New version
   …"). Tap a step to go back to just before it – several steps at once, the house is put back once; the steps you
   went back over stay in the list (greyed, above "Now") to go forward to again, until you change something new.
   The names are worked out when the list opens, by comparing each saved state of the house with the next one
   (versions, walls, doors and windows, rooms, sockets and other points, stairs, holes in floors, the garden, the
   furniture and kitchen per layout, notes, storeys, the budget and the task board). */

const HIST_KINDS = [
  ['walls', 'Wall', 'walls'], ['openings', null, 'doors and windows'], ['rooms', 'Room', 'rooms'], ['points', 'Socket, switch or point', 'sockets, switches and points'],
  ['stairs', 'Stair', 'stairs'], ['voids', 'Opening in the floor', 'openings in the floor'],
];
const _histNames = new WeakMap();

/** what changed from house a to house b (both plain objects), in a few words */
function histDescribe(a, b) {
  const out = [];
  const stName = (p, sid) => ((p.storeys || []).find(s => s.id === sid) || {}).name || '';
  const byId = list => new Map((list || []).map(x => [x.id, x]));
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  // versions
  const va = byId(a.versions), vb = byId(b.versions);
  for (const [id, v] of vb) if (!va.has(id)) out.push(t('New version “{n}”', { n: v.name }));
  for (const [id, v] of va) if (!vb.has(id)) out.push(t('Version “{n}” deleted', { n: v.name }));
  for (const [id, v1] of vb) {
    const v0 = va.get(id);
    if (!v0) continue;
    if (v0.name !== v1.name) out.push(t('Version renamed: “{n}”', { n: v1.name }));
    if ((v0.status || '') !== (v1.status || '')) out.push(t('Version “{n}”: {s}', { n: v1.name, s: v1.status || 'active' }));
    const P0 = v0.plan || {}, P1 = v1.plan || {};
    for (const [key, one, many] of HIST_KINDS) {
      const m0 = byId(P0[key]), m1 = byId(P1[key]);
      let add = 0, del = 0, chg = 0, last = null;
      const where = new Set();
      const sidOf = x => x.storey || ((P1.walls || []).concat(P0.walls || []).find(w => w.id === x.wall) || {}).storey;
      for (const [k, x] of m1) { const y = m0.get(k); if (!y) { add++; last = x; where.add(sidOf(x)); } else if (!same(x, y)) { chg++; last = x; where.add(sidOf(x)); } }
      for (const [k, y] of m0) if (!m1.has(k)) { del++; last = y; where.add(sidOf(y)); }
      if (!add && !del && !chg) continue;
      let what;
      if (key === 'openings') what = last && last.kind === 'window' ? t('Window') : last && last.kind === 'door' ? t('Door') : t('Opening');
      else if (key === 'rooms' && last && add + del + chg === 1) what = t('Room “{n}”', { n: last.name });
      else what = t(one);
      const n = add + del + chg, plural = n > 1;
      const verb = add && !del && !chg ? 'added' : del && !add && !chg ? 'removed' : 'changed';
      let s = plural ? t('{n} {what} ' + verb, { n, what: t(many) }) : t('{what} ' + verb, { what });
      const st = where.size === 1 ? stName(b, [...where][0]) || stName(a, [...where][0]) : '';
      if (st) s += ' · ' + st;
      out.push(s);
    }
    if (!same(P0.garden || null, P1.garden || null)) out.push(t('Garden changed'));
    if (out.length > 3) break;
  }
  // furniture and kitchens (per layout)
  const la = byId(a.furniture && a.furniture.layouts), lb = byId(b.furniture && b.furniture.layouts);
  for (const [id, L1] of lb) {
    const L0 = la.get(id);
    if (!L0) { out.push(t('New furniture layout “{n}”', { n: L1.name })); continue; }
    const i0 = byId(L0.items), i1 = byId(L1.items);
    let n = 0, kit = false;
    for (const [k, x] of i1) { const y = i0.get(k); if (!y || !same(x, y)) { n++; if (/^k/.test(x.type || '')) kit = true; } }
    for (const [k, y] of i0) if (!i1.has(k)) { n++; if (/^k/.test(y.type || '')) kit = true; }
    if (n) out.push(kit ? t('Kitchen changed') : n > 1 ? t('{n} pieces of furniture changed', { n }) : t('Furniture changed'));
  }
  // notes
  const na = byId(a.notes), nb = byId(b.notes);
  let nAdd = 0, nChg = 0, nDel = 0;
  for (const [k, x] of nb) { const y = na.get(k); if (!y) nAdd++; else if (!same(x, y)) nChg++; }
  for (const k of na.keys()) if (!nb.has(k)) nDel++;
  if (nAdd) out.push(nAdd > 1 ? t('{n} notes added', { n: nAdd }) : t('Note added'));
  if (nChg) out.push(nChg > 1 ? t('{n} notes changed', { n: nChg }) : t('Note changed'));
  if (nDel) out.push(nDel > 1 ? t('{n} notes deleted', { n: nDel }) : t('Note deleted'));
  // storeys and the rest of the house
  if (!same(a.storeys, b.storeys)) out.push(t('Storeys changed'));
  if (!same(a.budget || null, b.budget || null)) out.push(t('Budget changed'));
  if (!same(a.tasks || null, b.tasks || null)) out.push(t('Task board changed'));
  if (a.name !== b.name) out.push(t('House renamed: “{n}”', { n: b.name }));
  if (!out.length) out.push(t('Other change'));
  return out.slice(0, 3).join(' · ') + (out.length > 3 ? ' …' : '');
}

Object.assign(app, {
  /** the History button next to Undo and Redo */
  historyButton() {
    return h('button', { class: 'tool compact', id: 'btn-history', title: t('Undo history (Ctrl+H)'), 'aria-label': t('Undo history'), disabled: !this.undoStack.length && !this.redoStack.length, onclick: () => this.historySheet() },
      icon('history'), h('span', { class: 'tl' }, t('History')));
  },
  /** the name of a step (from the state before it to the state after it), worked out once */
  historyName(entry, afterS) {
    if (_histNames.has(entry)) return _histNames.get(entry);
    let name;
    try { name = histDescribe(JSON.parse(entry.s), JSON.parse(afterS)); } catch (e) { name = t('Change'); }
    _histNames.set(entry, name);
    return name;
  },
  /** the list: steps forward (undone) above "Now", steps back below it */
  historySheet() {
    const body = h('div', { class: 'hist-body', id: 'hist-body' });
    let close = null;
    const paint = () => {
      body.textContent = '';
      const U = this.undoStack, R = this.redoStack;
      if (!U.length && !R.length) { body.appendChild(h('p', { class: 'note-muted' }, t('Nothing changed yet in this session.'))); return; }
      const now = JSON.stringify(this.project);
      const list = h('div', { class: 'hist-list' });
      // forward: R[0] is the furthest, R[R.length - 1] the next step
      for (let j = 0; j < R.length; j++) {
        const before = j === R.length - 1 ? now : R[j + 1].s;
        const steps = R.length - j;
        list.appendChild(h('button', { class: 'hist-row fwd', 'data-n': -steps, onclick: () => { close && close(null); this.historyJump(-steps); } },
          h('span', { class: 'hist-t' }, histClock(R[j].t)), h('span', { class: 'hist-d' }, this.historyName({ s: before, t: R[j].t, _k: R[j] }, R[j].s)), h('span', { class: 'hist-go' }, t('Redo to here'))));
      }
      list.appendChild(h('div', { class: 'hist-now', id: 'hist-now' }, t('Now')));
      for (let i = U.length - 1; i >= 0; i--) {
        const after = i === U.length - 1 ? now : U[i + 1].s;
        const steps = U.length - i;
        list.appendChild(h('button', { class: 'hist-row', 'data-n': steps, onclick: () => { close && close(null); this.historyJump(steps); } },
          h('span', { class: 'hist-t' }, histClock(U[i].t)), h('span', { class: 'hist-d' }, this.historyName(U[i], after)), h('span', { class: 'hist-go' }, steps === 1 ? t('Undo this') : t('Back to before this ({n} steps)', { n: steps }))));
      }
      body.appendChild(list);
      body.appendChild(h('p', { class: 'note-muted' }, t('This session only; the house is saved as it is after each change. Save points (top bar) keep a state for later.')));
    };
    paint();
    UI.dialog({ title: t('Undo history'), body, onOpen: (d, c) => { close = c; }, actions: [{ label: t('Close'), value: null }] });
  },
});

/** 14:32 (today) or 30 Oct 14:32 */
function histClock(ts) {
  const d = new Date(ts), now = new Date();
  const hm = d.toLocaleTimeString(i18nLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return d.toDateString() === now.toDateString() ? hm : d.toLocaleDateString(i18nLocale(), { day: 'numeric', month: 'short' }) + ' ' + hm;
}
