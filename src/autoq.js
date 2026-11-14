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

/* ───────── the level of this device (task 0010): Phone / Normal / PC high ─────────
   Chosen at start from what the browser says the device can do – never from its name: a touch screen without a mouse
   and a small screen, a graphics chip with only the phones' compressed picture formats (ASTC / ETC, none of the
   computers' BC), little memory or small textures only → Phone; a computer (mouse, a big screen, WebGL 2, the
   computers' formats, textures of 16384 px, 8 GB or more, a real graphics chip – not drawn in software) → PC high;
   anything else → Normal. Settings → "3D on this device": Auto (this choice) or one of the three, kept on the device
   (not in the house). What a level changes (LEVELS):
   – Phone: the material pictures at 512 px and compressed on the graphics card (KTX2 → ASTC / ETC2 / BC, whatever the
     chip takes – about a quarter of the memory), the sun's shadow map 1024 (2048: 16 MB → 4 MB), the 3D canvas at 1.5×
     the screen's pixels at most (2× costs 1.8 times the pixels in every picture and the buffers behind it, also when
     still), the trees' lighter versions from nearer by (20 / 60 m instead of 32 / 90) and a lighter far version (trees.js
     VEG_LOD[3]: half the leaf cards of the usual one, a little bigger). "Pictures as before"
     (settings.texPlain) turns the compressed pictures off – for a chip that shows them black or wrong.
   – Normal: the look of version 47.
   – PC high: the material pictures up to 2048 px where the library has them; the rest as Normal (0010b adds more). */
