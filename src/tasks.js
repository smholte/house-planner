/* ───────────── tasks.js — the task board: the phases of the work schedule × the rooms, who does what, ticked off
   per room; the plan can colour each room by how far it is ─────────────

   project.tasks = { phases: [{ id, name, steps: [{ id, name, who }] }],
                     cells: { 'roomId|stepId': { s: 'todo' | 'doing' | 'done' | 'skip', who, date, note } } }
   The phases start as the work schedule of this house (Phase 1 wall preparation … Phase 5 final finishing). */

const TASK_DEFAULT = [
  ['Wall preparation', ['Cleaning: brush and vacuum', 'Filling and sanding', 'Priming (voorstrijk)']],
  ['Installation and sealing', ['Renovlies on the walls', 'Acrylic sealant (no silicone)']],
  ['Priming and ceilings', ['Wall primer (Sigma Wallprimer Plus)', 'Ceiling paint (matt)']],
  ['Final coats (Graco GX 21)', ['First topcoat (Sigma Pearl Clean Matt)', 'Inspection and light sanding', 'Second topcoat']],
  ['Final finishing', ['Covers back on: switches, sockets, valves', 'Clean the house']],
];
const TASK_STATES = [['todo', 'To do'], ['doing', 'Busy'], ['done', 'Done'], ['skip', 'Not here']];
const TASK_NEXT = { todo: 'doing', doing: 'done', done: 'todo', skip: 'todo' };

function defaultPhases() {
  return TASK_DEFAULT.map(([name, steps], i) => ({ id: 'ph' + (i + 1), name, steps: steps.map((s, j) => ({ id: `ph${i + 1}s${j + 1}`, name: s, who: '' })) }));
}
function tasksOf(p) {
  const T = p.tasks || {};
  return { phases: T.phases && T.phases.length ? T.phases : defaultPhases(), cells: T.cells || {} };
}
const cellOf = (T, rid, sid) => T.cells[rid + '|' + sid] || null;
const cellState = c => (c && c.s) || 'todo';
/** the rooms on the board: the rooms of the version, without the ones left out of the quantities */
function taskRooms(p, plan) {
  const out = [];
  for (const st of sortedStoreys(p)) for (const r of plan.rooms) if (r.storey === st.id && roomCounted(r)) out.push({ r, st });
  return out;
}
/** how far a room is (0–1; null: nothing to do there) */
function roomProgress(T, rid, phases) {
  let n = 0, done = 0;
  for (const ph of phases || T.phases) for (const s of ph.steps) {
    const st = cellState(cellOf(T, rid, s.id));
    if (st === 'skip') continue;
    n++; if (st === 'done') done++; else if (st === 'doing') done += 0.5;
  }
  return n ? done / n : null;
}
function boardProgress(p, plan) {
  const T = tasksOf(p), rooms = taskRooms(p, plan);
  const phase = T.phases.map(ph => { let n = 0, d = 0; for (const { r } of rooms) for (const s of ph.steps) { const st = cellState(cellOf(T, r.id, s.id)); if (st === 'skip') continue; n++; if (st === 'done') d++; else if (st === 'doing') d += 0.5; } return { ph, n, done: d, pct: n ? d / n : 0 }; });
  const n = phase.reduce((a, x) => a + x.n, 0), d = phase.reduce((a, x) => a + x.done, 0);
  return { T, rooms, phase, pct: n ? d / n : 0 };
}
/** a colour from light (nothing done) to green (all done) */
function progressColor(f) {
  const a = [0xEE, 0xE6, 0xD8], b = [0x8F, 0xC9, 0x9B];
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * clamp(f, 0, 1)).toString(16).padStart(2, '0')).join('');
}

