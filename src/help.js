/* ───────────── help.js — what every button on the screen does (U6) ─────────────
   "?" (or F1, or ⋯ → Help, or Search → help) lays a numbered badge on every button that is on the screen now, with a
   list that says what each one does, and the keys. Tap a badge (or a line) to show which is which; tap outside, the
   close button or Esc to stop. What is said comes from the list below; a button not in it says its own tooltip. */

const HELP = [
  ['#btn-back', 'All projects', 'Back to the list of your houses.'],
  ['#btn-project-name', 'House name', 'Tap to rename this house.'],
  ['#btn-version', 'Version', 'The version you are looking at and changing; tap for all versions (copy, rename, compare, switch off).'],
  ['button[data-mode="build"]', 'Build', 'Draw and change walls, doors, windows, rooms, stairs, sockets and the garden.'],
  ['button[data-mode="furnish"]', 'Furnish', 'Place furniture and the kitchen; layouts to compare.'],
  ['button[data-mode="view"]', 'View', 'Look around, walk through the house, add notes and handover points.'],
  ['#btn-savepoint', 'Save point', 'Keep the house as it is now, to go back to later (Ctrl+S).'],
  ['#folder-status', 'Automatic backup', 'The last copy into your backup folder (or Paused: click to continue); click for Back up now.'],
  ['#btn-share', 'Export', 'Save the house as a file, share it, or make a viewer file for family and suppliers.'],
  ['#btn-search', 'Search', 'Find a room, note, version or action by typing (Ctrl+K or /).'],
  ['#btn-fullscreen', 'Full screen', 'The app fills the whole screen, like F11 – no tabs, address bar or window edge. Press it again, or Esc, to leave.'],
  ['#btn-menu', 'More', 'Versions, save points, drawings, plans as PDF, quantities, budget, tasks, settings and more.'],
  ['#display-toggle [data-mode="original"]', 'Original', 'The house as the builder delivers it.'],
  ['#display-toggle [data-mode="plan"]', 'Planned', 'Your plan: the version shown at the top.'],
  ['#display-toggle [data-mode="diff"]', 'Changes', 'What your plan changes: new walls red, removed walls dashed; the list in the details.'],
  ['#btn-display', 'Original / Planned / Changes', 'Choose what you see; also side by side, compare and the home view.'],
  ['#storey-tabs', 'Storeys', 'One storey, all storeys side by side, or the whole house.'],
  ['button[data-dim="2d"]', '2D', 'The floor plan.'],
  ['button[data-dim="3d"]', '3D', 'The house in 3D: drag to turn, pinch or scroll to zoom, two fingers to move.'],
  ['#btn-compare', 'Side by side', 'Two versions next to each other.'],
  ['#btn-swipe', 'Compare', 'The original and your plan on top of each other; drag the line across.'],
  ['#btn-viewopts', 'View', 'What to show (garden, street, houses around, water and park, furniture, notes, electrics, ceiling), colours, light, quality, photo render, AR.'],
  ['#btn-fit', 'Home view', 'Back to the whole drawing (F, a middle click, or a double tap).'],
  ['button[data-tool="select"]', 'Select', 'Tap a wall, room, door or piece to see and change its details (V).'],
  ['button[data-tool="wall"]', 'Wall', 'Draw walls: tap the start, then each corner; Enter or a double tap ends (W).'],
  ['button[data-tool="door"]', 'Door', 'Tap a wall to put a door in it (D).'],
  ['button[data-tool="window"]', 'Window', 'Tap a wall to put a window in it (N).'],
  ['button[data-tool="opening"]', 'Opening', 'An opening without a door (O).'],
  ['button[data-tool="room"]', 'Room', 'Tap inside walls to make a room, or draw its outline (R).'],
  ['button[data-tool="install"]', 'Electrics', 'Sockets, switches, lights, water points and units, with their heights (E).'],
  ['button[data-tool="stair"]', 'Stair', 'Draw a stair between two storeys (T).'],
  ['button[data-tool="void"]', 'Hole in the floor', 'A stairwell or void (H).'],
  ['button[data-tool="garden"]', 'Garden', 'Areas, paths, walls, hedges, trees and plants (G).'],
  ['button[data-tool="measure"]', 'Measure', 'Tap two points to measure, in 2D and 3D (M).'],
  ['#btn-history', 'History', 'Every change of this session with its name: go back several steps at once (Ctrl+H).'],
  ['button[aria-label="Undo"]', 'Undo', 'Undo the last change (Ctrl+Z).'],
  ['button[aria-label="Redo"]', 'Redo', 'Redo it (Ctrl+Shift+Z).'],
  ['button[data-tool="note"]', 'Note', 'Tap a spot in 2D or 3D to pin a note (N).'],
  ['button[data-tool="walk"]', 'Walk', 'Walk through the house at eye height (K).'],
  ['button[data-tool="docs"]', 'Documents', 'The PDFs and pictures kept with the house: drawings, the extra work list, quotes, photos.'],
  ['.view-cube, .vcube', 'View cube', 'Tap a side to look from there.'],
  ['.slice-btn, [aria-label="Slice"]', 'Slice', 'Cut the 3D house open with a plane you place.'],
  ['#sun-fold', 'Sun bar', 'The sun folds the bar away and back. Tap the day or the time to choose them in a calendar or a clock.'],
  ['#inspector, .inspector', 'Details', 'The details of what you selected (or of the storey): change sizes, materials, colours, notes.'],
];
const HELP_KEYS = [
  ['V W D N O R E T H G M', 'Tools: select, wall, door, window, opening, room, electrics, stair, hole, garden, measure'],
  ['F', 'Home view'], ['Esc', 'Stop drawing, back to Select, deselect'], ['Enter', 'End a wall chain'],
  ['Delete', 'Delete what is selected'], ['Arrows (Shift)', 'Move a selection by 1 cm (10 cm)'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+H', 'Undo history'], ['Ctrl+S', 'Save point'],
  ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copy / paste / duplicate'], ['Ctrl+K or /', 'Search'], ['? or F1', 'This help'],
  ['Space + drag', 'Move the plan'], ['W A S D, arrows', 'Walking'],
];

Object.assign(app, {
  /** the overlay: numbered badges on the buttons, and the list */
  helpOverlay() {
    if (document.querySelector('.help-ov')) return;
    const seen = new Set(), items = [];
    const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return null; if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return null; return r; };
    for (const [sel, name, text] of HELP) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el) || el.closest('.help-ov') || el.closest('.scrim')) continue;
        const r = visible(el);
        if (!r) continue;
        seen.add(el); items.push({ el, r, name: t(name), text: t(text) });
        break;
      }
    }
    // other buttons with a tooltip that are on the screen (the tool rail, the details …)
    for (const el of document.querySelectorAll('#toolrail button[title], .topbar button[title], .viewbar button[title]')) {
      if (seen.has(el) || items.length > 60) continue;
      const r = visible(el);
      if (!r) continue;
      const name = el.getAttribute('aria-label') || (el.textContent || '').trim(), title = el.getAttribute('title') || '';
      seen.add(el); items.push({ el, r, name: name || title, text: name && title !== name ? title : '' });
    }
    items.sort((a, b) => (Math.round(a.r.top / 40) - Math.round(b.r.top / 40)) || a.r.left - b.r.left);
    const ov = h('div', { class: 'help-ov', id: 'help-ov', role: 'dialog', 'aria-label': t('Help') });
    const marks = h('div', { class: 'help-marks' });
    const list = h('ol', { class: 'help-list', id: 'help-list' });
    items.forEach((it, i) => {
      const n = i + 1;
      const b = h('button', { class: 'help-badge', 'data-n': n, style: { left: Math.max(2, Math.min(innerWidth - 24, it.r.left - 6)) + 'px', top: Math.max(2, Math.min(innerHeight - 24, it.r.top - 6)) + 'px' }, onclick: e => { e.stopPropagation(); pick(n); } }, String(n));
      const box = h('div', { class: 'help-box', 'data-n': n, style: { left: it.r.left + 'px', top: it.r.top + 'px', width: it.r.width + 'px', height: it.r.height + 'px' } });
      marks.append(box, b);
      list.appendChild(h('li', { 'data-n': n, onclick: e => { e.stopPropagation(); pick(n); } }, h('span', { class: 'hl-n' }, String(n)), h('span', null, it.name ? h('strong', null, it.name) : null, it.name && it.text ? ' – ' + it.text : it.text)));
    });
    const keys = h('div', { class: 'help-keys' }, h('div', { class: 'eyebrow' }, t('Keys')),
      h('dl', null, ...HELP_KEYS.flatMap(([k, what]) => [h('dt', null, k), h('dd', null, t(what))])));
    const panel = h('div', { class: 'help-panel', onclick: e => e.stopPropagation() },
      h('div', { class: 'help-head' }, h('h2', null, t('What the buttons do')), h('button', { class: 'btn ghost icon sm', id: 'help-close', 'aria-label': t('Close'), onclick: () => done() }, icon('close'))),
      h('p', { class: 'note-muted' }, t('Each number is on a button on the screen now. Tap a number to see which.')), list, keys,
      h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'help-feedback', onclick: () => { done(); this.feedbackDialog(); } }, icon('edit'), t('Send feedback…'))));
    ov.append(marks, panel);
    const pick = n => {
      for (const el of ov.querySelectorAll('[data-n]')) el.classList.toggle('on', +el.dataset.n === n);
      const li = list.querySelector(`li[data-n="${n}"]`);
      if (li) li.scrollIntoView({ block: 'nearest' });
    };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
    const done = () => { ov.remove(); document.removeEventListener('keydown', esc, true); };
    ov.addEventListener('click', () => done());
    document.addEventListener('keydown', esc, true);
    document.body.appendChild(ov);
    this.lastHelp = items.map(it => it.name);
    return items.length;
  },
});
