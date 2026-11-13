/* ───────────── speed.js — a speed check on this device: how smooth is the 3D, and which quality fits ─────────────
   Settings → 3D quality → "Speed check". The whole house turns slowly in 3D, first in the quality you use now, then
   (if you want) in the others. Per quality: pictures per second (the middle value and the slowest 5 %), how many
   pieces the graphics chip draws per picture (draw calls) and triangles; for the device: the graphics chip, the
   screen and its pixel density, processor cores and memory (where the browser tells). Then the best quality that
   stays smooth (30 pictures a second or more, few slow ones) is suggested; one tap uses it on this device only
   (the setting is kept in this browser). The 3D view goes back to where it was. */

const SPEED_TARGET = 30;           // pictures per second that still feel smooth while turning
const SPEED_SECONDS = 4;           // measured per quality (plus a short warm-up)
const fmtNum = (v, d = 0) => fmtDec((+v || 0).toFixed(d));

/** what the browser tells about this device */
function deviceInfo(renderer) {
  const out = { screen: `${screen.width} × ${screen.height}`, dpr: +(window.devicePixelRatio || 1).toFixed(2), cores: navigator.hardwareConcurrency || null, mem: navigator.deviceMemory || null, gpu: null, touch: window.matchMedia('(pointer: coarse)').matches };
  try {
    const gl = renderer && renderer.getContext();
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    out.gpu = gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null;
    out.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  } catch (e) { /* not told */ }
  if (performance.memory) out.heap = performance.memory.usedJSHeapSize;
  return out;
}
/** the middle value and the 95th percentile of frame times (ms) → pictures per second */
function frameStats(dts) {
  const s = [...dts].sort((a, b) => a - b);
  if (!s.length) return { fps: 0, p95: 0, n: 0 };
  const med = s[Math.floor(s.length / 2)], p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
  return { fps: +(1000 / med).toFixed(1), p95: +p95.toFixed(1), n: s.length };
}
/** the best quality that stays smooth (the list in order fast → high) */
function speedAdvice(results) {
  let best = null;
  for (const r of results) if (r.fps >= SPEED_TARGET && r.p95 <= 1000 / 15) best = r.q;
  return best || 'fast';
}

