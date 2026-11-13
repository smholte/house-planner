/* ───────────── autoq.js — the 3D quality chosen for this device, the first time ─────────────
   The first time this device shows a house in 3D, the app measures quietly for a moment how fast the view draws the
   still picture (no turning – nothing moves on the screen). Too slow (under 20 pictures a second) with Beautiful or
   High: it switches to Fast and says so (Undo puts it back). A computer that is fast enough for High (50 or more)
   gets a message offering High (it doesn't switch by itself: High looks different). Measured once per device and
   browser (settings.autoQ); Settings → "Speed check on this device" measures again, more thoroughly. */

const AUTOQ_SLOW = 20, AUTOQ_FAST = 50, AUTOQ_MS = 1200;

Object.assign(app, {
  /** after the first 3D build on this device (View3D.build calls it; once) */
  autoQualityOnce(v, test) {
    const s = this.settings;
    if (s.autoQ || this._autoQBusy || !v || !v.ok || v.opts.mini) return;
    this._autoQBusy = true;
    const go = async () => {
      try {
        const fps = test && test.fps != null ? test.fps : await this.measureStill(v);
        if (!fps) return;
        const cur = quality3d(s), prev = s.quality || 'beautiful';
        Settings.set('autoQ', { fps: +fps.toFixed(1), q: cur, at: Date.now() });
        if (fps < AUTOQ_SLOW && cur !== 'fast') {
          this.setQuality('fast');
          this.toast(t('3D was slow on this device ({f} pictures a second): it now uses Fast. Settings → 3D quality to change it.', { f: fmtDec(fps.toFixed(0)) }),
            { action: { label: t('Undo'), fn: () => this.setQuality(prev) }, ms: 9000 });
        } else if (fps >= AUTOQ_FAST && cur === 'beautiful' && canHighQuality()) {
          this.toast(t('This computer is fast enough for the High 3D quality.'), { action: { label: t('Use High'), fn: () => this.setQuality('high') }, ms: 9000 });
        }
      } finally { this._autoQBusy = false; }
    };
    // (a moment after the house appears: textures, models and the first pictures first)
    setTimeout(go, test ? 0 : 2500);
  },
  /** pictures a second of the still view, drawn again and again for a moment */
  measureStill(v) {
    return new Promise(resolve => {
      const dts = [];
      let last = 0;
      const t0 = performance.now();
      const step = now => {
        if (!v.ok || !v.renderer || v.rendering) { resolve(null); return; }
        if (last) dts.push(now - last);
        last = now;
        v.needs = true;
        if (now - t0 < AUTOQ_MS) requestAnimationFrame(step);
        else resolve(dts.length > 5 ? frameStats(dts).fps : null);
      };
      requestAnimationFrame(step);
    });
  },
});
