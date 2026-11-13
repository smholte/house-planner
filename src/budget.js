/* ───────────── budget.js — the budget: categories (kitchen, bathroom, floors, paint, furniture, tools …), what is
   planned and what is paid, the difference between two versions, and items of your own (also things that are not in
   the house model, like tools) with a name, a photo, a link and the cost ─────────────

   project.budget = { total, cats: [{ id, name, budget }], items: [{ id, cat, name, qty, unit, price (per unit),
   mat (a material key from the quantities: the amount then follows the version), paid, status, store, link,
   photo (asset id), note, ver (null: every version; or one version id), room }] }
   The furniture of the active layout is counted in its own line, from the shopping list. */

const BUDGET_CATS = [['kitchen', 'Kitchen'], ['bath', 'Bathroom and toilet'], ['floors', 'Floors'], ['walls', 'Walls and paint'], ['elec', 'Electrics'], ['heat', 'Heating and ventilation'], ['furniture', 'Furniture'], ['tools', 'Tools'], ['other', 'Other']];
const BUDGET_STATUS = [['idea', 'Idea'], ['planned', 'Planned'], ['ordered', 'Ordered'], ['paid', 'Paid']];
/** where a material from the quantities goes in the budget */
const MAT_CAT = { paint: 'walls', primer: 'walls', pre: 'walls', vlies: 'walls', paper: 'walls', mural: 'walls', tiles: 'bath', ceil: 'walls', floor: 'floors', skirt: 'floors', kit: 'walls', pt: 'elec' };

function budgetOf(p) {
  const b = p.budget || {};
  return { total: b.total ?? null, cats: b.cats && b.cats.length ? b.cats : BUDGET_CATS.map(([id, name]) => ({ id, name, budget: null })), items: b.items || [] };
}
/** the amount of one item for a version (null: the item is not in that version) */
function itemAmount(it, ver, matsOf) {
  if (it.ver && ver && it.ver !== ver.id) return null;
  let qty = it.qty ?? 1;
  if (it.mat) { const m = matsOf(ver).find(x => x.key === it.mat); qty = m ? m.amount : 0; }
  return { qty, total: (qty || 0) * (it.price || 0) };
}
const itemPaid = (it, total) => it.paid != null ? it.paid : it.status === 'paid' ? total : 0;
/** the budget worked out for a version: per category the planned and paid amounts, and every line */
function budgetFor(p, ver) {
  const B = budgetOf(p);
  const cache = new Map();
  const matsOf = v => { if (!v) return []; if (!cache.has(v.id)) cache.set(v.id, houseQuantities(p, v.plan).materials); return cache.get(v.id); };
  const cats = B.cats.map(c => ({ ...c, planned: 0, paid: 0, lines: [] }));
  const catOf = id => cats.find(c => c.id === id) || cats.find(c => c.id === 'other') || cats[cats.length - 1];
  for (const it of B.items) {
    const a = itemAmount(it, ver, matsOf);
    if (!a) continue;
    const c = catOf(it.cat);
    const paid = itemPaid(it, a.total);
    c.lines.push({ it, qty: a.qty, total: a.total, paid });
    if (it.status !== 'idea') c.planned += a.total;
    c.paid += paid;
  }
  // furniture from the shopping list (the active layout)
  const lay = p.furniture && (p.furniture.layouts || []).find(l => l.id === p.furniture.activeLayoutId);
  if (lay && typeof layoutTotals === 'function') {
    const T = layoutTotals(lay);
    if (T.count) { const c = catOf('furniture'); c.lines.push({ furn: lay, total: T.total, paid: T.spent, count: T.count }); c.planned += T.total; c.paid += T.spent; }
  }
  const planned = cats.reduce((a, c) => a + c.planned, 0), paid = cats.reduce((a, c) => a + c.paid, 0);
  return { B, cats, planned, paid };
}

