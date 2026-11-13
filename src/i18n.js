/* ───────────── i18n.js — words on screen in English, Dutch or Norwegian ─────────────
   t('English text') returns the text in the chosen language, or the English text when there is no translation
   yet. Placeholders: t('{n} pieces', { n: 3 }). New screens use t() everywhere, so a full Dutch and Norwegian
   translation can be filled in here later without touching the screens. */

const I18N = {
  lang: 'en',
  dict: {
    nl: {
      'Build': 'Bouwen', 'Furnish': 'Inrichten', 'View': 'Bekijken',
      'Build: walls, doors, windows and rooms': 'Bouwen: muren, deuren, ramen en kamers',
      'Furnish: furniture layouts': 'Inrichten: meubelindelingen',
      'View: look around, notes and walking': 'Bekijken: rondkijken, notities en lopen',
      'Select': 'Selecteren', 'Add': 'Toevoegen', 'Sets': 'Sets', 'Shopping': 'Boodschappen', 'Check space': 'Ruimte controleren',
      'Note': 'Notitie', 'Notes': 'Notities', 'Viewpoints': 'Standpunten', 'Walk': 'Lopen', 'Paths': 'Paden', 'Measure': 'Meten',
      'Layout': 'Indeling', 'Open door': 'Deur openen', 'Close door': 'Deur sluiten',
      'Day': 'Dag', 'Evening': 'Avond', 'Fast': 'Snel', 'Beautiful': 'Mooi',
      'Question': 'Vraag', 'To do': 'Te doen', 'Decision': 'Besluit', 'Idea': 'Idee', 'Problem': 'Probleem',
      'Open': 'Open', 'Done': 'Klaar', 'Exit': 'Stoppen', 'Free walk': 'Vrij lopen', 'Path walk': 'Over paden',
    },
    no: {
      'Build': 'Bygge', 'Furnish': 'Innrede', 'View': 'Vise',
      'Build: walls, doors, windows and rooms': 'Bygge: vegger, dører, vinduer og rom',
      'Furnish: furniture layouts': 'Innrede: møbleringer',
      'View: look around, notes and walking': 'Vise: se deg rundt, notater og gå',
      'Select': 'Velg', 'Add': 'Legg til', 'Sets': 'Sett', 'Shopping': 'Handleliste', 'Check space': 'Sjekk plass',
      'Note': 'Notat', 'Notes': 'Notater', 'Viewpoints': 'Utsiktspunkter', 'Walk': 'Gå', 'Paths': 'Stier', 'Measure': 'Mål',
      'Layout': 'Møblering', 'Open door': 'Åpne dør', 'Close door': 'Lukk dør',
      'Day': 'Dag', 'Evening': 'Kveld', 'Fast': 'Rask', 'Beautiful': 'Pen',
      'Question': 'Spørsmål', 'To do': 'Å gjøre', 'Decision': 'Beslutning', 'Idea': 'Idé', 'Problem': 'Problem',
      'Open': 'Åpen', 'Done': 'Ferdig', 'Exit': 'Avslutt', 'Free walk': 'Gå fritt', 'Path walk': 'Gå på stier',
    },
  },
};

