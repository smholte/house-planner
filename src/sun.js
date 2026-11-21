/* ───────────── sun.js — north and the sun ─────────────
   The sun for a date and a time on the clock (Dutch summer time from the last Sunday of March to the last Sunday
   of October), at the house's place (project.site lat / lon), turned to the plan with
   site.north. In 3D the light "Sun" puts the sun there, with its shadows; "Sun hours" works out, for a day, when
   the sun shines into each room and how many hours each part of the garden gets: the house (and the garden's
   walls, hedges and trees) is drawn from the sun's side into a depth picture every half hour. */

const SUN_YEAR = 2026;
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** the Dutch rule, kept as the fallback of the clock below */
function dstOffsetNL(dateUTC) {
  const y = dateUTC.getUTCFullYear();
  const lastSunday = m => { const d = new Date(Date.UTC(y, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d; };
  return dateUTC >= lastSunday(2) && dateUTC < lastSunday(9) ? 2 : 1;
}

/* ── the place of the house and the clock there ──
   A place is { lat, lon, tz } (tz: a time zone name such as "Europe/Oslo", or "UTC+5.5"; empty = guessed from the place).
   The clock the app shows is the clock at the house: the browser's own time zone data (Intl) gives the offset and summer
   time of the zone for any date, offline. */
const PLACE_DEFAULT = { lat: 52.1, lon: 5.1 };
/** the main towns of Europe with their zones – a place takes the zone of the nearest one (borders are not drawn) */
const ZONE_TOWNS = [
  ['Europe/Amsterdam', 52.4, 4.9], ['Europe/Brussels', 50.85, 4.35], ['Europe/Berlin', 52.5, 13.4], ['Europe/Oslo', 59.9, 10.75],
  ['Europe/Stockholm', 59.3, 18.1], ['Europe/Copenhagen', 55.7, 12.6], ['Europe/London', 51.5, -0.1], ['Europe/Dublin', 53.3, -6.3],
  ['Europe/Paris', 48.9, 2.35], ['Europe/Madrid', 40.4, -3.7], ['Europe/Lisbon', 38.7, -9.1], ['Europe/Rome', 41.9, 12.5],
  ['Europe/Vienna', 48.2, 16.4], ['Europe/Zurich', 47.4, 8.5], ['Europe/Warsaw', 52.2, 21], ['Europe/Prague', 50.1, 14.4],
  ['Europe/Helsinki', 60.2, 25], ['Europe/Oslo', 69.65, 18.96], ['Europe/Oslo', 63.4, 10.4], ['Europe/Oslo', 60.4, 5.3], ['Europe/Oslo', 58.15, 8],
  ['Europe/Stockholm', 67.85, 20.2], ['Europe/Stockholm', 57.7, 11.97], ['Europe/Helsinki', 66.5, 25.7], ['Europe/London', 57.5, -4.2], ['Europe/Madrid', 41.4, 2.15], ['Europe/Paris', 43.3, 5.4], ['Europe/Athens', 38, 23.7], ['Atlantic/Reykjavik', 64.1, -21.9], ['Europe/Istanbul', 41, 29],
];
/** the zone of a place: its own choice, else the nearest town of Europe (within 1,800 km), else a fixed offset from the longitude */
function guessZone(lat, lon) {
  let best = null, bd = 1e9;
  for (const [z, la, lo] of ZONE_TOWNS) {
    const dx = (lon - lo) * Math.cos((lat + la) / 2 * Math.PI / 180), dy = lat - la, d = Math.hypot(dx, dy) * 111;
    if (d < bd) { bd = d; best = z; }
  }
  if (bd <= 1800) return best;
  const o = Math.round(lon / 15);
  return 'UTC' + (o < 0 ? '-' : '+') + Math.abs(o);
}
const zoneOf = pl => (pl && pl.tz) || (pl && pl.lat != null && pl.lon != null ? guessZone(pl.lat, pl.lon) : 'Europe/Amsterdam');
const _zoneFmt = {};
/** minutes the zone is ahead of UTC at the moment ms (UTC) */
function zoneOffsetMin(tz, ms) {
  const m = /^UTC([+-]\d+(?:\.\d+)?)$/.exec(tz);
  if (m) return Math.round(+m[1] * 60);
  try {
    const f = _zoneFmt[tz] || (_zoneFmt[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
    const o = {};
    for (const x of f.formatToParts(new Date(ms))) o[x.type] = +x.value;
    return Math.round((Date.UTC(o.year, o.month - 1, o.day, o.hour % 24, o.minute, o.second) - Math.floor(ms / 1000) * 1000) / 60000);
  } catch (e) { return dstOffsetNL(new Date(ms)) * 60; }
}
/** a clock time at the place (written as if it were UTC, in ms) → the moment (ms, UTC) */
function localToUtc(pl, localMs) {
  const tz = zoneOf(pl);
  const u1 = localMs - zoneOffsetMin(tz, localMs - 3 * 3600000) * 60000;
  return localMs - zoneOffsetMin(tz, u1) * 60000;
}
const offsetWords = min => (min < 0 ? '-' : '+') + String(Math.floor(Math.abs(min) / 60)).padStart(2, '0') + ':' + String(Math.abs(min) % 60).padStart(2, '0');
/** the place of a project: its own (p.place), else the site plan's (a house's own site), else none (the middle of the Netherlands) */
function placeOf(p) {
  const pl = p && p.place, s = p && p.site;
  if (pl && isFinite(pl.lat) && isFinite(pl.lon)) return { lat: pl.lat, lon: pl.lon, tz: pl.tz || '', set: true, fromSite: false };
  if (s && isFinite(s.lat) && isFinite(s.lon) && (s.from || !(s.lat === PLACE_DEFAULT.lat && s.lon === PLACE_DEFAULT.lon))) return { lat: s.lat, lon: s.lon, tz: s.tz || '', set: true, fromSite: !!s.from };
  return { ...PLACE_DEFAULT, tz: '', set: false, fromSite: false };
}
/** the clock at the place right now, in minutes since midnight */
function clockNow(pl) { const ms = Date.now(); return Math.floor(((ms + zoneOffsetMin(zoneOf(pl), ms) * 60000) / 60000) % 1440 + 1440) % 1440; }
/** a day of the year (1 … 365) and minutes on the clock at the place (the Netherlands without one) → the moment (UTC) */
function sunMoment(doy, minutes, pl) {
  const local = Date.UTC(SUN_YEAR, 0, 1) + (doy - 1) * 86400000 + minutes * 60000;
  return new Date(localToUtc(pl, local));
}
/** what the app reads from a pasted map link or coordinates: { lat, lon }, { short: true } (a link that only names a map), or null */
function parsePlace(text) {
  let s = String(text || '').trim();
  if (!s) return null;
  try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { /* keep as it is */ }
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const ok = (la, lo) => { la = +la; lo = +lo; return isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? { lat: la, lon: lo } : null; };
  const pairs = [
    new RegExp('!3d' + num + '!4d' + num),                                   // Google: the pin
    new RegExp('[?&#](?:mlat)=' + num + '.*?[&]mlon=' + num),                // OpenStreetMap: a marker
    new RegExp('#map=\\d+(?:\\.\\d+)?/' + num + '/' + num),                    // OpenStreetMap: the view
    new RegExp('[?&](?:ll|q|query|sll|coordinate|center|destination|daddr|saddr)=' + num + '\\s*,\\s*' + num),   // Google, Apple
    new RegExp('@' + num + ',' + num),                                       // Google: the view
    new RegExp('/place/' + num + ',' + num),
    new RegExp('^geo:' + num + ',' + num),
    new RegExp('^\\(?\\s*' + num + '\\s*[,; ]\\s*' + num + '\\s*\\)?$'),             // plain "52.09, 5.12"
  ];
  for (const re of pairs) { const m = re.exec(s); if (m) { const r = ok(m[1], m[2]); if (r) return r; } }
  // degrees, minutes, seconds as Google shows them: 52°05'26.5"N 5°07'17.0"E
  const dms = /(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)?\s*["″]?\s*([NS])[\s,;]+(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)?\s*["″]?\s*([EW])/i.exec(s);
  if (dms) {
    const f = (d, m, sec, h) => (+d + +m / 60 + (+sec || 0) / 3600) * (/[SW]/i.test(h) ? -1 : 1);
    const r = ok(f(dms[1], dms[2], dms[3], dms[4]), f(dms[5], dms[6], dms[7], dms[8]));
    if (r) return r;
  }
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co|bit\.ly|apple\.co|maps\.apple\.com\/p\/)/i.test(s) || /^https?:\/\/\S+$/.test(s)) return { short: true };
  return null;
}
/** where the sun is: azimuth (degrees from north, clockwise) and elevation above the horizon (NOAA formulas) */
function sunPosition(lat, lon, date) {
  const rad = Math.PI / 180;
  const doy = Math.floor((date - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = 2 * Math.PI / 365 * (doy - 1 + (hour - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = ((hour * 60 + eqt + 4 * lon) / 4 - 180) * rad;
  const phi = lat * rad;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const el = 90 - Math.acos(clamp(cosZ, -1, 1)) / rad;
  const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / rad + 180 + 360) % 360;
  return { az, el };
}
/** a compass bearing (degrees from north) as a direction on the plan */
function planDir(site, bearing) { const b = ((site && site.north) || 0) + bearing; const r = b * Math.PI / 180; return [Math.sin(r), -Math.cos(r)]; }
/** towards the sun, in 3D */
function sunVector(site, s) { const d = planDir(site, s.az), e = s.el * Math.PI / 180; return new THREE.Vector3(Math.cos(e) * d[0], Math.sin(e), Math.cos(e) * d[1]); }
const compassWord = az => COMPASS[Math.round(((az % 360) + 360) % 360 / 45) % 8];
function doyOf(date) { return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 86400000) + 1; }
function fmtDoy(doy) { const d = new Date(Date.UTC(SUN_YEAR, 0, doy)); return d.getUTCDate() + ' ' + t(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]); }
const fmtClock = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m % 60)).padStart(2, '0');
/** sunrise and sunset on the clock (minutes), to 5 minutes */
function sunTimes(site, doy) {
  const lat = site && site.lat != null ? site.lat : PLACE_DEFAULT.lat, lon = site && site.lon != null ? site.lon : PLACE_DEFAULT.lon;
  const up = m => sunPosition(lat, lon, sunMoment(doy, m, site)).el > -0.83;
  let rise = null, set = null, prev = null;
  for (let m = 180; m <= 1380; m += 5) {
    const u = up(m);
    if (prev === false && u && rise == null) rise = m;
    if (prev === true && !u) set = m;
    prev = u;
  }
  // to the minute
  if (rise != null) { let m = rise - 5; while (m < rise && !up(m + 1)) m++; rise = m + 1; }
  if (set != null) { let m = set - 5; while (m < set && up(m + 1)) m++; set = m + 1; }
  return { rise, set };
}

Object.assign(View3D.prototype, {
  /** the sun at s = { az, el } (null: the normal day light) */
  applySun(s) {
    this.sunInfo = s || null;
    this._aeLight = true;   // (the exposure measured again: autoexp.js)
    if (!s || this.evening) return;
    const c = this._sunC || new THREE.Vector3(), R = this._sunR || 20;
    if (s.el <= 0) {
      // the sun is down: dusk
      this.sun.intensity = 0; this.sun.castShadow = false;
      this.hemi.color.set('#a9b6cf'); this.hemi.groundColor.set('#3a3530'); this.hemi.intensity = 0.55;
    } else {
      const dir = sunVector(this.spec && this.spec.siteSun, s);
      this.sun.position.copy(c).addScaledVector(dir, R * 2.5);
      this.sun.target.position.copy(c);
      this.sun.target.updateMatrixWorld();
      const k = clamp(Math.sin(s.el * Math.PI / 180) * 2.4, 0, 1);
      this.sun.intensity = 0.45 + 1.2 * k;
      this.sun.color.set('#ffb070').lerp(new THREE.Color('#fff6ea'), k);
      this.sun.castShadow = !this.fast;
      this.hemi.color.set(0xffffff); this.hemi.groundColor.set(0xcfcac2); this.hemi.intensity = 0.75 + 0.7 * k;
      const sc = this.sun.shadow.camera;
      sc.far = R * 6; sc.updateProjectionMatrix();
    }
    this.needs = true;
  },
});

Object.assign(app, {
  sunSettings() {
    const s = this.settings;
    if (s.sunDay == null) s.sunDay = doyOf(new Date());
    if (s.sunTime == null) s.sunTime = 14 * 60;
    return { day: s.sunDay, time: s.sunTime };
  },
  /** the sun now set in the sun bar, at this house */
  sunNow() {
    const pl = this.placeNow();
    const { day, time } = this.sunSettings();
    return sunPosition(pl.lat, pl.lon, sunMoment(day, time, pl));
  },
  /** the place of the open house (placeOf) */
  placeNow() { return placeOf(this.project); },
  sunSpec() { return this.settings.light === 'sun' ? { sun: this.sunNow(), siteSun: this.project.site || null } : {}; },
  updateSun() {
    const s = this.sunNow();
    for (const pn of this.panes) if (pn.kind === '3d' && pn.view.applySun) pn.view.applySun(s);
    const r = $('#sun-readout');
    if (r) r.textContent = this.sunWords(s);
  },
  sunWords(s) {
    if (s.el <= 0) return t('The sun is down.');
    return t('Sun from the {d}, {e}° high', { d: t(compassWord(s.az)), e: Math.round(s.el) });
  },

  /** the bar over the 3D view when the light is "Sun": the day, the time, play the day, sun hours. The sun at its left
   *  folds it away (to just the sun) and back; it is open each time the light is set to Sun. A tap on the day or the
   *  time opens a picker (a month to tap a day in; hours and minutes) */
  sunBar() {
    const { day, time } = this.sunSettings();
    const site = this.project.site;
    const dayLab = h('button', { class: 'sun-lab', id: 'sun-day-lab', type: 'button', title: t('Choose the day'), onclick: () => this.sunDayPicker() }, fmtDoy(day));
    const timeLab = h('button', { class: 'sun-lab', id: 'sun-time-lab', type: 'button', title: t('Choose the time'), onclick: () => this.sunTimePicker() }, fmtClock(time));
    const dayIn = h('input', { type: 'range', id: 'sun-day', min: '1', max: '365', step: '1', value: String(day), 'aria-label': t('Day of the year') });
    const timeIn = h('input', { type: 'range', id: 'sun-time', min: '240', max: '1380', step: '5', value: String(time), 'aria-label': t('Time of day') });
    dayIn.addEventListener('input', () => this.setSunDay(+dayIn.value));
    timeIn.addEventListener('input', () => this.setSunTime(+timeIn.value));
    dayIn.addEventListener('change', () => Settings.save());
    timeIn.addEventListener('change', () => Settings.save());
    const play = h('button', { class: 'btn sm icon', id: 'sun-play', 'aria-label': t('Play the day'), title: t('Play the day') }, icon('play'));
    play.onclick = () => {
      if (this._sunAnim) { cancelAnimationFrame(this._sunAnim); this._sunAnim = null; play.replaceChildren(icon('play')); return; }
      const { rise, set } = sunTimes(this.placeNow(), this.settings.sunDay);
      let m = Math.max(rise || 300, +timeIn.value >= (set || 1320) - 10 ? (rise || 300) : +timeIn.value);
      let last = performance.now();
      play.replaceChildren(icon('pause'));
      const step = now => {
        m += (now - last) / 1000 * 90;   // 90 minutes a second
        last = now;
        if (m >= (set || 1320)) { m = set || 1320; this._sunAnim = null; play.replaceChildren(icon('play')); }
        this.setSunTime(Math.round(m));
        if (this._sunAnim !== null && m < (set || 1320)) this._sunAnim = requestAnimationFrame(step);
      };
      this._sunAnim = requestAnimationFrame(step);
    };
    const folded = !!this._sunFold;
    const fold = h('button', { class: 'btn sm icon sun-ic', id: 'sun-fold', type: 'button' }, icon('sun'));
    const bar = h('div', { class: 'modebar sun-bar' + (folded ? ' folded' : '') },
      fold,
      h('span', { class: 'sun-field' }, dayLab, dayIn),
      h('span', { class: 'sun-field' }, timeLab, timeIn),
      play,
      h('span', { class: 'sun-readout', id: 'sun-readout' }, this.sunWords(this.sunNow())),
      h('span', { class: 'hint hide-xs', id: 'sun-times' }, this.sunTimesWords(day)),
      h('button', { class: 'btn sm', id: 'sun-hours', onclick: () => this.sunHoursSheet() }, icon('table'), t('Sun hours')),
      h('button', { class: 'btn sm', id: 'sun-place', title: t('Place of the house'), onclick: () => this.placeDialog() }, icon('pin'), h('span', { class: 'hide-xs' }, t('Location'))));
    const label = () => {
      const f = bar.classList.contains('folded');
      fold.setAttribute('aria-expanded', String(!f));
      fold.setAttribute('aria-label', f ? t('Show the sun bar') : t('Fold the sun bar away'));
      fold.title = f ? t('Show the sun bar') : t('Fold the sun bar away');
    };
    fold.onclick = () => { this._sunFold = !bar.classList.contains('folded'); bar.classList.toggle('folded', this._sunFold); label(); if (this.overlayPush) this.overlayPush(); };
    label();
    return bar;
  },
  sunTimesWords(day) {
    const tm = sunTimes(this.placeNow(), day);
    return tm.rise ? t('Sunrise {a}, sunset {b}', { a: fmtClock(tm.rise), b: fmtClock(tm.set) }) : '';
  },
  /** the day (1 … 365) and the time (minutes): the sun, the bar's sliders and words follow */
  setSunDay(doy) {
    this.settings.sunDay = clamp(Math.round(doy), 1, 365);
    const i = $('#sun-day'), l = $('#sun-day-lab'), w = $('#sun-times');
    if (i) i.value = String(this.settings.sunDay);
    if (l) l.textContent = fmtDoy(this.settings.sunDay);
    if (w) w.textContent = this.sunTimesWords(this.settings.sunDay);
    this.updateSun();
  },
  setSunTime(min) {
    this.settings.sunTime = clamp(Math.round(min), 240, 1380);
    const i = $('#sun-time'), l = $('#sun-time-lab');
    if (i) i.value = String(this.settings.sunTime);
    if (l) l.textContent = fmtClock(this.settings.sunTime);
    this.updateSun();
  },
  /** the day: a month to tap a day in (the year doesn't matter for the sun); the sun follows while you choose */
  async sunDayPicker() {
    const d0 = this.sunSettings().day, today = clamp(doyOf(new Date()), 1, 365), loc = i18nLocale();
    let sel = d0, month = new Date(Date.UTC(SUN_YEAR, 0, d0)).getUTCMonth();
    const fLong = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const fMonth = new Intl.DateTimeFormat(loc, { month: 'long', timeZone: 'UTC' });
    const fWk = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' });
    const doyAt = (m, d) => Math.round((Date.UTC(SUN_YEAR, m, d) - Date.UTC(SUN_YEAR, 0, 1)) / 86400000) + 1;
    const head = h('div', { class: 'dp-head', id: 'dp-head' });
    const mLab = h('span', { class: 'dp-month', id: 'dp-month' });
    const grid = h('div', { class: 'dp-grid', id: 'dp-grid' });
    const pick = doy => { sel = doy; this.setSunDay(sel); paint(); };
    const paint = () => {
      head.textContent = fLong.format(new Date(Date.UTC(SUN_YEAR, 0, sel)));
      mLab.textContent = fMonth.format(new Date(Date.UTC(SUN_YEAR, month, 1)));
      grid.textContent = '';
      // the week from Monday (1 Jan 2024 was a Monday)
      for (let i = 0; i < 7; i++) grid.appendChild(h('span', { class: 'dp-wk' }, fWk.format(new Date(Date.UTC(2024, 0, 1 + i)))));
      const first = (new Date(Date.UTC(SUN_YEAR, month, 1)).getUTCDay() + 6) % 7, days = new Date(Date.UTC(SUN_YEAR, month + 1, 0)).getUTCDate();
      for (let i = 0; i < first; i++) grid.appendChild(h('span'));
      for (let d = 1; d <= days; d++) {
        const doy = doyAt(month, d);
        grid.appendChild(h('button', { type: 'button', class: 'dp-day' + (doy === today ? ' today' : ''), 'aria-pressed': String(doy === sel), 'data-doy': String(doy), onclick: () => pick(doy) }, String(d)));
      }
    };
    const nav = (dm, lab) => h('button', { type: 'button', class: 'btn ghost icon sm dp-nav', id: dm < 0 ? 'dp-prev' : 'dp-next', 'aria-label': lab, title: lab, onclick: () => { month = (month + dm + 12) % 12; paint(); } }, icon(dm < 0 ? 'back' : 'forward'));
    const quick = (lab, doy) => h('button', { type: 'button', class: 'chip', onclick: () => { month = new Date(Date.UTC(SUN_YEAR, 0, doy)).getUTCMonth(); pick(doy); } }, lab);
    const body = h('div', { class: 'dpick' }, head,
      h('div', { class: 'dp-bar' }, mLab, h('span', { class: 'spacer' }), nav(-1, t('Previous month')), nav(1, t('Next month'))),
      grid,
      h('div', { class: 'dp-quick' }, quick(t('Today'), today), quick(t('Longest day'), doyAt(5, 21)), quick(t('Shortest day'), doyAt(11, 21))));
    paint();
    const ok = await UI.dialog({ title: t('Choose the day'), body, enterKey: true, dismissValue: false,
      actions: [{ label: t('Cancel'), value: false }, { label: t('OK'), value: true, kind: 'primary' }] });
    if (!ok) this.setSunDay(d0);
    Settings.save();
  },
  /** the time: an hour and the minutes (4:00 – 23:00, as the slider), or now, sunrise, the sun highest, sunset */
  async sunTimePicker() {
    const m0 = this.sunSettings().time;
    let hr = Math.floor(m0 / 60), mi = Math.round(m0 % 60 / 5) * 5;
    if (mi === 60) { hr++; mi = 0; }
    const head = h('div', { class: 'dp-head tp-head', id: 'tp-head' });
    const hours = h('div', { class: 'tp-grid tp-hours', id: 'tp-hours' }), mins = h('div', { class: 'tp-grid tp-mins', id: 'tp-mins' });
    const set = (H, M) => { hr = H; mi = H >= 23 ? 0 : M; this.setSunTime(hr * 60 + mi); paint(); };
    const paint = () => {
      head.textContent = fmtClock(hr * 60 + mi);
      hours.textContent = ''; mins.textContent = '';
      for (let H = 4; H <= 23; H++) hours.appendChild(h('button', { type: 'button', class: 'tp-btn', 'aria-pressed': String(H === hr), 'data-h': String(H), onclick: () => set(H, mi) }, String(H).padStart(2, '0')));
      for (let M = 0; M < 60; M += 5) mins.appendChild(h('button', { type: 'button', class: 'tp-btn', 'aria-pressed': String(M === mi), 'data-m': String(M), disabled: hr >= 23 && M > 0, onclick: () => set(hr, M) }, ':' + String(M).padStart(2, '0')));
    };
    const tm = sunTimes(this.placeNow(), this.settings.sunDay);
    const quick = (lab, m) => m == null ? null : h('button', { type: 'button', class: 'chip', onclick: () => { const c = clamp(Math.round(m / 5) * 5, 240, 1380); set(Math.floor(c / 60), c % 60); } }, lab);
    const body = h('div', { class: 'dpick tpick' }, head,
      h('div', { class: 'tp-cap' }, t('Hour')), hours,
      h('div', { class: 'tp-cap' }, t('Minutes')), mins,
      h('div', { class: 'dp-quick' }, quick(t('Now'), clockNow(this.placeNow())), quick(t('Sunrise'), tm.rise), quick(t('Sun highest'), tm.rise != null && tm.set != null ? (tm.rise + tm.set) / 2 : null), quick(t('Sunset'), tm.set)));
    paint();
    const ok = await UI.dialog({ title: t('Choose the time'), body, enterKey: true, dismissValue: false,
      actions: [{ label: t('Cancel'), value: false }, { label: t('OK'), value: true, kind: 'primary' }] });
    if (!ok) this.setSunTime(m0);
    Settings.save();
  },

  /** for one day: the half hours of sun in each room (through the windows) and the hours of sun in the garden */
  async computeSunHours(doy, opts = {}) {
    const p = this.project, site = p.site;
    const pl = this.placeNow(), lat = pl.lat, lon = pl.lon;
    const dv = this.drawingScene(null, false, true);
    if (!dv) return null;
    dv.group.updateMatrixWorld(true);
    const v = this.shownVersion(), plan = v.plan;
    // the points: in each room at 0.6 and 1.2 m on a 1 m grid; in the garden at 0.3 m on a grid
    const rooms = [];
    for (const st of sortedStoreys(p)) for (const r of plan.rooms) {
      if (r.storey !== st.id || r.poly.length < 3) continue;
      const bb = bboxOfPoints(r.poly), pts = [];
      const step = Math.max(0.5, Math.min(1, Math.sqrt(roomArea(r)) / 4));
      for (let x = bb.minX + step / 2; x < bb.maxX; x += step) for (let y = bb.minY + step / 2; y < bb.maxY; y += step) {
        if (!pointInPolygon([x, y], r.poly)) continue;
        // not right against a wall
        let near = false;
        for (let i = 0; i < r.poly.length; i++) if (projectOnSegment([x, y], r.poly[i], r.poly[(i + 1) % r.poly.length]).d < 0.25) { near = true; break; }
        if (near) continue;
        for (const hh of [0.6, 1.2]) pts.push(new THREE.Vector3(x, st.elevation + hh, y));
      }
      if (!pts.length) { const lp = labelPoint(r.poly, []); pts.push(new THREE.Vector3(lp[0], st.elevation + 1, lp[1])); }
      rooms.push({ room: r, storey: st, pts, lit: [] });
    }
    const garden = [];
    if (site) {
      const bb = bboxOfPoints(site.plot), gs = opts.gardenStep || 1;
      const low = lowestStorey(p);
      const inside = (q) => plan.rooms.some(r => r.storey === low.id && pointInPolygon(q, r.poly));
      for (let x = bb.minX + gs / 2; x < bb.maxX; x += gs) for (let y = bb.minY + gs / 2; y < bb.maxY; y += gs) {
        if (!pointInPolygon([x, y], site.plot) || inside([x, y])) continue;
        garden.push({ x, y, p: new THREE.Vector3(x, (site.level ?? -0.15) + 0.3, y), hours: 0 });
      }
    }
    // the depth picture from the sun
    const N = opts.size || 1024;
    const r = dv.renderer;
    const rt = new THREE.WebGLRenderTarget(N, N);
    const depthMat = new THREE.ShaderMaterial({
      uniforms: { near: { value: 0 }, far: { value: 1 } },
      vertexShader: 'uniform float near; uniform float far; varying float vD; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = (-mv.z - near) / (far - near); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vD; void main() { float d = clamp(vD, 0.0, 0.99999); vec3 e = fract(d * vec3(1.0, 255.0, 65025.0)); e -= e.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0); gl_FragColor = vec4(e, 1.0); }',
      side: THREE.DoubleSide,
    });
    const hidden = [];
    dv.group.traverse(o => { if (o.isMesh && o.material) { const m = Array.isArray(o.material) ? o.material[0] : o.material; if ((m.transparent && m.opacity < 0.95) || o.userData.water) { hidden.push(o); } } if (o.isLineSegments || o.isLine || o.isSprite) hidden.push(o); });
    const all = rooms.flatMap(x => x.pts).concat(garden.map(g => g.p));
    const box = new THREE.Box3().setFromPoints(all);
    dv.group.traverse(o => { if (o.isMesh && o.geometry && !o.userData.garden) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); } });
    const houseBox = new THREE.Box3().setFromObject(dv.group);
    box.union(houseBox);
    const center = box.getCenter(new THREE.Vector3()), radius = box.getSize(new THREE.Vector3()).length() / 2 + 2;
    const cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, radius * 4);
    const buf = new Uint8Array(N * N * 4);
    const steps = [];
    const prevBg = dv.scene.background;
    dv.scene.background = null;
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    try {
      for (const o of hidden) o.visible = false;
      dv.scene.overrideMaterial = depthMat;
      r.setClearColor(0xffffff, 1);
      for (let m = 4 * 60; m <= 22 * 60 + 30; m += 30) {
        const s = sunPosition(lat, lon, sunMoment(doy, m, pl));
        if (s.el < 1.5) { steps.push({ m, up: false }); continue; }
        const dir = sunVector(site, s);
        cam.position.copy(center).addScaledVector(dir, radius * 2);
        cam.lookAt(center);
        cam.updateMatrixWorld(true);
        cam.near = 0.1; cam.far = radius * 4; cam.updateProjectionMatrix();
        depthMat.uniforms.near.value = cam.near; depthMat.uniforms.far.value = cam.far;
        r.setRenderTarget(rt);
        r.clear();
        r.render(dv.scene, cam);
        r.readRenderTargetPixels(rt, 0, 0, N, N, buf);
        r.setRenderTarget(null);
        const lit = q => {
          const c = q.clone().project(cam);
          const px = Math.floor((c.x * 0.5 + 0.5) * N), py = Math.floor((c.y * 0.5 + 0.5) * N);
          if (px < 0 || py < 0 || px >= N || py >= N) return true;
          const qd = (q.clone().applyMatrix4(cam.matrixWorldInverse).z * -1 - cam.near) / (cam.far - cam.near);
          // the nearest thing between the point and the sun
          const i = (py * N + px) * 4;
          const near = buf[i] / 255 + buf[i + 1] / (255 * 255) + buf[i + 2] / (255 * 65025);
          return qd <= near + 0.06 / (cam.far - cam.near);
        };
        for (const R of rooms) { let n = 0; for (const q of R.pts) if (lit(q)) n++; R.lit.push(n / R.pts.length); }
        for (const g of garden) if (lit(g.p)) g.hours += 0.5;
        steps.push({ m, up: true, s });
        if (opts.onProgress) opts.onProgress(m);
        await new Promise(res => setTimeout(res, 0));
      }
    } finally {
      dv.scene.overrideMaterial = null;
      for (const o of hidden) o.visible = true;
      dv.scene.background = prevBg;
      r.setClearColor(prevClear, prevAlpha);
      r.setRenderTarget(null);
      rt.dispose(); depthMat.dispose();
      for (const pn of this.panes) if (pn.view && pn.view !== dv) pn.view.needs = true;
    }
    // per room: the half hours with sun (at least 5 % of the room)
    const upSteps = steps.filter(x => x.up);
    for (const R of rooms) {
      R.periods = [];
      R.hours = 0;
      let k = 0;
      for (const st2 of steps) {
        if (!st2.up) continue;
        const f = R.lit[k++];
        st2.f = f;
        if (f >= 0.05) { R.hours += 0.5; const last = R.periods[R.periods.length - 1]; if (last && last[1] === st2.m) last[1] = st2.m + 30; else R.periods.push([st2.m, st2.m + 30]); }
      }
    }
    return { doy, rooms, garden, steps, upSteps: upSteps.length, times: sunTimes(pl, doy) };
  },

  async sunHoursSheet() {
    const p = this.project;
    const body = h('div', { class: 'sunh' });
    let doy = this.sunSettings().day;
    const daySel = h('select', { class: 'select', id: 'sunh-day' }, ...[[doyOf(new Date(SUN_YEAR, 2, 21)), t('21 March (spring)')], [doyOf(new Date(SUN_YEAR, 5, 21)), t('21 June (longest day)')], [doyOf(new Date(SUN_YEAR, 8, 23)), t('23 September (autumn)')], [doyOf(new Date(SUN_YEAR, 11, 21)), t('21 December (shortest day)')]]
      .concat([[doy, t('The day in the sun bar ({d})', { d: fmtDoy(doy) })]]).map(([d, lab], i, arr) => h('option', { value: String(d), selected: i === arr.length - 1 }, lab)));
    const out = h('div', { class: 'sunh-out' });
    const run = async () => {
      doy = +daySel.value;
      out.replaceChildren(h('div', { class: 'sunh-busy' }, h('span', { class: 'spinner' }), h('span', { id: 'sunh-prog' }, t('Following the sun …'))));
      const res = await this.computeSunHours(doy, { onProgress: m => { const e = $('#sunh-prog'); if (e) e.textContent = t('Following the sun … {t}', { t: fmtClock(m) }); } });
      this.dropDrawingView();
      if (!res) { out.replaceChildren(h('p', { class: 'note-muted' }, t('This needs 3D, which this device does not have.'))); return; }
      this._sunHours = res;
      out.replaceChildren(this.sunHoursView(res));
    };
    daySel.addEventListener('change', run);
    body.append(h('div', { class: 'field' }, h('label', { for: 'sunh-day' }, t('Day')), daySel), out);
    setTimeout(run, 30);
    await UI.dialog({ title: t('Sun hours'), body, wide: true, enterKey: false, actions: [] });
    this.dropDrawingView();
    this.refreshViews(false);
  },

  sunHoursView(res) {
    const box = h('div', { class: 'sunh-res' });
    const t0 = 4 * 60, t1 = 23 * 60, W = 220;
    const xOf = m => ((m - t0) / (t1 - t0)) * W;
    box.appendChild(h('p', { class: 'note-muted' }, res.times.rise ? t('{d}: sunrise {a}, sunset {b}. Sun in a room = the sun shines on at least a twentieth of the room (through the windows), each half hour.', { d: fmtDoy(res.doy), a: fmtClock(res.times.rise), b: fmtClock(res.times.set) }) : ''));
    const tbl = h('div', { class: 'sunh-rooms' });
    let lastSt = null;
    for (const R of res.rooms) {
      if (R.storey !== lastSt) { tbl.appendChild(h('div', { class: 'sunh-st' }, R.storey.name)); lastSt = R.storey; }
      const svg = s('svg', { class: 'sunh-bar', viewBox: `0 0 ${W} 12`, width: W, height: 12 });
      svg.appendChild(s('rect', { x: 0, y: 3, width: W, height: 6, class: 'sunh-track' }));
      if (res.times.rise) svg.appendChild(s('rect', { x: xOf(res.times.rise), y: 3, width: Math.max(0, xOf(res.times.set) - xOf(res.times.rise)), height: 6, class: 'sunh-day' }));
      for (const [a, b] of R.periods) svg.appendChild(s('rect', { x: xOf(a), y: 1, width: Math.max(1, xOf(b) - xOf(a)), height: 10, class: 'sunh-sun' }));
      for (const hh of [6, 9, 12, 15, 18, 21]) svg.appendChild(s('line', { x1: xOf(hh * 60), x2: xOf(hh * 60), y1: 0, y2: 12, class: 'sunh-tick' }));
      tbl.appendChild(h('div', { class: 'sunh-row', 'data-room': R.room.id },
        h('span', { class: 'sunh-name' }, R.room.name),
        svg,
        h('span', { class: 'sunh-h' }, R.hours ? (fmtDec(String(R.hours)) + ' h') : '–'),
        h('span', { class: 'sunh-when' }, R.periods.map(([a, b]) => fmtClock(a) + '–' + fmtClock(b)).join(', '))));
    }
    tbl.appendChild(h('div', { class: 'sunh-axis' }, h('span'), h('span', { class: 'sunh-axis-lab' }, ...[6, 12, 18].map(hh => h('i', { style: { left: (xOf(hh * 60) / W * 100) + '%' } }, hh + ':00'))), h('span'), h('span')));
    box.appendChild(tbl);
    // the garden: hours of sun, from above
    if (res.garden.length) {
      const site = this.project.site, plan = this.shownVersion().plan;
      const bb = bboxOfPoints(site.plot), sc = Math.min(520 / bb.w, 380 / bb.h);
      const cv = makeCanvas(Math.round(bb.w * sc) + 20, Math.round(bb.h * sc) + 20);
      const g = cv.getContext('2d');
      const X = x => 10 + (x - bb.minX) * sc, Y = y => 10 + (y - bb.minY) * sc;
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
      const max = Math.max(1, ...res.garden.map(q => q.hours));
      const col = f => { const a = [44, 62, 110], b = [250, 205, 60]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',')})`; };
      for (const q of res.garden) { g.fillStyle = col(q.hours / max); g.fillRect(X(q.x - 0.5), Y(q.y - 0.5), sc + 0.6, sc + 0.6); }
      const low = lowestStorey(this.project);
      g.fillStyle = '#d9d6cf'; g.strokeStyle = '#555';
      for (const r of plan.rooms) if (r.storey === low.id) { g.beginPath(); r.poly.forEach((q, i) => (i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1])))); g.closePath(); g.fill(); g.stroke(); }
      g.strokeStyle = '#333'; g.setLineDash([6, 3]); g.lineWidth = 1.5; g.beginPath(); site.plot.forEach((q, i) => (i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1])))); g.closePath(); g.stroke(); g.setLineDash([]);
      // north
      const nd = planDir(site, 0), cx = cv.width - 28, cy = 28;
      g.strokeStyle = '#222'; g.fillStyle = '#222'; g.beginPath(); g.moveTo(cx - nd[0] * 14, cy - nd[1] * 14); g.lineTo(cx + nd[0] * 14, cy + nd[1] * 14); g.stroke();
      g.font = '700 12px system-ui'; g.textAlign = 'center'; g.fillText('N', cx + nd[0] * 22, cy + nd[1] * 22 + 4);
      cv.classList.add('sunh-map');
      const legend = h('div', { class: 'sunh-legend' }, h('i', { style: { background: col(0) } }), h('span', null, '0 h'), h('i', { style: { background: col(0.5) } }), h('span', null, fmtDec((max / 2).toFixed(1)) + ' h'), h('i', { style: { background: col(1) } }), h('span', null, fmtDec(max.toFixed(1)) + ' h'));
      const avg = res.garden.reduce((s2, q) => s2 + q.hours, 0) / res.garden.length;
      box.append(h('div', { class: 'eyebrow' }, t('Sun in the garden')), h('p', { class: 'note-muted' }, t('Hours of direct sun at 30 cm above the ground; the garden gets {h} hours on average.', { h: avg.toFixed(1).replace('.', ',') })), cv, legend);
    }
    return box;
  },
});

/* ── Site → Place: typed, "where I am now", a pasted map link, and the clock zone ── */
Object.assign(app, {
  /** set (or clear) the place of the house: one undo step; the sun, sun hours, exposure and the export follow */
  setPlace(lat, lon, tz) {
    if (!this.canEdit()) { this.lockedNotice(); return; }
    this.mutate(pr => { pr.place = { lat: Math.round(clamp(lat, -90, 90) * 1e5) / 1e5, lon: Math.round(clamp(lon, -180, 180) * 1e5) / 1e5 }; if (tz) pr.place.tz = tz; }, { project: true, keepInspector: false });
    this.afterPlace();
  },
  setPlaceZone(tz) {
    if (!this.canEdit()) { this.lockedNotice(); return; }
    this.mutate(pr => { const pl = placeOf(pr); pr.place = { lat: pl.lat, lon: pl.lon }; if (tz) pr.place.tz = tz; }, { project: true, keepInspector: false });
    this.afterPlace();
  },
  afterPlace() {
    this.updateSun();
    const w = $('#sun-times'); if (w) w.textContent = this.sunTimesWords(this.settings.sunDay);
  },
  /** "Use where I am now": the device's location (asks the person) */
  usePlaceHere(msgEl) {
    const say = (m, bad) => { if (msgEl) { msgEl.textContent = m; msgEl.classList.toggle('bad', !!bad); } else this.toast(m); };
    if (!navigator.geolocation) { say(t('This device cannot tell where it is. Type the place or paste a map link.'), true); return; }
    say(t('Asking the device where it is …'));
    navigator.geolocation.getCurrentPosition(
      pos => { this.setPlace(pos.coords.latitude, pos.coords.longitude); this.toast(t('Place set from this device.')); },
      err => say(err && err.code === 1 ? t('The device did not give its location (not allowed). Allow it in the browser, or type the place or paste a map link.') : t('The device could not find where it is. Type the place or paste a map link.'), true),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  },
  /** the zones to choose from: the ones the browser knows, else a short list */
  zoneChoices() {
    try { if (Intl.supportedValuesOf) return Intl.supportedValuesOf('timeZone'); } catch (e) { /* the short list */ }
    return ZONE_TOWNS.map(z => z[0]);
  },
  /** the Place section (in the Site panel, and in the sun bar's dialog) */
  placeSection() {
    const ro = !this.canEdit(), pl = this.placeNow();
    const sec = h('div', { class: 'insp-sec', id: 'place-sec' }, h('div', { class: 'eyebrow' }, t('Place of the house')));
    const msg = h('p', { class: 'note-muted', id: 'place-msg', 'aria-live': 'polite' });
    if (!pl.set) sec.appendChild(h('p', { class: 'note-muted', id: 'place-none' }, t('No place set – the sun is worked out for the middle of the Netherlands.')));
    const set = (la, lo) => { const c = this.placeNow(); this.setPlace(la ?? c.lat, lo ?? c.lon, c.tz || ''); };
    sec.appendChild(h('div', { class: 'field-row' },
      this.numField(t('Latitude (degrees)'), 'f-lat', pl.lat, '°', val => set(val, null), { dec: 5, disabled: ro, min: -90, max: 90 }),
      this.numField(t('Longitude (degrees)'), 'f-lon', pl.lon, '°', val => set(null, val), { dec: 5, disabled: ro, min: -180, max: 180 })));
    const link = h('input', { type: 'text', id: 'f-place-link', class: 'input', placeholder: t('Paste a map link or "52.09, 5.12"'), disabled: ro, 'aria-label': t('Map link') });
    const take = () => {
      const r = parsePlace(link.value);
      if (!r) { msg.textContent = t('That link has no place I can read. Paste the address of a map page that shows a place (Google Maps, OpenStreetMap, Apple Maps), or type the numbers.'); msg.classList.add('bad'); return; }
      if (r.short) { msg.textContent = t('A short link does not hold the place. Open it, and paste the address the browser shows then – or type the numbers.'); msg.classList.add('bad'); return; }
      this.setPlace(r.lat, r.lon, this.placeNow().tz || '');
      this.toast(t('Place set from the link.'));
    };
    link.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); take(); } });
    sec.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Map link')), h('div', { class: 'row' }, link, h('button', { class: 'btn sm', id: 'b-place-link', type: 'button', disabled: ro, onclick: take }, t('Use link')))));
    sec.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'b-place-here', type: 'button', disabled: ro, onclick: () => this.usePlaceHere(msg) }, icon('pin'), t('Use where I am now'))));
    // the clock at the place
    const tz = zoneOf(pl), auto = !pl.tz;
    const sel = h('select', { class: 'select', id: 'f-zone', disabled: ro, 'aria-label': t('Time zone') }, h('option', { value: '' }, t('Automatic: {z}', { z: guessZone(pl.lat, pl.lon).replace(/_/g, ' ') })));
    for (const z of this.zoneChoices()) sel.appendChild(h('option', { value: z }, z.replace(/_/g, ' ')));
    sel.value = auto ? '' : tz;
    sel.addEventListener('change', () => this.setPlaceZone(sel.value));
    sec.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Time zone')), sel));
    sec.appendChild(h('p', { class: 'note-muted', id: 'place-clock' }, t('The times of the sun are the clock at the house: {z}, now {o} from UTC.', { z: tz.replace(/_/g, ' '), o: offsetWords(zoneOffsetMin(tz, Date.now())) })));
    sec.appendChild(msg);
    sec.appendChild(h('p', { class: 'note-muted' }, t('The place gives the sun in 3D, the sun hours, the exposure, the photo render and the export for Fresing Render. The weather is not looked up.')));
    if (pl.fromSite) sec.appendChild(h('p', { class: 'note-muted' }, t('This place comes from the site plan. A place you set here is used instead.')));
    return sec;
  },
  /** the sun bar's way to the same section */
  placeDialog() {
    const body = h('div', { class: 'place-dlg' }, this.placeSection());
    UI.dialog({ title: t('Place of the house'), body, dismissValue: false, actions: [{ label: t('Close'), value: true, kind: 'primary' }] });
  },
});
