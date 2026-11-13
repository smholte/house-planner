/* ───────────── ui.js — icons, dialogs, menus, toasts ───────────── */

const ICONS = {
  pipe: '<path d="M3 8h7a3 3 0 0 1 3 3v10"/><path d="M3 12h5a1 1 0 0 1 1 1v8"/><path d="M15 3v4M19 3v4M14 7h6"/>',
  gauge: '<path d="M4.5 17.5a8.5 8.5 0 1 1 15 0"/><path d="M12 13l4-4"/><circle cx="12" cy="13" r="1.3"/>',
  blank: '',
  doc: '<path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5V7h4.5"/><path d="M9 12h6M9 15.5h6M9 19h3.5"/>',
  minus: '<path d="M5 12h14"/>',
  alert: '<path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.5"/><path d="M12 17.3v.2"/>',
  garden: '<path d="M12 21v-6"/><path d="M12 15c-4.5 0-6-3-6-5.5C6 6 9 3 12 3s6 3 6 6.5C18 12 16.5 15 12 15z"/><path d="M4 21h16"/>',
  plant: '<path d="M12 21v-8"/><path d="M12 13c0-4 2.5-7 7-7 0 4-2.5 7-7 7z"/><path d="M12 15c0-3-2-5.5-6-5.5 0 3 2 5.5 6 5.5z"/>',
  map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M12 5l3 7-3 7-3-7z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  forward: '<path d="M9 5l7 7-7 7"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  share: '<path d="M12 3v12"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  save: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  select: '<path d="M5 3l14 7-6.5 1.8L10.7 18.5z"/>',
  wall: '<rect x="3" y="9" width="18" height="6" fill="currentColor" stroke="none" opacity=".9"/><path d="M3 9h18M3 15h18"/>',
  door: '<path d="M4 20h4"/><path d="M8 20V6"/><path d="M8 6a14 14 0 0 1 14 14"/><path d="M16 20h4"/>',
  window: '<rect x="3" y="9" width="18" height="6"/><path d="M3 12h18"/>',
  opening: '<path d="M3 9h5v6H3zM16 9h5v6h-5z" fill="currentColor" stroke="none"/><path d="M9.5 12h5" stroke-dasharray="2 2"/>',
  room: '<path d="M4 4h16v16H4z"/><path d="M4 13h7v7" opacity=".5"/><circle cx="14.5" cy="9.5" r="1.4" fill="currentColor"/>',
  measure: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="1.5"/><path d="M16 8V4.5A1.5 1.5 0 0 0 14.5 3h-10A1.5 1.5 0 0 0 3 4.5v10A1.5 1.5 0 0 0 4.5 16H8"/>',
  download: '<path d="M12 3v12"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 15V3"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 20h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r=".9" fill="currentColor"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M12 4v16"/>',
  void: '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 2"/><path d="M4 4l16 16M20 4L4 20"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  swipe: '<path d="M12 3v5M12 16v5"/><circle cx="12" cy="12" r="4"/><path d="M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  swipearrows: '<path d="M9.5 7.5L5 12l4.5 4.5M14.5 7.5L19 12l-4.5 4.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="8.5" r="1.5"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  'fullscreen-exit': '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4.5h4.5"/><path d="M12 7.5V12l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.5 4.5l2.1 2.1M17.4 17.4l2.1 2.1M2.5 12h3M18.5 12h3M4.5 19.5l2.1-2.1M17.4 6.6l2.1-2.1"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5" opacity=".6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4.5h4.5"/>',
  flip: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7L4 12l5 5zM15 7l5 5-5 5z"/>',
  scissors: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7.5L20 18M8 16.5L20 6"/>',
  install: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M12 7v7M9 11l3 3 3-3"/>',
  // modes and the new tools
  build: '<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/>',
  sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2.5 13a1.5 1.5 0 0 1 3 0v1h13v-1a1.5 1.5 0 0 1 3 0v5h-19z"/><path d="M5 18v2M19 18v2"/>',
  cart: '<path d="M3 4h2l2.2 10.5a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2.2-6.5L15 17v4"/><path d="M8.5 12l2-4.5 3.5 1 2 3.5 2.5 1"/><path d="M12.2 14.5L10.5 7.5"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2.5L9 4h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
  path: '<circle cx="5" cy="18" r="2"/><circle cx="12" cy="9" r="2"/><circle cx="19" cy="15" r="2"/><circle cx="17" cy="4" r="1.6"/><path d="M6.4 16.5l4.2-6M13.7 10l3.8 3.6M13 7.4l2.9-2.3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>',
  magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 4h4v8a2 2 0 0 0 4 0V4h4"/><path d="M6 8h4M14 8h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21z"/><path d="M9.5 8.5h5"/>',
  catalog: '<rect x="3" y="3" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1"/><path d="M17.25 14v6.5M14 17.25h6.5"/>',
  group: '<rect x="3" y="3" width="8" height="6" rx="1"/><rect x="13" y="3" width="8" height="6" rx="1"/><rect x="3" y="12" width="18" height="9" rx="1" stroke-dasharray="2.5 2"/>',
  space: '<path d="M3 7V3h4M21 7V3h-4M3 17v4h4M21 17v4h-4"/><path d="M7.5 12h9M7.5 12l2.5-2.5M7.5 12l2.5 2.5M16.5 12L14 9.5M16.5 12L14 14.5"/>',
  person: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3.6-3.6a4 4 0 0 0-5.7-5.7L12 6.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-3.6 3.6a4 4 0 0 0 5.7 5.7l1.6-1.6"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>',
  light: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  turn: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9"/><path d="M20 4v5h-5"/><path d="M12 8v4l3 2"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M4 16V5.5A1.5 1.5 0 0 1 5.5 4H16"/><path d="M14 11v6M11 14h6"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.5"/><circle cx="12" cy="17" r=".9" fill="currentColor"/>',
  todo: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
  decision: '<path d="M12 3v18"/><path d="M5 7h10l3 3-3 3H5z"/>',
  idea: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  problem: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".9" fill="currentColor"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7 14h10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.5 4.5l2.1 2.1M17.4 17.4l2.1 2.1M2.5 12h3M18.5 12h3M4.5 19.5l2.1-2.1M17.4 6.6l2.1-2.1"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  record: '<circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
  next: '<path d="M6 5l8 7-8 7z" fill="currentColor"/><path d="M18 5v14"/>',
  prev: '<path d="M18 5l-8 7 8 7z" fill="currentColor"/><path d="M6 5v14"/>',
  snag: '<path d="M4 20l4-4"/><circle cx="12.5" cy="11.5" r="6"/><path d="M10 11.5l2 2 3.5-4"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  stair: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  install: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9h18M3 15h18M9 3v6M15 9v6M9 15v6"/>',
  roller: '<rect x="3" y="3" width="15" height="6" rx="1.5"/><path d="M18 6h3v5h-9v3"/><rect x="10.5" y="14" width="3" height="7" rx="1"/>',
  ceiling: '<path d="M3 4h18"/><path d="M12 4v4"/><path d="M6.5 14a5.5 5.5 0 0 1 11 0z"/><path d="M10 17.5h4M9 20.5h6" opacity=".7"/>',
  socket: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/>',
  euro: '<path d="M17.5 6.5A7 7 0 1 0 17.5 17.5"/><path d="M4 10h9M4 14h9"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16M15 4v16"/><path d="M5 8h2M11 8h2M11 11h2M17 8h2"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M3 14.5h18M9 9v11"/>',
};
function icon(name, cls = '') {
  const span = document.createElement('span');
  span.innerHTML = `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return span.firstChild;
}

const UI = {
  toast(msg, opts = {}) {
    const root = $('#toasts');
    const t = h('div', { class: 'toast', role: 'status' }, h('span', null, msg));
    if (opts.action) t.appendChild(h('button', { class: 'btn sm', onclick: () => { opts.action.fn(); t.remove(); } }, opts.action.label));
    root.appendChild(t);
    while (root.children.length > 3) root.firstChild.remove();
    setTimeout(() => t.remove(), opts.ms || (opts.action ? 6000 : 3200));
  },

  /** dialog({title, body: Node|string, actions:[{label, value, kind}], wide}) → Promise(value | null) */
  dialog({ title, body, actions = [{ label: 'OK', value: true, kind: 'primary' }], wide, onOpen, dismissValue = null, enterKey = true }) {
    return new Promise(resolve => {
      const prevFocus = document.activeElement;
      const close = (v) => { scrim.remove(); document.removeEventListener('keydown', key, true); try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (_) {} resolve(v); };
      const bodyEl = typeof body === 'string' ? h('p', null, body) : body;
      const foot = h('div', { class: 'dlg-foot' });
      const dlg = h('div', { class: 'dialog' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'dlg-head' }, h('h2', null, title), h('button', { class: 'btn ghost icon sm', 'aria-label': 'Close', onclick: () => close(dismissValue) }, icon('close'))),
        h('div', { class: 'dlg-body' }, bodyEl),
        foot);
      for (const a of actions) {
        const b = h('button', { class: 'btn ' + (a.kind || ''), onclick: async () => {
          if (a.validate) { const ok = await a.validate(); if (!ok) return; }
          close(typeof a.value === 'function' ? a.value() : a.value);
        } }, a.icon ? icon(a.icon) : null, a.label);
        foot.appendChild(b);
      }
      if (!actions.length) foot.remove();
      const scrim = h('div', { class: 'scrim', onclick: e => { if (e.target === scrim) close(dismissValue); } }, dlg);
      const key = e => {
        // only the dialog on top answers the keys
        if (scrim.parentNode && scrim.parentNode.lastElementChild !== scrim) return;
        // (a menu open over the dialog: Esc closes only the menu)
        if (e.key === 'Escape' && document.querySelector('body > .menu')) return;
        if (e.key === 'Escape') { e.stopPropagation(); close(dismissValue); }
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && enterKey) {
          const prim = actions.find(a => a.kind && a.kind.includes('primary'));
          if (prim) { e.preventDefault(); foot.querySelector('.primary')?.click(); }
        }
      };
      document.addEventListener('keydown', key, true);
      $('#sheet-root').appendChild(scrim);
      dlg.closeWith = close;
      if (onOpen) onOpen(dlg, close);
      const first = dlg.querySelector('input:not([type=checkbox]):not([type=range]), textarea, select') || foot.querySelector('.primary');
      if (first) setTimeout(() => { first.focus(); if (first.select && first.tagName === 'INPUT') first.select(); }, 30);
    });
  },

  busy(text) {
    const el = h('div', { class: 'scrim busy', role: 'alert', 'aria-live': 'assertive' }, h('div', { class: 'busy-box' }, h('span', { class: 'spinner' }), h('span', null, text)));
    $('#sheet-root').appendChild(el);
    return { close: () => el.remove(), set: t => { el.querySelector('.busy-box span:last-child').textContent = t; } };
  },

  confirm({ title, message, confirmLabel = 'OK', danger = false, cancelLabel = 'Cancel' }) {
    return this.dialog({ title, body: message, actions: [{ label: cancelLabel, value: false }, { label: confirmLabel, value: true, kind: danger ? 'danger solid' : 'primary' }] }).then(v => !!v);
  },

  prompt({ title, label, value = '', placeholder = '', confirmLabel = 'Save', type = 'text', unit, hint }) {
    const inp = h('input', { class: 'input', type, value, placeholder, id: 'dlg-input', inputmode: type === 'number' ? 'decimal' : null });
    const wrap = unit ? h('div', { class: 'input-unit' }, inp, h('span', { class: 'unit' }, unit)) : inp;
    const body = h('div', { class: 'field' }, label ? h('label', { for: 'dlg-input' }, label) : null, wrap, hint ? h('p', { class: 'note-muted' }, hint) : null);
    return this.dialog({ title, body, actions: [{ label: 'Cancel', value: null }, { label: confirmLabel, kind: 'primary', value: () => inp.value }] });
  },

  /** small popup menu anchored to an element. items: [{label, icon, fn, danger}|'-'|{node}] */
  menu(anchor, items, opts = {}) {
    // pressing the button of an open menu again closes it
    const wasOpen = !!(anchor && anchor._hpMenu && anchor._hpMenu.isConnected);
    document.querySelectorAll('.menu').forEach(m => m.closeMenu && m.closeMenu());
    if (wasOpen) { anchor._hpMenu = null; return null; }
    const m = h('div', { class: 'menu', role: 'menu' });
    if (anchor) { anchor._hpMenu = m; anchor.setAttribute('aria-expanded', 'true'); }
    const close = () => { if (!m.isConnected) return; if (anchor) anchor.setAttribute('aria-expanded', 'false'); m.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc, true); window.removeEventListener('resize', close); window.dispatchEvent(new CustomEvent('hp-menu', { detail: { open: false } })); };
    m.closeMenu = close;
    for (const it of items) {
      if (!it) continue;
      if (it === '-') { m.appendChild(h('div', { class: 'msep' })); continue; }
      if (it.node) { m.appendChild(it.node); continue; }
      m.appendChild(h('button', { class: 'mi' + (it.danger ? ' danger' : ''), role: 'menuitem', disabled: it.disabled, ...(it.id ? { id: it.id } : {}), onclick: () => { if (!it.keepOpen) close(); it.fn && it.fn(); } }, it.icon ? icon(it.icon) : null, h('span', null, it.label)));
    }
    const outside = e => { if (!m.contains(e.target) && !anchor.contains(e.target)) close(); };
    // Esc closes only the menu (not also the walk, a selection …)
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let left = opts.alignLeft ? r.left : r.right - mw;
    left = clamp(left, 8, window.innerWidth - mw - 8);
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) {
      // above the button when it fits there; else below it, scrolling – never over the button (press it again to close)
      if (r.top - mh - 6 >= 8) top = r.top - mh - 6;
      else { m.style.maxHeight = Math.max(160, window.innerHeight - top - 8) + 'px'; m.style.overflowY = 'auto'; }
    }
    m.style.left = left + 'px'; m.style.top = top + 'px';
    setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc, true); window.addEventListener('resize', close); }, 0);
    window.dispatchEvent(new CustomEvent('hp-menu', { detail: { open: true, el: m } }));
    return m;
  },
};