function t(text, vars) {
  let out = text;
  if (I18N.lang !== 'en' && typeof text === 'string') {
    const d = I18N.dict[I18N.lang];
    if (d && d[text] != null) out = d[text];
    else if (d) {
      // ' and ' → the words without the spaces, the spaces kept
      const m = /^(\s*)(.*?)(\s*)$/s.exec(text);
      if (m && (m[1] || m[3]) && d[m[2]] != null) out = m[1] + d[m[2]] + m[3];
    }
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return out;
}
/** t under another name, for code where t means something else */
const tx = (text, vars) => t(text, vars);
function setLang(lang) {
  I18N.lang = ['nl', 'no'].includes(lang) ? lang : 'en';
  document.documentElement.lang = I18N.lang === 'no' ? 'nb' : I18N.lang;
  I18N.cache = new Map();
  I18N.pats = null;
}
/** the Dutch and Norwegian words, packed in the app (LANG_GZ); unpacked when one of them is chosen */
async function loadLangs() {
  if (I18N.loaded || typeof LANG_GZ === 'undefined') return;
  I18N.loaded = true;
  try {
    const all = JSON.parse(await gunzipBase64(LANG_GZ));
    for (const k of ['nl', 'no']) I18N.dict[k] = Object.assign(all[k] || {}, I18N.dict[k]);
  } catch (e) { console.warn('the translations could not be unpacked', e); }
  I18N.cache = new Map(); I18N.pats = null;
}
/** the locale for dates and times */
function i18nLocale() { return I18N.lang === 'nl' ? 'nl-NL' : I18N.lang === 'no' ? 'nb-NO' : undefined; }

/* ───────── translating what is on screen ─────────
   Most screens are written in English in the code. When Dutch or Norwegian is chosen, every text on screen (and
   the title, aria-label and placeholder of elements) is looked up in the dictionary as it appears. Texts with
   numbers or names in them are matched with the patterns in the dictionary ('{0} houses imported.'). Things the
   user typed (inputs) are never touched, nor anything inside translate="no". */
const I18N_ATTRS = ['title', 'aria-label', 'placeholder'];
function i18nEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function i18nPatterns() {
  if (I18N.pats) return I18N.pats;
  const d = I18N.dict[I18N.lang] || {};
  const P = { first: new Map(), last: new Map(), any: [] };
  for (const [k, v] of Object.entries(d)) {
    if (!/\{\w+\}/.test(k)) continue;
    const names = [];
    const src = k.split(/(\{\w+\})/).map(part => { const m = /^\{(\w+)\}$/.exec(part); if (m) { names.push(m[1]); return '(.+?)'; } return i18nEscape(part); }).join('');
    const pat = { re: new RegExp('^' + src + '$'), names, out: v, fixed: k.replace(/\{\w+\}/g, '').length };
    const toks = k.split(' ');
    const f = toks[0], l = toks[toks.length - 1];
    if (!/\{/.test(f)) { if (!P.first.has(f)) P.first.set(f, []); P.first.get(f).push(pat); }
    else if (!/\{/.test(l)) { if (!P.last.has(l)) P.last.set(l, []); P.last.get(l).push(pat); }
    else P.any.push(pat);
  }
  // longer (more specific) patterns first
  for (const list of [...P.first.values(), ...P.last.values(), P.any]) list.sort((a, b) => b.re.source.length - a.re.source.length);
  return (I18N.pats = P);
}
/** a text as shown (spaces already tidied) → its translation, or null */
function trText(s, depth = 0) {
  if (I18N.lang === 'en' || !s) return null;
  const C = I18N.cache;
  if (C.has(s)) return C.get(s);
  const d = I18N.dict[I18N.lang] || {};
  let out = d[s] != null ? d[s] : null;
  if (out == null && depth < 3 && /[A-Za-z]/.test(s)) {
    const tr = x => trText(x, depth + 1);
    let m;
    // pieces joined with " · " (Floor plan · Begane grond)
    if (s.includes(' · ')) {
      const parts = s.split(' · '), got = parts.map(tr);
      if (got.some(x => x != null)) out = parts.map((x, i) => got[i] ?? x).join(' · ');
    }
    // a shortcut or unit in brackets at the end (Select (V), Wall height (mm)), a number in front (1. Wall preparation)
    // or behind (Edit slice 2), a colon with something after it (Nieuw: …)
    else if ((m = /^(.*\S) (\([^()]{1,14}\))$/.exec(s)) && tr(m[1]) != null) out = tr(m[1]) + ' ' + m[2];
    else if ((m = /^(\d+\.\s*)(.+)$/.exec(s)) && tr(m[2]) != null) out = m[1] + tr(m[2]);
    else if ((m = /^(.*\D)\s+([\d.,]+[a-zA-Z²%]*)$/.exec(s)) && d[m[1]] != null) out = d[m[1]] + ' ' + m[2];
    if (out == null) {
      const P = i18nPatterns();
      const toks = s.split(' ');
      const cands = [...(P.first.get(toks[0]) || []), ...(P.last.get(toks[toks.length - 1]) || []), ...P.any];
      for (const p of cands) {
        m = p.re.exec(s);
        if (!m) continue;
        // a pattern with little fixed text ("Wall {l}") only takes values that look like a value: a number, a
        // name (capital), something quoted — not "height (mm)"
        const fixed = p.fixed / s.length;
        const groups = m.slice(1);
        if (fixed < 0.6 && !groups.every(g => /\d|[“”"'‘’]|^[A-ZÀ-Ý]/.test(g))) continue;
        const vals = {};
        p.names.forEach((n, i) => { const g = groups[i]; vals[n] = tr(g) || g; });
        out = p.out.replace(/\{(\w+)\}/g, (x, n) => (vals[n] != null ? vals[n] : x));
        break;
      }
    }
    if (out == null && (m = /^([^:]{2,30}): (.+)$/.exec(s))) {
      const h0 = tr(m[1] + ':'), h1 = h0 == null ? tr(m[1]) : null, rest = tr(m[2]);
      if (h0 != null || h1 != null || rest != null) out = (h0 != null ? h0 : (h1 != null ? h1 + ':' : m[1] + ':')) + ' ' + (rest ?? m[2]);
    }
  }
  if (C.size > 20000) C.clear();
  C.set(s, out);
  return out;
}
const I18N_SET = new WeakMap();
function trNode(n) {
  const raw = n.nodeValue;
  if (!raw || raw.length > 600 || I18N_SET.get(n) === raw || !/[A-Za-z]/.test(raw)) return;
  const p = n.parentNode;
  if (!p || p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || p.nodeName === 'TEXTAREA' || (p.closest && p.closest('[translate="no"]'))) return;
  const o = trText(raw.replace(/\s+/g, ' ').trim());
  if (o == null) return;
  const lead = /^\s*/.exec(raw)[0], trail = /\s*$/.exec(raw)[0];
  const v = lead + o + trail;
  I18N_SET.set(n, v);
  if (v !== raw) n.nodeValue = v;
}
function trAttrs(el) {
  for (const a of I18N_ATTRS) {
    const v = el.getAttribute(a);
    if (!v || !/[A-Za-z]/.test(v)) continue;
    const o = trText(v.replace(/\s+/g, ' ').trim());
    if (o != null && o !== v) el.setAttribute(a, o);
  }
}
function trTree(root) {
  if (!root) return;
  if (root.nodeType === 3) return trNode(root);
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { if (root.getAttribute('translate') === 'no') return; trAttrs(root); }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: n => (n.nodeType === 1 && (n.getAttribute('translate') === 'no' || n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let n;
  while ((n = w.nextNode())) { if (n.nodeType === 3) trNode(n); else trAttrs(n); }
}
/** start translating the page (once, when the language is not English) */
function i18nWatch() {
  if (I18N.lang === 'en' || I18N.watching) return;
  I18N.watching = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') for (const n of m.addedNodes) trTree(n);
      else if (m.type === 'characterData') trNode(m.target);
      else if (m.type === 'attributes') trAttrs(m.target);
    }
  });
  I18N.watching.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
  trTree(document.body);
}
const LANGS = [['en', 'English'], ['nl', 'Nederlands'], ['no', 'Norsk']];

/** money in euros, Dutch style: € 1.234,50 (whole euros without decimals) */
function fmtEuro(v) {
  if (v == null || !isFinite(v)) return '—';
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return '€ ' + Number(v).toLocaleString('nl-NL', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}