const LEVELS = {
  phone: { texPx: 512, ktx2: true, shadow: 1024, pr: 1.5, vegNear: [20, 60], vegFar: 3 },
  normal: { texPx: 512, ktx2: false, shadow: 2048, pr: 2, vegNear: [32, 90] },
  pc: { texPx: 2048, ktx2: false, shadow: 2048, pr: 2, vegNear: [32, 90] },
};
const LEVEL_NAMES = { phone: 'Phone', normal: 'Normal', pc: 'PC high' };
let _devSig = null;
/** what the browser says about this device (asked once; a small WebGL test canvas, given back at once) */
function deviceSignals() {
  if (_devSig) return _devSig;
  const mm = q => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
  const s = { touch: mm('(pointer: coarse)') && !mm('(pointer: fine)'), side: Math.min(screen.width || 0, screen.height || 0),
    mem: navigator.deviceMemory || null, cores: navigator.hardwareConcurrency || null, maxTex: 0, gl2: false, desktopTC: false, mobileTC: false, soft: false, gpu: '' };
  try {
    const cv = document.createElement('canvas'), gl = cv.getContext('webgl2') || cv.getContext('webgl');
    if (gl) {
      s.gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      s.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
      const ex = gl.getSupportedExtensions() || [];
      s.desktopTC = ex.some(e => /compressed_texture_(s3tc|bptc)/i.test(e));
      s.mobileTC = ex.some(e => /compressed_texture_(astc|etc)/i.test(e));
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      s.gpu = String((d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
      s.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(s.gpu);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch (e) { /* not told */ }
  return (_devSig = s);
}
/** the level Auto picks from the signals: { level, why: [reasons, English – t() them] } */
function deviceLevel(s = deviceSignals()) {
  const phone = [];
  if (s.touch && s.side && s.side < 700) phone.push('a touch screen without a mouse, small screen');
  if (s.mobileTC && !s.desktopTC) phone.push('a phone graphics chip (ASTC / ETC pictures only)');
  if (s.mem && s.mem <= 2) phone.push('little memory ({m} GB)');
  if (s.maxTex && s.maxTex < 4096) phone.push('small textures only ({n} px)');
  if (phone.length) return { level: 'phone', why: phone };
  const not = [];
  if (s.touch) not.push('a touch screen without a mouse');
  if (!(s.side >= 700)) not.push('a small screen');
  if (s.soft) not.push('3D drawn in software (no graphics chip)');
  if (!s.gl2) not.push('no WebGL 2');
  if (!s.desktopTC) not.push('no computer picture formats (BC)');
  if (!(s.maxTex >= 16384)) not.push('textures up to {n} px');
  if (s.mem && s.mem < 8) not.push('{m} GB memory');
  if (s.cores && s.cores < 4) not.push('{c} processor cores');
  return not.length ? { level: 'normal', why: not } : { level: 'pc', why: ['a computer with a graphics chip, a mouse and a big screen'] };
}
/** the level the 3D views use: the one chosen in Settings, else Auto's */
function level3d(settings) {
  const v = settings && settings.level;
  return LEVELS[v] ? v : deviceLevel().level;
}
/** what the level changes (LEVELS row) */
const levelKnobs = settings => LEVELS[level3d(settings)];

Object.assign(app, {
  /** Settings → 3D on this device: 'auto' or a level; pictures, shadows and canvas made again */
  setLevel(v) {
    const was = level3d(this.settings), wasGpu = libWantGpu();
    Settings.set('level', v === 'auto' ? undefined : v);
    if (level3d(this.settings) === was) return;
    if (libWantGpu() !== wasGpu || LEVELS[was].texPx !== levelKnobs(this.settings).texPx) texlibSettingsChanged();
    this.layoutKey = null;
    this.setupPanes(false);
    if (this.refreshPip) this.refreshPip(true);
  },
  /** "Pictures as before": no compressed (KTX2) pictures on this device – true / false */
  setPicturesPlain(on) {
    Settings.set('texPlain', !!on);
    texlibSettingsChanged();
  },
  /** Settings: the level of this device, why Auto chose it, and "Pictures as before" */
  levelSettings() {
    const s = this.settings, auto = deviceLevel(), sig = deviceSignals();
    const cur = LEVELS[s.level] ? s.level : 'auto';
    const why = auto.why.map(w => t(w, { m: fmtDec(sig.mem), n: sig.maxTex, c: sig.cores })).join(', ');
    const pics = h('div', { class: 'pip-set-row', id: 'set-pics-row' }, h('span', null, t('Pictures')),
      h('div', { class: 'seg', id: 'set-pics' }, ...[[false, t('Compressed (less memory)')], [true, t('As before')]].map(([v, l]) => h('button', { 'data-k': String(v), 'aria-pressed': String(!!s.texPlain === v), onclick: e => {
        for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        this.setPicturesPlain(v);
      } }, l))));
    const picsBox = h('div', { id: 'set-pics-box', style: { display: 'grid', gap: '6px' } }, pics,
      h('p', { class: 'note-muted', id: 'set-pics-note' }, t('If surfaces look black or wrong in 3D, choose “As before” (also in the ⋯ menu).')));
    const showPics = () => { picsBox.style.display = levelKnobs(this.settings).ktx2 ? '' : 'none'; };
    const seg = h('div', { class: 'seg', id: 'set-level' }, ...[['auto', t('Auto ({l})', { l: t(LEVEL_NAMES[auto.level]) })], ['phone', t('Phone')], ['normal', t('Normal')], ['pc', t('PC high')]].map(([v, l]) => h('button', { 'data-k': v, 'aria-pressed': String(cur === v), onclick: e => {
      for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      this.setLevel(v);
      showPics();
    } }, l)));
    showPics();
    return h('div', { class: 'field', id: 'set-level-field' }, h('span', { class: 'flabel' }, t('3D on this device')), seg,
      h('p', { class: 'note-muted', id: 'set-level-why' }, t('Auto chose {l}: {why}.', { l: t(LEVEL_NAMES[auto.level]), why })),
      h('p', { class: 'note-muted' }, t('Phone: compressed pictures, smaller shadows and canvas, lighter trees far away – less memory, smoother. Normal: as before. PC high: sharper pictures where the library has them.')),
      picsBox);
  },
});
