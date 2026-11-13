/* ───────────── diary.js — the building diary: dated photos per room and pipes and cables pinned where they run ─────────────
   Two kinds of note on top of the others: "Diary" (what happened, with photos and a date) and "Pipes and cables"
   (photos of what runs in a wall, floor or ceiling, taken before it is closed: water, drain, electric cable, floor
   heating, data, ventilation, gas – pinned on the spot in 2D or 3D, so you know later where not to drill).
   Both carry a date (n.date, yyyy-mm-dd; today when made) and several photos (added several at a time); for pipes
   and cables also what runs there (n.runs: ['water', …]) and where (n.inside: 'wall' | 'floor' | 'ceiling').
   They are records, not tasks: made as done, so they don't count as open notes. Every room's details have a
   timeline of its diary (newest first); the whole house's diary is a timeline by day (Notes → Building diary). */

NOTE_TYPES.push(['diary', 'Diary'], ['hidden', 'Pipes and cables']);
NOTE_ICON.diary = 'camera';
NOTE_ICON.hidden = 'pipe';
NOTE_GLYPH.diary = '◉';
NOTE_GLYPH.hidden = '≈';
const DIARY_TYPES = new Set(['diary', 'hidden']);
const HIDDEN_RUNS = [['water', 'Water'], ['drain', 'Drain'], ['electric', 'Electric cable'], ['heating', 'Floor heating'], ['data', 'Data / TV'], ['vent', 'Ventilation duct'], ['gas', 'Gas'], ['other', 'Other']];
const HIDDEN_IN = [['wall', 'In the wall'], ['floor', 'In the floor'], ['ceiling', 'In the ceiling']];
const isoDay = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const noteDay = n => n.date || isoDay(n.created || Date.now());
function fmtDay(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(i18nLocale(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}
/** a note just made or turned into a diary entry: dated, and done (a record, not a task) */
function diaryInit(n) {
  if (!DIARY_TYPES.has(n.type)) { if (n.diaryDone) { delete n.diaryDone; n.status = 'open'; } return; }
  if (!n.date) n.date = isoDay(n.created || Date.now());
  if (n.status !== 'done') { n.status = 'done'; n.diaryDone = true; }
  if (n.type === 'hidden') { n.runs = n.runs || []; n.inside = n.inside || 'wall'; }
}

Object.assign(app, {
  /** the diary of one room: its diary entries and pipes / cables, newest first */
  roomDiary(r) {
    return (this.project.notes || []).filter(n => DIARY_TYPES.has(n.type) && (n.room === r.id || (n.at && n.at.storey === r.storey && pointInPolygon([n.at.x, n.at.y], r.poly))))
      .sort((a, b) => noteDay(b).localeCompare(noteDay(a)) || (b.created || 0) - (a.created || 0));
  },
  /** in a room's details: the timeline, and adding to it */
  roomDiarySection(el, r) {
    const list = this.roomDiary(r);
    const sec = h('div', { class: 'insp-sec diary-sec' }, h('div', { class: 'eyebrow' }, t('Building diary'), h('span', { class: 'num', style: { fontSize: '12px', letterSpacing: 0 } }, list.length ? String(list.length) : '')));
    if (list.length) sec.appendChild(this.diaryTimeline(list, { room: false }));
    else sec.appendChild(h('p', { class: 'note-muted' }, t('Photos with a date: what was done here, and the pipes and cables in the walls and floor before they are closed.')));
    if (!this.comparing && !this.isViewer()) sec.appendChild(h('div', { class: 'actions' },
      h('button', { class: 'btn sm', id: 'diary-add', onclick: () => this.addDiaryEntry(r) }, icon('camera'), t('Add to the diary')),
      h('button', { class: 'btn sm', id: 'diary-pipes', onclick: () => this.startPipesPin() }, icon('pipe'), t('Pipes or cables on a spot'))));
    el.appendChild(sec);
  },
  /** a diary entry for the room, with photos chosen right away */
  async addDiaryEntry(r) {
    const n = { id: uid('n_'), type: 'diary', status: 'done', diaryDone: true, text: '', created: Date.now(), updated: Date.now(), photos: [], room: r.id, storey: r.storey, at: null, date: isoDay(Date.now()), ...this.noteAuthor() };
    this.mutate(p => { p.notes.push(n); }, { project: true });
    this.selectNote(n.id, true);
  },
  /** pipes or cables: tap the spot (View mode, the Note tool with that kind) */
  startPipesPin() {
    if (this.mode !== 'view') this.setMode('view');
    this._noteType = 'hidden';
    this.setTool('note');
    this.toast(t('Tap where the pipes or cables run, in 2D or 3D; then add the photos.'));
  },
  /** several photos at once (a series of the same wall, say) */
  async addNotePhotos(id) {
    const files = await pickFiles('image/*');
    for (const file of files) {
      try {
        const img = await loadImage(await readFileAs(file, 'dataurl'));
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const cw = Math.round(img.naturalWidth * k), ch = Math.round(img.naturalHeight * k);
        const cv = makeCanvas(cw, ch), g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(img, 0, 0, cw, ch);
        const aid = await Assets.put(cv.toDataURL('image/jpeg', 0.8), cw, ch);
        this.updateNote(id, n => { n.photos.push(aid); });
      } catch (e) { console.error(e); this.toast(t('This picture could not be read.')); }
    }
  },
  /** a timeline: a day, then its entries (photos as thumbnails, tap to see) */
  diaryTimeline(list, opts = {}) {
    const box = h('div', { class: 'diary-tl' });
    let day = null;
    for (const n of list) {
      const d = noteDay(n);
      if (d !== day) { day = d; box.appendChild(h('div', { class: 'dt-day' }, fmtDay(d))); }
      const thumbs = (n.photos || []).slice(0, 6).map(aid => { const a = Assets.get(aid); return a ? h('button', { class: 'dt-th', onclick: e => { e.stopPropagation(); this.photoViewer(aid); }, 'aria-label': t('Show photo') }, h('img', { src: a.url, alt: '' })) : null; }).filter(Boolean);
      const what = n.type === 'hidden' ? [t((HIDDEN_IN.find(x => x[0] === n.inside) || HIDDEN_IN[0])[1]), ...(n.runs || []).map(k => t((HIDDEN_RUNS.find(x => x[0] === k) || ['', k])[1]))].join(' · ') : '';
      box.appendChild(h('button', { class: 'dt-entry nt-' + n.type, 'data-note': n.id, onclick: () => { if (opts.close) opts.close(); this.selectNote(n.id); } },
        h('span', { class: 'nr-ic nt-' + n.type }, icon(NOTE_ICON[n.type])),
        h('span', { class: 'dt-main' }, h('span', { class: 'dt-title' }, noteTitle(n)),
          h('span', { class: 'dt-where' }, [what, opts.room !== false ? this.noteWhere(n) : null, (n.photos || []).length ? t('{n} photos', { n: n.photos.length }) : null].filter(Boolean).join(' · ')),
          thumbs.length ? h('span', { class: 'dt-thumbs' }, ...thumbs) : null)));
    }
    return box;
  },
  /** Notes → Building diary: the whole house, by day */
  diarySheet() {
    const f = this._diaryFilter || (this._diaryFilter = { type: 'all', storey: 'all' });
    const body = h('div', { class: 'notes-body', id: 'diary-body' });
    let close = null;
    const paint = () => {
      body.textContent = '';
      body.appendChild(h('div', { class: 'nf-row' }, h('div', { class: 'seg wrap', id: 'diary-kind' }, ...[['all', t('All')], ['diary', t('Diary')], ['hidden', t('Pipes and cables')]].map(([v, lab]) => h('button', { 'data-k': v, 'aria-pressed': String(f.type === v), onclick: () => { f.type = v; paint(); } }, lab)))));
      const st = h('select', { class: 'select sm', 'aria-label': t('Storey') }, h('option', { value: 'all' }, t('All storeys')), ...sortedStoreys(this.project).map(s2 => h('option', { value: s2.id, selected: f.storey === s2.id }, s2.name)));
      st.onchange = () => { f.storey = st.value; paint(); };
      body.appendChild(h('div', { class: 'nf-row' }, st));
      const list = (this.project.notes || []).filter(n => DIARY_TYPES.has(n.type) && (f.type === 'all' || n.type === f.type) && (f.storey === 'all' || (n.at ? n.at.storey : n.storey) === f.storey))
        .sort((a, b) => noteDay(b).localeCompare(noteDay(a)) || (b.created || 0) - (a.created || 0));
      const photos = list.reduce((s2, n) => s2 + (n.photos || []).length, 0);
      body.appendChild(h('div', { class: 'note-muted' }, t('{n} entries, {p} photos', { n: list.length, p: photos })));
      if (list.length) body.appendChild(this.diaryTimeline(list, { close: () => close(null) }));
      else body.appendChild(h('p', { class: 'note-muted' }, t('Nothing in the diary yet. In a room’s details: “Add to the diary”; or “Pipes or cables on a spot” and tap where they run.')));
    };
    paint();
    UI.dialog({ title: t('Building diary'), body, onOpen: (d, c) => { close = c; }, actions: [{ label: t('Pipes or cables on a spot'), value: 'pipes', icon: 'pipe' }, { label: t('Done'), value: null, kind: 'primary' }] })
      .then(v => { if (v === 'pipes') this.startPipesPin(); });
  },
});

/* the note's details: the date, and for pipes and cables what runs where; several photos at once */
{
  const basePanel = app.notePanel, baseUpdate = app.updateNote;
  app.updateNote = function (id, fn, coalesce) { return baseUpdate.call(this, id, n => { fn(n); diaryInit(n); }, coalesce); };
  app.notePanel = function (el, n) {
    basePanel.call(this, el, n);
    if (!DIARY_TYPES.has(n.type)) return;
    const ro = this.noteLocked(n);
    // records: no Open / Done
    const first = el.querySelector('.insp-sec');
    if (first) { const act = [...first.querySelectorAll('.actions')].pop(); if (act && act.querySelector('.badge')) act.remove(); }
    const sec = h('div', { class: 'insp-sec diary-fields' });
    const date = h('input', { type: 'date', class: 'input', id: 'f-note-date', value: noteDay(n), disabled: ro });
    date.addEventListener('change', () => { if (date.value) this.updateNote(n.id, x => { x.date = date.value; }); });
    sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-note-date' }, t('Date')), date));
    if (n.type === 'hidden') {
      sec.appendChild(this.segRow(t('Where'), HIDDEN_IN, n.inside || 'wall', k => this.updateNote(n.id, x => { x.inside = k; }), ro, 'hidden-in'));
      const runs = new Set(n.runs || []);
      sec.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('What runs here')),
        h('div', { class: 'chips hidden-runs' }, ...HIDDEN_RUNS.map(([k, lab]) => h('button', { class: 'chip', 'data-k': k, disabled: ro, 'aria-pressed': String(runs.has(k)), onclick: () => this.updateNote(n.id, x => { const s2 = new Set(x.runs || []); if (s2.has(k)) s2.delete(k); else s2.add(k); x.runs = HIDDEN_RUNS.map(q => q[0]).filter(q => s2.has(q)); }) }, t(lab))))));
      sec.appendChild(h('p', { class: 'note-muted' }, t('Take the photos before the wall or floor is closed, with a tape measure in view: later you know where not to drill.')));
    }
    first ? first.after(sec) : el.appendChild(sec);
    // photos: several at a time
    const add = [...el.querySelectorAll('.insp-sec .actions button')].find(b => b.textContent.includes(t('Add photo')));
    if (add && !ro) add.replaceWith(h('button', { class: 'btn sm', id: 'f-note-photos', onclick: () => this.addNotePhotos(n.id) }, icon('camera'), t('Add photos')));
  };
  const baseRoomNotes = app.roomNotesSection;
  app.roomNotesSection = function (el, r) { this.roomDiarySection(el, r); return baseRoomNotes.call(this, el, r); };
}