Object.assign(app, {
  async budgetSheet() {
    const p = this.project;
    let close = null;
    const body = h('div', { class: 'bud-body' });
    const paint = () => {
      const ver = this.shownVersion();
      const cmpV = this._budCmp && getVersion(p, this._budCmp) && this._budCmp !== ver.id ? getVersion(p, this._budCmp) : null;
      const R = budgetFor(p, ver), C = cmpV ? budgetFor(p, cmpV) : null;
      body.textContent = '';
      // summary
      const total = R.B.total;
      const pct = total ? Math.min(100, R.planned / total * 100) : 0, pctPaid = total ? Math.min(100, R.paid / total * 100) : (R.planned ? R.paid / R.planned * 100 : 0);
      const totalIn = h('input', { class: 'input num', id: 'bud-total', value: total != null ? String(total).replace('.', ',') : '', placeholder: t('not set'), inputmode: 'decimal', autocomplete: 'off' });
      totalIn.addEventListener('change', () => { const v = parseMoney(totalIn.value); this.setBudget(b => { b.total = v; }); paint(); });
      body.appendChild(h('div', { class: 'bud-sum' },
        h('div', { class: 'bud-figs' },
          h('div', { class: 'bud-fig' }, h('span', null, t('Planned')), h('strong', { class: 'num', id: 'bud-planned' }, fmtEuro(R.planned))),
          h('div', { class: 'bud-fig' }, h('span', null, t('Paid')), h('strong', { class: 'num', id: 'bud-paid' }, fmtEuro(R.paid))),
          h('div', { class: 'bud-fig' }, h('span', null, t('Still to pay')), h('strong', { class: 'num' }, fmtEuro(Math.max(0, R.planned - R.paid)))),
          h('div', { class: 'bud-fig' }, h('label', { for: 'bud-total' }, t('Budget')), h('div', { class: 'input-unit' }, totalIn, h('span', { class: 'unit' }, '€')))),
        h('div', { class: 'bud-bar', title: total ? t('{p} % of the budget planned', { p: Math.round(R.planned / total * 100) }) : '' }, h('i', { class: 'pl', style: { width: (total ? pct : 100) + '%' } }), h('i', { class: 'pd', style: { width: pctPaid + '%' } })),
        total && R.planned > total ? h('p', { class: 'bud-over' }, icon('problem'), t('{a} over the budget', { a: fmtEuro(R.planned - total) })) : null));
      // compare with another version
      const others = p.versions.filter(v => v.id !== ver.id);
      const cmpSel = h('select', { class: 'select sm', id: 'bud-cmp', 'aria-label': t('Compare with') }, h('option', { value: '' }, t('No comparison')), ...others.map(v => h('option', { value: v.id, selected: cmpV && cmpV.id === v.id }, v.name)));
      cmpSel.addEventListener('change', () => { this._budCmp = cmpSel.value || null; paint(); });
      body.appendChild(h('div', { class: 'bud-cmp' }, h('span', null, t('Version “{v}”', { v: ver.name })), h('span', { class: 'grow' }), h('span', { class: 'note-muted' }, t('Compare with')), cmpSel));
      if (C) {
        const d = R.planned - C.planned;
        body.appendChild(h('p', { class: 'bud-diff' + (d > 0 ? ' up' : d < 0 ? ' down' : '') }, t('“{a}” costs {d} {more} than “{b}”', { a: ver.name, b: cmpV.name, d: fmtEuro(Math.abs(d)), more: d >= 0 ? t('more') : t('less') })));
      }
      // categories with their lines
      const list = h('div', { class: 'bud-list' });
      R.cats.forEach((c, ci) => {
        const cc = C ? C.cats.find(x => x.id === c.id) : null;
        if (!c.lines.length && !c.budget && !(cc && cc.lines.length)) return;
        const over = c.budget && c.planned > c.budget;
        list.appendChild(h('div', { class: 'bud-cat' + (over ? ' over' : ''), 'data-cat': c.id },
          h('div', { class: 'bud-cat-name' }, c.name),
          h('div', { class: 'bud-cat-fig num' }, fmtEuro(c.planned), cc && Math.abs(cc.planned - c.planned) > 0.005 ? h('span', { class: 'bud-delta ' + (c.planned > cc.planned ? 'up' : 'down') }, (c.planned > cc.planned ? '+' : '−') + fmtEuro(Math.abs(c.planned - cc.planned))) : null),
          h('button', { class: 'btn ghost sm bud-cat-budget', title: t('Budget for this category'), onclick: async () => {
            const v = await UI.prompt({ title: t('Budget for {c}', { c: c.name }), label: t('Amount'), value: c.budget != null ? String(c.budget).replace('.', ',') : '', unit: '€', type: 'text' });
            if (v == null) return;
            this.setBudget(b => { const x = b.cats.find(y => y.id === c.id); if (x) x.budget = parseMoney(v); }); paint();
          } }, c.budget ? t('of {b}', { b: fmtEuro(c.budget) }) : t('set budget')),
          h('div', { class: 'bud-cat-bar' }, h('i', { class: 'pd', style: { width: (c.planned ? Math.min(100, c.paid / c.planned * 100) : 0) + '%' } }))));
        for (const L of c.lines) {
          if (L.furn) {
            list.appendChild(h('button', { class: 'bud-line furn', onclick: () => { close(null); this.setMode('furnish'); setTimeout(() => this.shoppingSheet(), 300); } },
              h('span', { class: 'bud-thumb' }, icon('sofa')), h('span', { class: 'bud-l1' }, h('strong', null, t('Furniture: shopping list')), h('small', null, t('{n} pieces in “{l}”', { n: L.count, l: L.furn.name }))),
              h('span', { class: 'bud-amt num' }, fmtEuro(L.total), h('small', null, L.paid ? t('{p} paid', { p: fmtEuro(L.paid) }) : ''))));
            continue;
          }
          const it = L.it, ph = it.photo && Assets.get(it.photo);
          list.appendChild(h('button', { class: 'bud-line' + (it.status === 'idea' ? ' idea' : ''), 'data-item': it.id, onclick: () => this.budgetItemDialog(it).then(paint) },
            h('span', { class: 'bud-thumb' }, ph ? h('img', { src: ph.url, alt: '' }) : icon(it.mat ? 'table' : 'cart')),
            h('span', { class: 'bud-l1' }, h('strong', null, it.name || t('Item')),
              h('small', null, [it.mat ? `${fmtQty(L.qty)} ${it.unit || ''} × ${fmtEuro(it.price || 0)}` : (L.qty !== 1 ? `${fmtQty(L.qty)} × ${fmtEuro(it.price || 0)}` : ''), it.store, it.ver ? t('only in “{v}”', { v: (getVersion(p, it.ver) || {}).name || '?' }) : ''].filter(Boolean).join(' · '))),
            h('span', { class: 'bud-amt num' }, fmtEuro(L.total), h('small', { class: 'st-' + (it.status || 'planned') }, it.status === 'paid' || L.paid >= L.total && L.total > 0 ? t('paid') : L.paid ? t('{p} paid', { p: fmtEuro(L.paid) }) : t((BUDGET_STATUS.find(s => s[0] === (it.status || 'planned')) || [])[1] || '')))));
        }
        if (cc) for (const L of cc.lines) if (L.it && !c.lines.some(x => x.it && x.it.id === L.it.id)) list.appendChild(h('div', { class: 'bud-line other' }, h('span', { class: 'bud-thumb' }, icon('layers')), h('span', { class: 'bud-l1' }, h('strong', null, L.it.name), h('small', null, t('only in “{v}”', { v: cmpV.name }))), h('span', { class: 'bud-amt num' }, fmtEuro(L.total))));
        void ci;
      });
      if (!list.children.length) list.appendChild(h('p', { class: 'note-muted' }, t('Nothing in the budget yet. Add the kitchen, the bathroom, tools … with what they cost, or take the materials from the quantities.')));
      body.appendChild(list);
    };
    paint();
    const v = await UI.dialog({ title: t('Budget'), body, wide: true, enterKey: false, onOpen: (d, c) => {
      close = c;
      // the buttons below keep the sheet open
      const foot = d.querySelector('.dlg-foot');
      foot.prepend(h('button', { class: 'btn', id: 'bud-add-mat', onclick: () => this.budgetFromMaterials().then(paint) }, icon('table'), t('From the materials')));
      foot.prepend(h('button', { class: 'btn primary', id: 'bud-add', onclick: () => this.budgetItemDialog(null).then(paint) }, icon('plus'), t('Add an item')));
    }, actions: [{ label: t('Spreadsheet (.csv)'), value: 'csv', icon: 'download' }] });
    if (v === 'csv') this.budgetCsv();
  },

  setBudget(fn) {
    this.mutate(pr => { const B = budgetOf(pr); pr.budget = { total: B.total, cats: B.cats.map(c => ({ ...c })), items: B.items }; fn(pr.budget); }, { project: true, keepInspector: true });
  },

  /** add or change one item → resolves when the dialog is closed */
  async budgetItemDialog(it) {
    const p = this.project, B = budgetOf(p);
    const d = it ? clone(it) : { id: uid('b_'), cat: this._budCat || 'other', name: '', qty: 1, unit: '', price: null, paid: null, status: 'planned', store: '', link: '', photo: null, note: '', ver: null, room: null };
    const body = h('div', { class: 'bud-edit' });
    const field = (label, node, id) => h('div', { class: 'field' }, h('label', { for: id }, label), node);
    const inp = (id, val, ph, mode) => { const i = h('input', { class: 'input' + (mode === 'decimal' ? ' num' : ''), id, value: val == null ? '' : String(val).replace(mode === 'decimal' ? '.' : '\0', ','), placeholder: ph || '', inputmode: mode || 'text', autocomplete: 'off' }); return i; };
    const name = inp('bi-name', d.name, t('e.g. Kitchen IKEA Metod, Graco GX 21 paint sprayer'));
    const cat = h('select', { class: 'select', id: 'bi-cat' }, ...B.cats.map(c => h('option', { value: c.id, selected: d.cat === c.id }, c.name)));
    const plan = this.shownVersion().plan;
    const room = h('select', { class: 'select', id: 'bi-room' }, h('option', { value: '' }, t('Not one room')), ...sortedStoreys(p).flatMap(st => plan.rooms.filter(r => r.storey === st.id).map(r => h('option', { value: r.id, selected: d.room === r.id }, `${r.name} · ${st.name}`))));
    const ver = h('select', { class: 'select', id: 'bi-ver' }, h('option', { value: '' }, t('Every version')), ...p.versions.map(v => h('option', { value: v.id, selected: d.ver === v.id }, t('Only “{v}”', { v: v.name }))));
    const qty = inp('bi-qty', d.mat ? '' : d.qty, '1', 'decimal');
    const unit = inp('bi-unit', d.unit, t('pieces, m², L …'));
    const price = inp('bi-price', d.price, '0', 'decimal');
    const paid = inp('bi-paid', d.paid, t('nothing yet'), 'decimal');
    const status = h('div', { class: 'seg wrap', id: 'bi-status' }, ...BUDGET_STATUS.map(([k, lab]) => h('button', { 'aria-pressed': String((d.status || 'planned') === k), 'data-k': k, onclick: () => { d.status = k; for (const b of status.children) b.setAttribute('aria-pressed', String(b.dataset.k === k)); } }, t(lab))));
    const store = inp('bi-store', d.store, t('e.g. Gamma, Praxis, Bol'));
    const link = inp('bi-link', d.link, 'https://…', 'url');
    const note = h('textarea', { class: 'textarea', id: 'bi-note', placeholder: t('Model, colour, delivery …') }); note.value = d.note || '';
    const photoBox = h('div', { class: 'bi-photo' });
    const paintPhoto = () => {
      photoBox.textContent = '';
      const a = d.photo && Assets.get(d.photo);
      photoBox.append(a ? h('img', { src: a.url, alt: '' }) : h('span', { class: 'bud-thumb big' }, icon('image')),
        h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'bi-photo-add', onclick: async () => {
          const f = await pickFile('image/*'); if (!f) return;
          try {
            const img = await loadImage(await readFileAs(f, 'dataURL'));
            const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
            const cv = makeCanvas(Math.max(1, Math.round(img.naturalWidth * k)), Math.max(1, Math.round(img.naturalHeight * k)));
            const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
            d.photo = await Assets.put(cv.toDataURL('image/jpeg', 0.82), cv.width, cv.height);
            paintPhoto();
          } catch (e) { this.toast(t('This picture could not be read.')); }
        } }, icon('camera'), a ? t('Other photo') : t('Add a photo')), a ? h('button', { class: 'btn sm ghost', onclick: () => { d.photo = null; paintPhoto(); } }, icon('close'), t('Remove')) : null));
    };
    paintPhoto();
    const fromMat = d.mat ? h('p', { class: 'note-muted bi-mat' }, icon('table'), t('The amount comes from the quantities of the version you look at.')) : null;
    body.append(
      field(t('What'), name, 'bi-name'),
      h('div', { class: 'field-row' }, field(t('Category'), cat, 'bi-cat'), field(t('Room'), room, 'bi-room')),
      fromMat || h('div', { class: 'field-row three' }, field(t('Quantity'), qty, 'bi-qty'), field(t('Unit'), unit, 'bi-unit'), field(t('Price each'), h('div', { class: 'input-unit' }, price, h('span', { class: 'unit' }, '€')), 'bi-price')),
      fromMat ? h('div', { class: 'field-row' }, field(t('Price per {u}', { u: d.unit || t('unit') }), h('div', { class: 'input-unit' }, price, h('span', { class: 'unit' }, '€')), 'bi-price'), h('div')) : null,
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Status')), status),
      h('div', { class: 'field-row' }, field(t('Paid so far'), h('div', { class: 'input-unit' }, paid, h('span', { class: 'unit' }, '€')), 'bi-paid'), field(t('In the budget of'), ver, 'bi-ver')),
      h('div', { class: 'field-row' }, field(t('Shop'), store, 'bi-store'), field(t('Link'), link, 'bi-link')),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Photo')), photoBox),
      field(t('Note'), note, 'bi-note'));
    const acts = [{ label: t('Cancel'), value: null }, { label: t('Save'), value: 'save', kind: 'primary' }];
    if (it) acts.unshift({ label: t('Delete'), value: 'delete', kind: 'danger', icon: 'trash' });
    const res = await UI.dialog({ title: it ? t('Budget item') : t('New budget item'), body, actions: acts });
    if (res === 'delete') { this.setBudget(b => { b.items = b.items.filter(x => x.id !== d.id); }); return; }
    if (res !== 'save') return;
    d.name = name.value.trim() || t('Item');
    d.cat = cat.value; this._budCat = d.cat;
    d.room = room.value || null; d.ver = ver.value || null;
    if (!d.mat) { d.qty = parseMoney(qty.value) ?? 1; d.unit = unit.value.trim(); }
    d.price = parseMoney(price.value); d.paid = parseMoney(paid.value);
    d.store = store.value.trim(); d.link = link.value.trim(); d.note = note.value;
    this.setBudget(b => { const i = b.items.findIndex(x => x.id === d.id); if (i >= 0) b.items[i] = d; else b.items.push(d); });
  },

  /** take materials from the quantities into the budget: their amount follows the version */
  async budgetFromMaterials() {
    const p = this.project;
    const mats = houseQuantities(p, this.shownVersion().plan).materials;
    const have = new Set(budgetOf(p).items.map(x => x.mat).filter(Boolean));
    const picked = new Set();
    const body = h('div', { class: 'bud-mats' }, h('p', { class: 'note-muted' }, t('Tick what you want to buy; then give each a price in the budget. The amounts follow the quantities of each version.')));
    for (const m of mats) {
      const cb = h('input', { type: 'checkbox', checked: false, disabled: have.has(m.key), 'data-key': m.key });
      cb.addEventListener('change', () => { if (cb.checked) picked.add(m.key); else picked.delete(m.key); });
      body.appendChild(h('label', { class: 'check-row bud-mat' + (have.has(m.key) ? ' have' : '') }, cb, h('span', { class: 'grow' }, m.what, have.has(m.key) ? h('small', null, ' · ' + t('in the budget')) : null), h('span', { class: 'num' }, m.show)));
    }
    const ok = await UI.dialog({ title: t('From the materials'), body, wide: true, actions: [{ label: t('Cancel'), value: null }, { label: t('Add to the budget'), value: true, kind: 'primary' }] });
    if (!ok || !picked.size) return;
    this.setBudget(b => {
      for (const m of mats) if (picked.has(m.key)) b.items.push({ id: uid('b_'), cat: MAT_CAT[m.key.split('|')[0]] || 'other', name: m.what, qty: null, unit: m.unit, price: null, mat: m.key, paid: null, status: 'planned', store: '', link: '', photo: null, note: '', ver: null, room: null });
    });
  },

  budgetCsv() {
    const p = this.project, ver = this.shownVersion(), R = budgetFor(p, ver);
    const q = x => typeof x === 'number' ? String(+x.toFixed(2)).replace('.', ',') : '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
    const rows = [[t('Category'), t('Item'), t('Room'), t('In the budget of'), t('Quantity'), t('Unit'), t('Price each'), t('Total'), t('Paid'), t('Status'), t('Shop'), t('Link'), t('Note')]];
    const rn = id => { const r = ver.plan.rooms.find(x => x.id === id); return r ? r.name : ''; };
    for (const c of R.cats) for (const L of c.lines) {
      if (L.furn) { rows.push([c.name, t('Furniture: shopping list'), '', '', L.count, t('pieces'), '', L.total, L.paid, '', '', '', '']); continue; }
      const it = L.it;
      rows.push([c.name, it.name, rn(it.room), it.ver ? (getVersion(p, it.ver) || {}).name || '' : t('Every version'), L.qty, it.unit || '', it.price || 0, L.total, L.paid, t((BUDGET_STATUS.find(s => s[0] === (it.status || 'planned')) || [])[1] || ''), it.store || '', it.link || '', (it.note || '').replace(/\s*\n\s*/g, ' / ')]);
    }
    rows.push([]);
    rows.push([t('Planned'), '', '', '', '', '', '', R.planned, R.paid]);
    if (R.B.total != null) rows.push([t('Budget'), '', '', '', '', '', '', R.B.total]);
    this.downloadBlob(`${slugify(p.name)}_${t('budget')}_${todayStamp()}.csv`, new Blob(['﻿' + rows.map(r => r.map(q).join(';')).join('\r\n')], { type: 'text/csv' }));
  },
});
/** "1.234,50", "€ 1200", "1200.5" → a number (null when empty) */
function parseMoney(s) {
  let v = String(s == null ? '' : s).replace(/[€\s]/g, '');
  if (!v) return null;
  if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
  else v = v.replace(/,/g, '');
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}
const fmtQty = q => String(Math.round(q * 100) / 100);
