/* ───────────── tour.js — walking routes with stops, and saving a walk as a video ─────────────
   A route (project.walk.routes = [{ id, name, stops: [{ id, x, y, feet, storey, yaw, pitch, text }] }]) is a
   list of stops: where you stand and where you look, with a line of text. Playing it walks you from stop to
   stop along the walking paths (made from the rooms and doors when there are none yet), turns you to look where
   the stop looks and shows its text; it goes on by itself or you step with ◀ ▶.
   Any walk (free, path or a route) can be recorded as a video. The picture is copied into a canvas of its own
   with the stop texts written in, and MediaRecorder makes a .webm (or .mp4 where the browser makes those). */

/* ───────── the walker following a route ───────── */
Object.assign(Walker.prototype, {
  /** the way to a stop along the walking paths: [{x, y, feet}], ending at the stop */
  wayTo(stop) {
    const W = this.graph(), nodes = W.nodes;
    const pts = [];
    const sid0 = this.storeyAt(this.feet).id;
    const near = (x, y, sid) => nodes.filter(n => n.storey === sid).sort((a, b) => V.dist([a.x, a.y], [x, y]) - V.dist([b.x, b.y], [x, y]))[0] || null;
    const a = nodes.length ? near(this.x, this.y, sid0) : null, b = nodes.length ? near(stop.x, stop.y, stop.storey) : null;
    if (a && b && a.id !== b.id && V.dist([this.x, this.y], [stop.x, stop.y]) > 0.6) {
      const byId = new Map(nodes.map(n => [n.id, n]));
      const feetOf = new Map();
      const F = n => { if (!feetOf.has(n.id)) feetOf.set(n.id, this.nodeFeet(n)); return feetOf.get(n.id); };
      const adj = new Map();
      for (const [p, q] of W.edges) {
        const np = byId.get(p), nq = byId.get(q);
        if (!np || !nq) continue;
        const len = Math.hypot(np.x - nq.x, np.y - nq.y, F(np) - F(nq));
        if (!adj.has(p)) adj.set(p, []); if (!adj.has(q)) adj.set(q, []);
        adj.get(p).push([q, len]); adj.get(q).push([p, len]);
      }
      // Dijkstra (a house has a few hundred points at most)
      const dist = new Map([[a.id, 0]]), prev = new Map(), done = new Set();
      for (;;) {
        let cur = null, cd = Infinity;
        for (const [id, d] of dist) if (!done.has(id) && d < cd) { cd = d; cur = id; }
        if (cur == null || cur === b.id) break;
        done.add(cur);
        for (const [nb, len] of adj.get(cur) || []) { const nd = cd + len; if (nd < (dist.has(nb) ? dist.get(nb) : Infinity)) { dist.set(nb, nd); prev.set(nb, cur); } }
      }
      if (dist.has(b.id)) {
        const chain = [];
        for (let id = b.id; id != null; id = prev.get(id)) chain.unshift(id);
        for (const id of chain) { const n = byId.get(id); pts.push({ x: n.x, y: n.y, feet: F(n) }); }
        // no going back to a point behind you, nor past the last one to come back to the stop
        if (pts.length > 1 && V.dist([this.x, this.y], [pts[1].x, pts[1].y]) < V.dist([pts[0].x, pts[0].y], [pts[1].x, pts[1].y])) pts.shift();
        const L = pts.length;
        if (L > 1 && V.dist([stop.x, stop.y], [pts[L - 2].x, pts[L - 2].y]) < V.dist([pts[L - 1].x, pts[L - 1].y], [pts[L - 2].x, pts[L - 2].y])) pts.pop();
      }
    }
    pts.push({ x: stop.x, y: stop.y, feet: stop.feet });
    return pts;
  },
  startTour(route, i0 = 0) {
    this.anim = null;
    this.arrows.clear();
    this.tour = { route, i: i0 - 1, phase: 'move', playing: true, way: [], seg: 0, hold: 0 };
    this.tourStep(1, true);
  },
  /** to the next (+1) or the previous (-1) stop; the first one is jumped to */
  tourStep(delta, jump) {
    const T = this.tour;
    if (!T) return;
    const stops = T.route.stops;
    T.i = clamp(T.i + delta, 0, stops.length);
    if (T.i >= stops.length) { T.phase = 'end'; T.playing = false; this.app.onTour(this); return; }
    const s = stops[T.i];
    if (jump) { this.x = s.x; this.y = s.y; this.feet = s.feet; T.way = []; T.seg = 0; T.phase = 'turn'; }
    else { T.way = this.wayTo(s); T.seg = 0; T.phase = 'move'; }
    T.hold = 0;
    this.updateCamera();
    this.app.onTour(this);
  },
  tourTick(dt) {
    const T = this.tour;
    if (!T || T.phase === 'end') return false;
    const turnTo = (yaw, pitch, rate) => {
      let dy = ((yaw - this.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      const step = rate * dt;
      this.yaw += Math.abs(dy) <= step ? dy : Math.sign(dy) * step;
      const dp = pitch - this.pitch;
      this.pitch += Math.abs(dp) <= step * 0.6 ? dp : Math.sign(dp) * step * 0.6;
      return Math.abs(dy) <= step && Math.abs(dp) <= step * 0.6;
    };
    if (T.phase === 'move') {
      let left = (this.person.speed || 1.3) * dt;
      while (left > 1e-6 && T.seg < T.way.length) {
        const p = T.way[T.seg], d = Math.hypot(p.x - this.x, p.y - this.y);
        if (d <= left) { this.x = p.x; this.y = p.y; this.feet = p.feet; left -= d; T.seg++; }
        else { const k = left / d; this.x += (p.x - this.x) * k; this.y += (p.y - this.y) * k; this.feet += (p.feet - this.feet) * k; left = 0; }
      }
      // look where you walk
      const p = T.way[Math.min(T.seg, T.way.length - 1)];
      if (p && Math.hypot(p.x - this.x, p.y - this.y) > 0.05) turnTo(Math.atan2(-(p.x - this.x), -(p.y - this.y)), -0.06, 2.6);
      if (T.seg >= T.way.length) T.phase = 'turn';
      this.updateCamera();
      return true;
    }
    if (T.phase === 'turn') {
      const s = T.route.stops[T.i];
      if (turnTo(s.yaw, s.pitch ?? -0.06, 1.8)) { T.phase = 'hold'; T.hold = 0; this.app.onTour(this); }
      this.updateCamera();
      return true;
    }
    if (T.phase === 'hold' && T.playing) {
      const s = T.route.stops[T.i];
      T.hold += dt;
      if (T.hold >= clamp(2.6 + (s.text || '').length * 0.05, 2.6, 9)) this.tourStep(1);
    }
    return false;
  },
});

/* ───────── recording the 3D view as a video ───────── */
class WalkRecorder {
  constructor(view, app) {
    this.view = view;
    this.app = app;
    const src = view.renderer.domElement;
    const k = Math.min(1, 1920 / Math.max(1, src.width));
    this.cv = document.createElement('canvas');
    this.cv.width = Math.max(2, Math.round(src.width * k / 2) * 2);
    this.cv.height = Math.max(2, Math.round(src.height * k / 2) * 2);
    this.g = this.cv.getContext('2d');
    this.frame();
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    this.type = types.find(x => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x)) || '';
    this.stream = this.cv.captureStream(30);
    this.chunks = [];
    this.mr = new MediaRecorder(this.stream, this.type ? { mimeType: this.type, videoBitsPerSecond: 8e6 } : undefined);
    this.mr.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.mr.onerror = e => { this.error = (e && e.error && e.error.message) || 'error'; console.warn('video recorder', this.error); };
    this.started = performance.now();
    this.mr.start(500);
  }
  /** the picture just drawn, and the text of the stop you are at */
  frame() {
    const v = this.view, g = this.g, W = this.cv.width, H = this.cv.height;
    try { g.drawImage(v.renderer.domElement, 0, 0, W, H); } catch (e) { return; }
    const w = v.walker, T = w && w.tour;
    if (T && T.phase === 'hold' && T.route.stops[T.i]) {
      const s = T.route.stops[T.i], txt = s.text || '';
      const lab = t('Stop {n} of {k}', { n: T.i + 1, k: T.route.stops.length });
      const fs = Math.round(H * 0.034), pad = fs * 0.8;
      g.font = `600 ${fs}px system-ui, sans-serif`;
      const lines = wrapText(g, txt, W * 0.7);
      const bw = Math.min(W - pad * 2, Math.max(g.measureText(lab).width, ...lines.map(l => g.measureText(l).width)) + pad * 2);
      const bh = pad * 1.6 + fs * 1.3 * (lines.length + 1);
      const x = (W - bw) / 2, y = H - bh - pad * 1.5;
      g.fillStyle = 'rgba(20, 28, 30, 0.72)';
      g.beginPath(); g.roundRect ? g.roundRect(x, y, bw, bh, fs * 0.5) : g.rect(x, y, bw, bh); g.fill();
      g.fillStyle = '#9fd3d6'; g.font = `600 ${Math.round(fs * 0.75)}px system-ui, sans-serif`;
      g.fillText(lab, x + pad, y + pad + fs * 0.75);
      g.fillStyle = '#ffffff'; g.font = `600 ${fs}px system-ui, sans-serif`;
      lines.forEach((l, i) => g.fillText(l, x + pad, y + pad + fs * 0.75 + fs * 1.3 * (i + 1)));
    }
  }
  seconds() { return (performance.now() - this.started) / 1000; }
  stop() {
    return new Promise(res => {
      let done = false;
      const finish = () => { if (done) return; done = true; const type = (this.type || 'video/webm').split(';')[0]; res(new Blob(this.chunks, { type })); };
      // a recorder that has already stopped by itself (an error of the browser's video encoder): what it gave
      if (this.mr.state === 'inactive') { finish(); return; }
      this.mr.onstop = finish;
      // a recorder that never says it has finished (seen on very slow machines): what it gave so far, after a minute
      setTimeout(finish, 60000);
      try { this.mr.requestData(); } catch (e) { /* fine */ }
      try { this.mr.stop(); } catch (e) { finish(); }
      for (const tr of this.stream.getTracks()) tr.stop();
    });
  }
}
function wrapText(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const tryL = line ? line + ' ' + word : word;
      if (g.measureText(tryL).width > maxW && line) { out.push(line); line = word; } else line = tryL;
    }
    if (line) out.push(line);
  }
  return out.slice(0, 4);
}