Object.assign(app, {
  /** turn the whole house for a few seconds in the current 3D view and count the pictures */
  async measure3d(seconds, onTick, stop) {
    const pane = this.panes.find(p => p.kind === '3d');
    const v = pane && pane.view;
    if (!v || !v.renderer) return null;
    // wait for the view to be built (a slow device needs a moment)
    for (let i = 0; i < 60 && !v.scene.children.length; i++) await new Promise(r => setTimeout(r, 100));
    const target = v.controls.target.clone(), sph = new THREE.Spherical().setFromVector3(v.camera.position.clone().sub(target));
    const dts = [], calls = [], tris = [];
    let last = 0, t0 = 0;
    const warm = 0.8;
    await new Promise(resolve => {
      const step = now => {
        if (!t0) t0 = now;
        const el = (now - t0) / 1000;
        if (last && el > warm) {
          dts.push(now - last);
          calls.push(v.renderer.info.render.calls); tris.push(v.renderer.info.render.triangles);
        }
        last = now;
        if (onTick) onTick(Math.min(1, el / (seconds + warm)));
        if (el >= seconds + warm || !this.project || (stop && stop())) { resolve(); return; }
        // turn a little every picture (the same speed on every device)
        sph.theta += 0.35 * (dts.length ? dts[dts.length - 1] : 16) / 1000;
        v.camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sph));
        v.camera.lookAt(target);
        v.camMoved = true; v.needs = true;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const avg = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
    return { ...frameStats(dts), calls: avg(calls), tris: avg(tris), geos: v.renderer.info.memory.geometries, texs: v.renderer.info.memory.textures };
  },

  /** Settings → Speed check */
  async speedCheck() {
    if (!this.project) { this.toast(t('Open a house first: the check turns your house in 3D.')); return; }
    const before = { dim: this.view.dim, scope: this.view.scope, storeyId: this.view.storeyId, q: this.settings.quality || 'beautiful' };
    const qs = ['fast', 'beautiful'].concat(canHighQuality() ? ['high'] : []);
    const qName = q => t({ fast: 'Fast', beautiful: 'Beautiful', high: 'High (PC)' }[q]);
    let cancelled = false, close = null;
    const body = h('div', { class: 'speed-body', id: 'speed-body' });
    const status = h('p', { class: 'note-muted', id: 'speed-status' }, t('Turning the whole house in 3D…'));
    const bar = h('div', { class: 'fh-bar speed-bar' }, h('i', { class: 'fh-fill fh-good', style: { width: '0%' } }));
    const table = h('div', { class: 'speed-table', id: 'speed-table' });
    const advice = h('div', { id: 'speed-advice' });
    const info = h('p', { class: 'note-muted', id: 'speed-device' });
    body.append(status, bar, table, advice, info);
    const results = [];
    const row = r => h('div', { class: 'speed-row' + (r.q === quality3d(this.settings) ? ' cur' : ''), 'data-q': r.q },
      h('span', { class: 'sq' }, qName(r.q)), h('span', { class: 'num' }, t('{f} per second', { f: fmtNum(r.fps, r.fps < 10 ? 1 : 0) })),
      h('span', { class: 'num muted' }, t('slowest {ms} ms', { ms: fmtNum(r.p95, 0) })), h('span', { class: 'num muted' }, t('{c} draw calls', { c: r.calls })));
    const paintTable = () => { table.textContent = ''; for (const r of results) table.appendChild(row(r)); };
    const run = async list => {
      for (const q of list) {
        if (cancelled) return;
        status.textContent = t('Measuring {q}…', { q: qName(q) });
        if (quality3d(this.settings) !== q) { this.setQuality(q); await new Promise(r => setTimeout(r, 400)); }
        const r = await this.measure3d(SPEED_SECONDS, k => { bar.firstChild.style.width = Math.round(k * 100) + '%'; }, () => cancelled);
        if (cancelled) return;
        if (!r) { status.textContent = t('No 3D view to measure.'); return; }
        results.push({ q, ...r });
        paintTable();
      }
    };
    const showAdvice = () => {
      const measured = results.filter(r => qs.includes(r.q)).sort((a, b) => qs.indexOf(a.q) - qs.indexOf(b.q));
      const smooth = r => r.fps >= SPEED_TARGET && r.p95 <= 1000 / 15;
      const all = qs.every(q => results.some(r => r.q === q));
      const cur = quality3d(this.settings), curR = results.find(r => r.q === cur);
      const anySmooth = measured.some(smooth);
      // the best smooth quality; when nothing measured is smooth: the simplest quality not tried yet, else Fast
      const best = anySmooth ? speedAdvice(measured) : (qs.find(q => !results.some(r => r.q === q) && qs.indexOf(q) < qs.indexOf(cur)) || 'fast');
      let msg;
      if (all) msg = anySmooth ? t('Best for this device: {q}.', { q: qName(best) }) : t('Even Fast is slow on this device ({f} a second); Fast is the best choice.', { f: fmtNum(measured[0].fps, measured[0].fps < 10 ? 1 : 0) });
      else if (curR && smooth(curR)) msg = t('{q} is smooth on this device.', { q: qName(cur) });
      else msg = t('{q} is slow on this device ({f} a second). Try {b}.', { q: qName(cur), f: fmtNum(curR ? curR.fps : 0, curR && curR.fps < 10 ? 1 : 0), b: qName(best) });
      const useBtn = best !== cur ? h('button', { class: 'btn sm primary', id: 'speed-use', onclick: () => { this.setQuality(best); before.q = best; close && close(true); this.toast(t('{q} is used on this device.', { q: qName(best) })); } }, t('Use {q} on this device', { q: qName(best) }))
        : h('button', { class: 'btn sm primary', id: 'speed-use', onclick: () => close && close(true) }, t('Keep {q}', { q: qName(cur) }));
      advice.textContent = '';
      advice.append(h('p', { class: 'speed-verdict' + (anySmooth || all ? '' : ' slow') }, icon(anySmooth ? 'check' : 'alert'), h('span', null, msg)),
        h('div', { class: 'actions' }, useBtn,
          all ? null : h('button', { class: 'btn sm', id: 'speed-all', onclick: async () => { advice.textContent = ''; await run(qs.filter(q => !results.some(r => r.q === q))); showAdvice(); } }, t('Try the other qualities too'))));
      const d = deviceInfo(this.panes.find(p => p.kind === '3d') && this.panes.find(p => p.kind === '3d').view.renderer);
      info.textContent = [d.gpu ? t('Graphics: {g}', { g: d.gpu }) : null, t('Screen {s} at {d}× pixels', { s: d.screen, d: d.dpr }), d.cores ? t('{n} processor cores', { n: d.cores }) : null, d.mem ? t('about {m} GB memory', { m: d.mem }) : null].filter(Boolean).join(' · ');
      status.textContent = t('Done. 30 or more pictures a second feels smooth while turning.');
      bar.firstChild.style.width = '100%';
    };
    // the whole house in 3D for the check
    if (this.view.dim !== '3d' || this.view.scope !== 'house') { this.setScope('house'); if (this.view.dim !== '3d') this.setDim('3d'); await new Promise(r => setTimeout(r, 600)); }
    const done = UI.dialog({ title: t('Speed check'), body, wide: true, onOpen: (d, c) => { close = c; },
      actions: [{ label: t('Close'), value: null }] });
    done.then(() => { cancelled = true; });
    await run([quality3d(this.settings)]);
    if (!cancelled) showAdvice();
    await done;
    // back to the quality you chose and the view you had
    if (quality3d(this.settings) !== quality3d({ quality: before.q })) this.setQuality(before.q);
    if (before.scope !== this.view.scope || before.storeyId !== this.view.storeyId) this.setScope(before.scope, before.storeyId);
    if (before.dim !== this.view.dim) this.setDim(before.dim);
    this.speedResults = results;
  },
});