Object.assign(app, {
  async tasksSheet() {
    const p = this.project;
    let close = null;
    const body = h('div', { class: 'tb-body' });
    const plan = () => this.shownVersion().plan;
    const setTasks = fn => this.isViewer() ? this.toast(t('This is a viewer copy: the task board can only be looked at.')) : this.mutate(pr => { const T = tasksOf(pr); pr.tasks = { phases: clone(T.phases), cells: { ...T.cells } }; fn(pr.tasks); }, { project: true, keepInspector: true });
    const paint = () => {
      const P = boardProgress(p, plan());
      const T = P.T;
      let cur = this._tbPhase;
      if (cur !== 'all' && !T.phases.some(ph => ph.id === cur)) cur = (P.phase.find(x => x.pct < 1) || P.phase[0] || {}).ph?.id || 'all';
      const mode = this._tbMode || 'tick';
      body.textContent = '';
      body.appendChild(h('div', { class: 'tb-top' },
        h('div', { class: 'tb-total' }, h('strong', { class: 'num', id: 'tb-pct' }, Math.round(P.pct * 100) + ' %'), h('span', null, t('of the work done'))),
        h('div', { class: 'bud-bar tb-bar' }, h('i', { class: 'pd', style: { width: (P.pct * 100) + '%' } }))));
      if (window.matchMedia('(max-width: 600px)').matches) {
        // phones: the phases in a list
        const sel = h('select', { class: 'select', id: 'tb-phase-pick', 'aria-label': t('Phase') }, h('option', { value: 'all', selected: cur === 'all' }, t('All phases')), ...P.phase.map((x, i) => h('option', { value: x.ph.id, selected: cur === x.ph.id }, `${i + 1}. ${x.ph.name} · ${Math.round(x.pct * 100)}%`)));
        sel.addEventListener('change', () => { this._tbPhase = sel.value; paint(); });
        body.appendChild(sel);
      } else body.appendChild(h('div', { class: 'seg wrap tb-phases' },
        h('button', { 'aria-pressed': String(cur === 'all'), 'data-ph': 'all', onclick: () => { this._tbPhase = 'all'; paint(); } }, t('All phases')),
        ...P.phase.map((x, i) => h('button', { 'aria-pressed': String(cur === x.ph.id), 'data-ph': x.ph.id, title: x.ph.name, onclick: () => { this._tbPhase = x.ph.id; paint(); } }, `${i + 1}. ${x.ph.name}`, h('small', { class: 'num' }, ' ' + Math.round(x.pct * 100) + '%')))));
      body.appendChild(h('div', { class: 'tb-tools' },
        h('div', { class: 'seg', id: 'tb-mode' }, ...[['tick', t('Tick off')], ['details', t('Details')]].map(([k, lab]) => h('button', { 'aria-pressed': String(mode === k), 'data-k': k, onclick: () => { this._tbMode = k; paint(); } }, lab))),
        h('span', { class: 'note-muted' }, mode === 'tick' ? t('Tap a box: to do → busy → done.') : t('Tap a box for who, when and a note, or “not here”.'))));
      if (!P.rooms.length) { body.appendChild(h('p', { class: 'note-muted' }, t('No rooms yet: the board has a row for every room.'))); return; }
      const phases = cur === 'all' ? T.phases : T.phases.filter(ph => ph.id === cur);
      const cols = cur === 'all' ? phases.map(ph => ({ ph })) : phases[0].steps.map(s => ({ s, ph: phases[0] }));
      const tbl = h('table', { class: 'tb-table' });
      const head = h('tr', null, h('th', { class: 'tb-room' }, t('Room')));
      cols.forEach((c, i) => head.appendChild(h('th', { class: 'tb-col' }, c.s ? h('button', { class: 'tb-step', 'data-step': c.s.id, title: t('Who does this step?'), onclick: async () => {
        const v = await UI.prompt({ title: c.s.name, label: t('Who does this (everywhere)?'), value: c.s.who || '', placeholder: t('e.g. Alex, the painter, the builder') });
        if (v == null) return;
        setTasks(TT => { const s = TT.phases.find(x => x.id === c.ph.id).steps.find(x => x.id === c.s.id); s.who = v.trim(); }); paint();
      } }, h('span', { class: 'tb-step-name' }, c.s.name), h('span', { class: 'tb-who' }, c.s.who || t('who?'))) : h('button', { class: 'tb-step', onclick: () => { this._tbPhase = c.ph.id; paint(); } }, h('span', { class: 'tb-step-name' }, `${T.phases.indexOf(c.ph) + 1}. ${c.ph.name}`)))));
      head.appendChild(h('th', { class: 'tb-pct' }, '%'));
      tbl.appendChild(h('thead', null, head));
      const tb = h('tbody');
      let last = null;
      for (const { r, st } of P.rooms) {
        if (st !== last) { last = st; tb.appendChild(h('tr', { class: 'grp' }, h('td', { colspan: cols.length + 2 }, st.name))); }
        const tr = h('tr', { 'data-room': r.id }, h('th', { class: 'tb-room' }, r.name));
        for (const c of cols) {
          if (!c.s) {
            const f = roomProgress(T, r.id, [c.ph]);
            tr.appendChild(h('td', { class: 'tb-cell sum' }, f == null ? '—' : h('span', { class: 'tb-mini' }, h('i', { style: { width: (f * 100) + '%', background: progressColor(f) } }), h('b', { class: 'num' }, Math.round(f * 100) + '%'))));
            continue;
          }
          const cell = cellOf(T, r.id, c.s.id), s = cellState(cell);
          const who = (cell && cell.who) || '';
          tr.appendChild(h('td', { class: 'tb-cell' }, h('button', { class: 'tb-box st-' + s, 'data-cell': r.id + '|' + c.s.id, 'aria-label': `${r.name}: ${c.s.name}: ${t((TASK_STATES.find(x => x[0] === s) || [])[1])}`, title: [t((TASK_STATES.find(x => x[0] === s) || [])[1]), who || c.s.who, cell && cell.date, cell && cell.note].filter(Boolean).join(' · '),
            onclick: async () => {
              if ((this._tbMode || 'tick') === 'tick') { setTasks(TT => { const k = r.id + '|' + c.s.id; const o = TT.cells[k] || {}; const ns = TASK_NEXT[cellState(o)]; TT.cells[k] = { ...o, s: ns, ...(ns === 'done' ? { date: o.date || todayStamp() } : {}) }; }); paint(); return; }
              await this.taskCellDialog(r, c.s, cell, setTasks); paint();
            } }, s === 'done' ? icon('check') : s === 'skip' ? '–' : s === 'doing' ? h('span', { class: 'half' }) : null, who ? h('span', { class: 'tb-initials' }, who.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase()) : null)));
        }
        const f = roomProgress(T, r.id, phases);
        tr.appendChild(h('td', { class: 'tb-pct num' }, f == null ? '—' : Math.round(f * 100) + '%'));
        tb.appendChild(tr);
      }
      tbl.appendChild(tb);
      body.appendChild(h('div', { class: 'tb-scroll' }, tbl));
      if (cur !== 'all' && phases[0]) {
        const allDone = P.rooms.every(({ r }) => phases[0].steps.every(s => ['done', 'skip'].includes(cellState(cellOf(T, r.id, s.id)))));
        body.appendChild(h('div', { class: 'actions' },
          h('button', { class: 'btn sm', id: 'tb-all-done', disabled: allDone, onclick: () => { setTasks(TT => { for (const { r } of P.rooms) for (const s of phases[0].steps) { const k = r.id + '|' + s.id; const o = TT.cells[k] || {}; if (cellState(o) !== 'skip') TT.cells[k] = { ...o, s: 'done', date: o.date || todayStamp() }; } }); paint(); } }, icon('check'), t('Whole phase done'))));
      }
    };
    paint();
    const v = await UI.dialog({ title: t('Task board'), body, wide: true, enterKey: false, onOpen: (d, c) => {
      close = c;
      d.classList.add('tb-dialog');
      d.querySelector('.dlg-foot').prepend(h('button', { class: 'btn', id: 'tb-edit', onclick: () => this.taskPhasesDialog().then(paint) }, icon('edit'), t('Phases and steps')));
    }, actions: [
      { label: t('Show on the plan'), value: 'plan', icon: 'eye' },
      { label: t('Spreadsheet (.csv)'), value: 'csv', icon: 'download' },
    ] });
    void close;
    if (v === 'csv') this.tasksCsv();
    if (v === 'plan') { Settings.set('colorBy', 'progress'); if (this.view.dim !== '2d') this.setDim('2d'); this.refreshViews(false); this.toast(t('The rooms are coloured by how far they are. Change it in View options (eye).')); }
  },

  async taskCellDialog(r, step, cell, setTasks) {
    const c = { s: 'todo', who: '', date: '', note: '', ...(cell || {}) };
    const st = h('div', { class: 'seg wrap', id: 'tc-state' }, ...TASK_STATES.map(([k, lab]) => h('button', { 'aria-pressed': String(c.s === k), 'data-k': k, onclick: () => { c.s = k; for (const b of st.children) b.setAttribute('aria-pressed', String(b.dataset.k === k)); } }, t(lab))));
    const who = h('input', { class: 'input', id: 'tc-who', value: c.who || '', placeholder: step.who || t('e.g. Alex'), autocomplete: 'off' });
    const date = h('input', { class: 'input', id: 'tc-date', type: 'date', value: c.date || '' });
    const note = h('textarea', { class: 'textarea', id: 'tc-note', placeholder: t('What is left, what to buy …') }); note.value = c.note || '';
    const body = h('div', { class: 'bud-edit' },
      h('p', { class: 'note-muted' }, step.name),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Status')), st),
      h('div', { class: 'field-row' }, h('div', { class: 'field' }, h('label', { for: 'tc-who' }, t('Who')), who), h('div', { class: 'field' }, h('label', { for: 'tc-date' }, t('Date')), date)),
      h('div', { class: 'field' }, h('label', { for: 'tc-note' }, t('Note')), note));
    const ok = await UI.dialog({ title: r.name, body, actions: [{ label: t('Cancel'), value: null }, { label: t('Save'), value: true, kind: 'primary' }] });
    if (!ok) return;
    setTasks(TT => { TT.cells[r.id + '|' + step.id] = { s: c.s, who: who.value.trim(), date: date.value, note: note.value }; });
  },

  /** rename, add and remove phases and steps */
  async taskPhasesDialog() {
    const p = this.project;
    const ph = clone(tasksOf(p).phases);
    const body = h('div', { class: 'tp-body' });
    const paint = () => {
      body.textContent = '';
      ph.forEach((x, i) => {
        const name = h('input', { class: 'input tp-phase', value: x.name, 'aria-label': t('Phase {n}', { n: i + 1 }) });
        name.addEventListener('input', () => { x.name = name.value; });
        const box = h('div', { class: 'tp-phase-box' }, h('div', { class: 'tp-row' }, h('strong', { class: 'num' }, (i + 1) + '.'), name,
          h('button', { class: 'btn ghost icon sm', 'aria-label': t('Remove phase'), onclick: () => { ph.splice(i, 1); paint(); } }, icon('trash'))));
        x.steps.forEach((s, j) => {
          const si = h('input', { class: 'input sm', value: s.name, 'aria-label': t('Step') });
          si.addEventListener('input', () => { s.name = si.value; });
          box.appendChild(h('div', { class: 'tp-row step' }, h('span'), si, h('button', { class: 'btn ghost icon sm', 'aria-label': t('Remove step'), onclick: () => { x.steps.splice(j, 1); paint(); } }, icon('close'))));
        });
        box.appendChild(h('div', { class: 'tp-row step' }, h('span'), h('button', { class: 'btn sm ghost tp-add-step', onclick: () => { x.steps.push({ id: uid('st_'), name: t('New step'), who: '' }); paint(); } }, icon('plus'), t('Step'))));
        body.appendChild(box);
      });
      body.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'btn sm', id: 'tp-add-phase', onclick: () => { ph.push({ id: uid('ph_'), name: t('New phase, e.g. Kitchen'), steps: [{ id: uid('st_'), name: t('New step'), who: '' }] }); paint(); } }, icon('plus'), t('Phase')),
        h('button', { class: 'btn sm ghost', onclick: () => { ph.splice(0, ph.length, ...defaultPhases()); paint(); } }, icon('restore'), t('Back to the work schedule'))));
    };
    paint();
    const ok = await UI.dialog({ title: t('Phases and steps'), body, wide: true, enterKey: false, actions: [{ label: t('Cancel'), value: null }, { label: t('Save'), value: true, kind: 'primary' }] });
    if (!ok) return;
    this.mutate(pr => { const T = tasksOf(pr); pr.tasks = { phases: ph.filter(x => x.steps.length || x.name.trim()), cells: { ...T.cells } }; }, { project: true, keepInspector: true });
  },

  tasksCsv() {
    const p = this.project, P = boardProgress(p, this.shownVersion().plan), T = P.T;
    const q = x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
    const rows = [[t('Storey'), t('Room'), t('Phase'), t('Step'), t('Status'), t('Who'), t('Date'), t('Note')].map(q).join(';')];
    for (const { r, st } of P.rooms) for (const ph of T.phases) for (const s of ph.steps) {
      const c = cellOf(T, r.id, s.id), k = cellState(c);
      rows.push([st.name, r.name, ph.name, s.name, t((TASK_STATES.find(x => x[0] === k) || [])[1]), (c && c.who) || s.who || '', (c && c.date) || '', ((c && c.note) || '').replace(/\s*\n\s*/g, ' / ')].map(q).join(';'));
    }
    this.downloadBlob(`${slugify(p.name)}_${t('tasks')}_${todayStamp()}.csv`, new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv' }));
  },

  /** a room's details: its tasks in short */
  roomTasksSection(el, r) {
    const p = this.project, T = tasksOf(p);
    if (!p.tasks || !roomCounted(r)) return;
    const f = roomProgress(T, r.id);
    if (f == null) return;
    const next = [];
    for (const ph of T.phases) for (const s of ph.steps) { const k = cellState(cellOf(T, r.id, s.id)); if (k === 'todo' || k === 'doing') next.push(s.name + (k === 'doing' ? ' (' + t('busy') + ')' : '')); }
    el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Tasks'), h('button', { class: 'btn ghost sm', onclick: () => this.tasksSheet() }, icon('board'), t('Task board'))),
      h('div', { class: 'tb-mini wide' }, h('i', { style: { width: (f * 100) + '%', background: progressColor(f) } }), h('b', { class: 'num' }, Math.round(f * 100) + '%')),
      next.length ? h('p', { class: 'note-muted' }, t('Next: {s}', { s: next.slice(0, 2).join(', ') + (next.length > 2 ? ' …' : '') })) : h('p', { class: 'note-muted' }, t('Everything done here.'))));
  },
});