/* ───────── the app side: routes, the tour card, recording ───────── */
Object.assign(app, {
  routes() { const W = this.project.walk; W.routes = W.routes || []; return W.routes; },
  curRoute() { const R = this.routes(); return R.find(r => r.id === this.routeId) || null; },

  /** a stop where you stand and look now, in the route you are making (a new one if there is none) */
  async addTourStop() {
    const w = this.walker;
    if (!w) return;
    const st = w.state();
    const text = await UI.prompt({ title: t('Add a stop here'), label: t('What to say here (shown at this stop)'), value: '', placeholder: t('e.g. The new en-suite: shower on the left'), confirmLabel: t('Add stop') });
    if (text == null) return;
    let route = this.curRoute();
    const stop = { id: uid('ts_'), x: st.x, y: st.y, feet: st.feet, storey: st.storey, yaw: st.yaw, pitch: st.pitch, text: text.trim() };
    this.mutate(p => {
      const R = p.walk.routes = p.walk.routes || [];
      let r = route && R.find(x => x.id === route.id);
      if (!r) { r = { id: uid('tr_'), name: t('Route {n}', { n: R.length + 1 }), stops: [], created: Date.now() }; R.push(r); this.routeId = r.id; }
      r.stops.push(stop);
    }, { project: true, keepInspector: true });
    route = this.curRoute();
    this.toast(t('Stop {n} added to “{r}”.', { n: route.stops.length, r: route.name }));
    this.renderInspector();
  },

  playRoute(id, opts = {}) {
    const r = this.routes().find(x => x.id === id);
    if (!r || !r.stops.length) { this.toast(t('This route has no stops yet: walk to a spot and tap “Add a stop here”.')); return; }
    this.routeId = r.id;
    if (!this.project.walk.nodes.length) { this.autoPaths(); this.toast(t('Walking paths were made from the rooms and doors, to walk the route along.')); }
    if (!this.walking) this.startWalk({ mode: this.settings.walkMode === 'path' ? 'path' : 'free' });
    const w = this.walker;
    if (!w) return;
    w.startTour(r, opts.from || 0);
    if (opts.record) this.startRecording({ untilEnd: true });
    this.renderStageOverlays();
  },
  stopTour() {
    const w = this.walker;
    if (w && w.tour) { w.tour = null; if (w.mode === 'path') w.enterPath(); }
    this.renderTourCard();
    this.renderStageOverlays();
  },
  /** the walker reached a stop / set off / finished */
  onTour(w) {
    const T = w.tour;
    this.renderTourCard();
    if (T && T.phase === 'end' && this.recorder && this.recorder.untilEnd) setTimeout(() => this.stopRecording(), 1200);
  },
  renderTourCard() {
    const pane = this.panes.find(x => x.kind === '3d');
    const host = pane && pane.view.host;
    if (!host) return;
    let card = host.querySelector('.tour-card');
    const w = this.walker, T = w && w.tour;
    if (!T) { if (card) card.remove(); return; }
    if (!card) { card = h('div', { class: 'tour-card', role: 'status', 'aria-live': 'polite' }); host.appendChild(card); }
    card.textContent = '';
    const n = T.route.stops.length, s = T.route.stops[Math.min(T.i, n - 1)];
    const head = T.phase === 'end' ? t('End of “{r}”', { r: T.route.name }) : T.phase === 'hold' || T.phase === 'turn' ? t('Stop {n} of {k}', { n: T.i + 1, k: n }) : t('On the way to stop {n} of {k}', { n: T.i + 1, k: n });
    card.append(h('div', { class: 'tc-head' }, icon('flag'), h('span', null, head), h('span', { class: 'tc-route' }, T.route.name)),
      T.phase !== 'end' && (T.phase === 'hold' || T.phase === 'turn') && s && s.text ? h('div', { class: 'tc-text' }, s.text) : null,
      h('div', { class: 'tc-btns' },
        h('button', { class: 'btn sm ghost icon', 'aria-label': t('Previous stop'), title: t('Previous stop'), disabled: T.i <= 0, onclick: () => { w.tourStep(-1); } }, icon('prev')),
        T.phase === 'end'
          ? h('button', { class: 'btn sm', onclick: () => w.startTour(T.route, 0) }, icon('restore'), t('Again'))
          : h('button', { class: 'btn sm ghost icon', 'aria-label': T.playing ? t('Pause') : t('Play'), title: T.playing ? t('Pause') : t('Play'), onclick: () => { T.playing = !T.playing; this.renderTourCard(); } }, icon(T.playing ? 'pause' : 'play')),
        h('button', { class: 'btn sm ghost icon', 'aria-label': t('Next stop'), title: t('Next stop'), disabled: T.phase === 'end', onclick: () => { w.tourStep(1); } }, icon('next')),
        h('button', { class: 'btn sm ghost icon', 'aria-label': t('Stop the route'), title: t('Stop the route'), onclick: () => this.stopTour() }, icon('close'))));
  },

  /* ───────── video ───────── */
  canRecord() { return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream); },
  startRecording(opts = {}) {
    if (this.recorder) return;
    if (!this.canRecord()) { this.toast(t('This browser can’t record video.')); return; }
    const pane = this.panes.find(x => x.kind === '3d');
    if (!pane || !pane.view.ok) return;
    try { this.recorder = new WalkRecorder(pane.view, this); } catch (e) { console.warn(e); this.toast(t('Recording could not start in this browser.')); return; }
    this.recorder.untilEnd = !!opts.untilEnd;
    pane.view.rec = this.recorder;
    pane.view.needs = true;
    clearInterval(this._recTimer);
    this._recTimer = setInterval(() => this.renderRecBadge(), 500);
    this.renderStageOverlays();
  },
  async stopRecording() {
    const rec = this.recorder;
    if (!rec) return null;
    this.recorder = null;
    clearInterval(this._recTimer);
    if (rec.view.rec === rec) rec.view.rec = null;
    const blob = await rec.stop();
    const ext = /mp4/.test(blob.type) ? 'mp4' : 'webm';
    const name = `${slugify(this.project.name)}_${t('walk')}_${todayStamp()}.${ext}`;
    this.renderStageOverlays();
    if (!blob.size) { this.toast(t('Nothing was recorded.')); return null; }
    this.downloadBlob(name, blob);
    return blob;
  },
  renderRecBadge() {
    const el = document.querySelector('.rec-time');
    if (el && this.recorder) { const s = Math.floor(this.recorder.seconds()); el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  },

  /** the routes in the walking panel */
  routesSection(el) {
    const R = this.routes(), cur = this.curRoute();
    const sec = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Routes with stops')),
      h('p', { class: 'note-muted' }, t('Walk to a spot, look at what to show and tap “Add a stop here”. Play the route to walk it from stop to stop, or record it as a video.')),
      this.walking ? h('div', { class: 'actions' }, h('button', { class: 'btn sm primary', id: 'btn-add-stop', onclick: () => this.addTourStop() }, icon('flag'), t('Add a stop here'))) : null);
    for (const r of R) {
      const on = cur && cur.id === r.id;
      const row = h('div', { class: 'route-row' + (on ? ' on' : '') },
        h('button', { class: 'route-name', onclick: () => { this.routeId = on ? null : r.id; this.renderInspector(); } }, icon('flag'), h('span', null, r.name), h('span', { class: 'note-muted num' }, ' · ' + t('{n} stops', { n: r.stops.length }))),
        h('button', { class: 'btn sm', onclick: () => this.playRoute(r.id) }, icon('play'), t('Play')),
        this.canRecord() ? h('button', { class: 'btn sm ghost icon', title: t('Play and record as a video'), 'aria-label': t('Play and record as a video'), onclick: () => this.playRoute(r.id, { record: true }) }, icon('record', 'rec-ic')) : null);
      sec.appendChild(row);
      if (!on) continue;
      const name = h('input', { class: 'input', value: r.name, 'aria-label': t('Name of the route') });
      name.onchange = () => this.mutate(p => { const x = p.walk.routes.find(y => y.id === r.id); if (x) x.name = name.value.trim() || x.name; }, { project: true, keepInspector: true });
      const box = h('div', { class: 'route-stops' }, h('div', { class: 'field' }, name));
      r.stops.forEach((s, i) => {
        const txt = h('input', { class: 'input', value: s.text || '', placeholder: t('(no text)'), 'aria-label': t('Text of stop {n}', { n: i + 1 }) });
        txt.onchange = () => this.mutate(p => { const x = p.walk.routes.find(y => y.id === r.id); if (x && x.stops[i]) x.stops[i].text = txt.value.trim(); }, { project: true, keepInspector: true });
        const mv = d => this.mutate(p => { const x = p.walk.routes.find(y => y.id === r.id); const j = i + d; if (!x || j < 0 || j >= x.stops.length) return; [x.stops[i], x.stops[j]] = [x.stops[j], x.stops[i]]; }, { project: true });
        box.appendChild(h('div', { class: 'stop-row' }, h('span', { class: 'run-n num' }, String(i + 1)), txt,
          h('button', { class: 'btn ghost icon sm', title: t('Play from here'), 'aria-label': t('Play from here'), onclick: () => this.playRoute(r.id, { from: i }) }, icon('play')),
          h('button', { class: 'btn ghost icon sm', title: t('Earlier'), 'aria-label': t('Earlier'), disabled: i === 0, onclick: () => mv(-1) }, icon('chevron', 'rot180')),
          h('button', { class: 'btn ghost icon sm', title: t('Later'), 'aria-label': t('Later'), disabled: i === r.stops.length - 1, onclick: () => mv(1) }, icon('chevron')),
          h('button', { class: 'btn ghost icon sm', title: t('Remove stop'), 'aria-label': t('Remove stop'), onclick: () => this.mutate(p => { const x = p.walk.routes.find(y => y.id === r.id); if (x) x.stops.splice(i, 1); }, { project: true }) }, icon('close'))));
      });
      box.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'btn sm', onclick: () => { this.routeId = null; this.renderInspector(); if (this.walking) this.toast(t('The next stop starts a new route.')); } }, icon('plus'), t('New route')),
        h('button', { class: 'btn sm danger', onclick: () => { this.mutate(p => { p.walk.routes = p.walk.routes.filter(y => y.id !== r.id); }, { project: true }); this.routeId = null; } }, icon('trash'), t('Delete route'))));
      sec.appendChild(box);
    }
    el.appendChild(sec);
  },
});
