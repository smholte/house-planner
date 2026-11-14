/* ───────────── search.js — one box to find anything (U1) ─────────────
   The magnifier in the top bar, Ctrl+K or "/" opens it. Type a few letters: rooms (on every storey, with their area),
   storeys, versions, furniture layouts, notes (also handover points and the building diary), and what the app can do
   ("photo render", "wall views", "budget", "AR", "speed check", "export" …, also by Dutch or English words and a few
   other names). ↑ ↓ and Enter, or tap. A room opens on its storey with its details; a note shows where it is; an
   action runs. Accents and capitals don't matter; every word you type must appear. */

const SEARCH_MAX = 40;
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

Object.assign(app, {
  /** what can be found, made fresh each time the box opens */
  searchIndex() {
    const p = this.project, out = [];
    if (!p) return out;
    const shown = this.shownVersion(), plan = shown.plan;
    const add = (kind, ic, label, sub, fn, words = '') => out.push({ kind, ic, label, sub, fn, key: norm([label, sub, words].join(' ')) });
    for (const st of sortedStoreys(p)) {
      add('storey', 'layers', st.name, t('Storey'), () => { this.setScope('storey', st.id); }, 'verdieping etage floor storey');
      for (const r of plan.rooms.filter(r => r.storey === st.id)) {
        add('room', 'room', r.name, `${st.name} · ${fmtArea(roomArea(r))}`, () => {
          if (this.view.scope !== 'storey' || this.view.storeyId !== st.id) this.setScope('storey', st.id);
          this.select({ type: 'room', id: r.id, storey: st.id });
          if (window.matchMedia('(max-width: 860px)').matches) this.toggleInspector(true);
        }, 'kamer room ' + (r.items || []).map(x => x.text || x).join(' '));
      }
    }
    for (const v of p.versions) if (v.status !== 'disabled' || this.settings.showDisabled) add('version', 'copy', v.name, t('Version'), () => this.setActiveVersion(v.id), 'versie version');
    for (const L of this.layouts ? this.layouts() : []) add('layout', 'sofa', L.name, t('Furniture layout'), () => { if (this.setActiveLayout) this.setActiveLayout(L.id); if (this.mode !== 'furnish') this.setMode('furnish'); }, 'indeling layout meubels');
    for (const d of p.docs || []) if (this.docViewer) add('doc', d.type === 'pdf' ? 'doc' : 'image', d.name, t('Document') + ' · ' + docMeta(d), () => this.docViewer(d.id), 'document pdf ' + (d.file || ''));
    for (const n of p.notes || []) {
      const where = this.noteWhere ? this.noteWhere(n) : '';
      add('note', NOTE_ICON[n.type] || 'note', noteTitle(n), [noteTypeLabel(n.type), where].filter(Boolean).join(' · '), () => this.selectNote(n.id, true), (n.text || '') + ' notitie note');
    }
    // what the app can do
    const act = (label, ic, fn, words) => { if (fn) add('action', ic, t(label), t('Action'), fn, label + ' ' + (words || '')); };
    const has = name => typeof this[name] === 'function';
    const sel = this.selection, selRoom = sel && sel.type === 'room' ? plan.rooms.find(r => r.id === sel.id) : null;
    act('Photo render of this view', 'camera', has('renderSheet') && (() => this.renderSheet()), 'render foto photo realistic picture afbeelding');
    act(this.isFullscreen && this.isFullscreen() ? 'Leave full screen' : 'Full screen', 'fullscreen', has('toggleFullscreen') && this.fullscreenSupported() && (() => this.toggleFullscreen()), 'fullscreen volledig scherm beeldvullend f11 groot');
    act('AR: the plan in the real room', 'cube', has('arStart') && (() => this.arStart()), 'augmented reality camera telefoon phone');
    act('Walk through the house', 'walk', has('startWalk') && (() => { if (this.mode !== 'view') this.setMode('view'); this.startWalk(); }), 'lopen walk rondlopen');
    act('Building diary', 'camera', has('diarySheet') && (() => this.diarySheet()), 'bouwdagboek diary photos foto pipes leidingen');
    act('All notes', 'note', has('notesSheet') && (() => this.notesSheet()), 'notities notes');
    act('Handover list (opleverpunten)', 'snag', has('handoverSheet') && (() => this.handoverSheet()), 'oplevering snag handover');
    act('Task board', 'board', has('tasksSheet') && (() => this.tasksSheet()), 'taken planning tasks schedule');
    act('Documents (PDFs and pictures)', 'doc', has('documentsSheet') && (() => this.documentsSheet()), 'documenten documents pdf tekening drawing offerte quote meerwerk foto picture');
    act('Budget…', 'euro', has('budgetSheet') && (() => this.budgetSheet()), 'budget kosten costs money geld');
    act('Quantities and materials…', 'table', has('quantitiesSheet') && (() => this.quantitiesSheet()), 'hoeveelheden materialen verf paint tiles tegels m2');
    act('Plans as PDF, to scale…', 'print', has('plansPdfSheet') && (() => this.plansPdfSheet()), 'pdf print afdrukken schaal scale');
    act('Drawings: façades and sections…', 'ruler', has('drawingsSheet') && (() => this.drawingsSheet()), 'gevels doorsnede facade section');
    act('Save a picture of this view', 'camera', has('savePicture') && (() => this.savePicture()), 'screenshot png afbeelding');
    act('Colour library…', 'eye', has('colourPicker') && (() => this.colourPicker()), 'kleur ral colour color verf');
    act('Versions…', 'layers', has('versionsSheet') && (() => this.versionsSheet()), 'versies versions');
    act('Make a save point', 'save', has('savePointDialog') && (() => this.savePointDialog()), 'opslaan save backup');
    act('Save points and autosaves…', 'history', has('savePointsSheet') && (() => this.savePointsSheet()), 'herstellen restore');
    act('Undo history', 'history', has('historySheet') && (() => this.historySheet()), 'ongedaan undo terug geschiedenis');
    act('Send feedback…', 'edit', has('feedbackDialog') && (() => this.feedbackDialog()), 'feedback problem idea bug probleem melding tilbakemelding');
    act('Export this house…', 'share', has('exportDialog') && (() => this.exportDialog()), 'export delen share bestand file');
    act('Automatic backup into a folder…', 'folder', this.folderSupported() && (() => this.folderDialog()), 'backup reservekopie kopie map folder proton onedrive automatisch bestand file');
    act('Save a copy of this house now', 'download', this.project && !this.project.viewer && (() => this.quickBackup(this.project)), 'backup reservekopie kopie copy opslaan save bestand file proton');
    act('Export for viewing (family, suppliers)…', 'eye', has('viewerExportDialog') && (() => this.viewerExportDialog()), 'viewer bekijken familie');
    act('Merge a copy of this house…', 'split', has('mergeFileFlow') && (() => this.mergeFileFlow()), 'samenvoegen merge');
    act('Storeys…', 'layers', has('storeysSheet') && (() => this.storeysSheet()), 'verdiepingen');
    act('Settings', 'settings', has('settingsSheet') && (() => { this.settingsSheet(); }), 'instellingen taal language theme donker dark');
    act('Speed check on this device', 'gauge', has('speedCheck') && (() => this.speedCheck()), 'snelheid speed fps performance traag slow');
    act('Help: what each button does', 'question', has('helpOverlay') && (() => this.helpOverlay()), 'help uitleg buttons knoppen keys toetsen');
    act('Ceiling things on / off (lights, smoke alarms)', 'ceiling', () => { const on = !ceilShown(this.settings); Settings.set('ceilItems', on); this.refreshViews(false); this.toast(on ? t('Ceiling things shown') : t('Ceiling things hidden')); }, 'plafond lampen lamp rookmelder rookmelders smoke ceiling lights tak ventiel');
    act('View options', 'eye', () => { const b = $('#btn-viewopts'); if (b) b.click(); }, 'weergave view menu laagjes');
    act('Shopping list', 'cart', has('shoppingSheet') && (() => { if (this.mode !== 'furnish') this.setMode('furnish'); this.shoppingSheet(); }), 'boodschappen shopping kopen');
    act('Add furniture', 'catalog', has('catalogSheet') && (() => { if (this.mode !== 'furnish') this.setMode('furnish'); this.catalogSheet(); }), 'meubel toevoegen furniture catalogue');
    if (selRoom) act('Wall views (tiles, sockets, kitchen)', 'ruler', has('wallViewsSheet') && (() => this.wallViewsSheet(selRoom)), 'wandaanzicht tegels tiles sockets stopcontacten ' + selRoom.name);
    for (const [m, lab, w] of [['build', 'Build', 'bouwen walls muren'], ['furnish', 'Furnish', 'inrichten meubels'], ['view', 'View', 'bekijken kijken']]) act(lab, { build: 'home', furnish: 'sofa', view: 'eye' }[m], () => this.setMode(m), w + ' mode');
    return out;
  },
  /** the search box */
  searchOpen() {
    if (!this.project) return;
    const index = this.searchIndex();
    const input = h('input', { type: 'search', class: 'input', id: 'search-q', placeholder: t('Rooms, notes, versions, actions…'), autocomplete: 'off', 'aria-label': t('Search') });
    const list = h('div', { class: 'search-list', id: 'search-list', role: 'listbox' });
    const body = h('div', { class: 'search-body' }, input, list);
    let hits = [], cur = 0, close = null;
    const kindName = { room: t('Room'), storey: t('Storey'), version: t('Version'), layout: t('Layout'), note: t('Note'), action: t('Action'), doc: t('Document') };
    const order = { room: 0, action: 1, note: 2, storey: 3, version: 4, layout: 5 };
    const paint = () => {
      const words = norm(input.value).split(/\s+/).filter(Boolean);
      hits = !words.length ? index.filter(x => x.kind === 'action').slice(0, 12)
        : index.filter(x => words.every(w => x.key.includes(w)))
          .map(x => ({ x, s: (norm(x.label).startsWith(words[0]) ? 0 : norm(x.label).includes(words[0]) ? 1 : 2) * 10 + order[x.kind] }))
          .sort((a, b) => a.s - b.s).slice(0, SEARCH_MAX).map(o => o.x);
      cur = Math.min(cur, Math.max(0, hits.length - 1));
      list.textContent = '';
      if (!hits.length) { list.appendChild(h('p', { class: 'note-muted' }, t('Nothing found.'))); return; }
      hits.forEach((x, i) => list.appendChild(h('button', { class: 'search-row', role: 'option', 'aria-selected': String(i === cur), 'data-kind': x.kind, onclick: () => go(i), onpointermove: () => { if (cur !== i) { cur = i; mark(); } } },
        icon(x.ic), h('span', { class: 'sr-main' }, h('span', { class: 'sr-label' }, x.label), h('span', { class: 'sr-sub' }, x.sub)), h('span', { class: 'sr-kind' }, kindName[x.kind]))));
    };
    const mark = () => [...list.children].forEach((el, i) => el.setAttribute && el.setAttribute('aria-selected', String(i === cur)));
    const go = i => { const x = hits[i]; if (!x) return; close && close(null); setTimeout(() => x.fn(), 0); };
    input.addEventListener('input', () => { cur = 0; paint(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cur = Math.min(hits.length - 1, cur + 1); mark(); list.children[cur] && list.children[cur].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, cur - 1); mark(); list.children[cur] && list.children[cur].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(cur); }
    });
    paint();
    UI.dialog({ title: t('Search'), body, onOpen: (d, c) => { close = c; setTimeout(() => input.focus(), 30); }, actions: [], enterKey: false });
  },
});
