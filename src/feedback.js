/* ───────────── feedback.js — "Send feedback" (task 0019, I7) ─────────────
   ⋯ → Send feedback… (and in Help): a text field and a picture of the view. Send makes two files –
   feedback-<date-time>.txt (his words, the app's version and build, the device, what was open, the last 20 page errors)
   and feedback-<date-time>.png (the visible 2D or 3D view) – and opens the share sheet on a phone, downloads them on a
   computer. Nothing is sent by the app itself, and never the house file: the files go to whoever builds the app. */

/** the last 20 page errors, collected from the start of the page */
const FEEDBACK_ERRORS = [];
function feedbackNoteError(what) {
  FEEDBACK_ERRORS.push(new Date().toISOString().slice(11, 19) + ' ' + String(what).replace(/\s+/g, ' ').slice(0, 300));
  if (FEEDBACK_ERRORS.length > 20) FEEDBACK_ERRORS.shift();
}
window.addEventListener('error', e => feedbackNoteError((e.message || 'error') + (e.filename ? ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')' : '')));
window.addEventListener('unhandledrejection', e => feedbackNoteError('unhandled: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));

Object.assign(app, {
  /** the text of the feedback file: what he wrote and what the app knows about the moment */
  feedbackText(words) {
    const p = this.project, shown = p ? this.shownVersion() : null;
    const st = p && this.view.scope === 'storey' ? this.currentStorey() : null;
    const pane = this.panes.find(x => x.role === 'main');
    const rendering = !!document.querySelector('.rn-dialog');
    const sel = this.selection ? JSON.stringify({ type: this.selection.type, id: this.selection.id, ids: this.selection.ids && this.selection.ids.length }) : 'none';
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const lines = [
      words.trim() || '(no text)',
      '',
      '--- House Planner feedback ---',
      'app: version ' + APP_VERSION.n + ' (' + APP_VERSION.date + ')' + (/^[0-9a-f]{10}$/.test(APP_VERSION.build) ? ', build ' + APP_VERSION.build : ''),
      'sent: ' + new Date().toISOString(),
      'device: ' + navigator.userAgent,
      'screen: ' + screen.width + 'x' + screen.height + ', window ' + innerWidth + 'x' + innerHeight + ', pixel ratio ' + devicePixelRatio + ', touch ' + (navigator.maxTouchPoints > 0 ? 'yes' : 'no') + (window.matchMedia('(pointer: coarse)').matches ? ' (coarse)' : ''),
      'language: ' + I18N.lang + ', theme: ' + (this.settings.theme || 'system') + (dark ? ' (dark)' : ' (light)'),
      'mode: ' + this.mode,
      'storey: ' + (st ? st.name : (this.view.scope || '-')),
      'version open: ' + (shown ? shown.name + ' (' + shown.kind + ')' : '-'),
      'view: ' + (rendering ? 'render' : (this.view.dim || '2d').toUpperCase()) + (pane ? ', pane ' + pane.kind : '') + (this.sideBySide ? ', side by side' : '') + (this.swipe ? ', compare' : ''),
      'selected: ' + sel,
      'page errors (' + FEEDBACK_ERRORS.length + '):',
      ...(FEEDBACK_ERRORS.length ? FEEDBACK_ERRORS.map(e => '  ' + e) : ['  none']),
    ];
    return lines.join('\n') + '\n';
  },

  /** the visible view as a picture (2D plan or 3D), or null */
  async feedbackPicture() {
    const pane = this.panes.find(x => x.role === 'main');
    if (!pane) return null;
    try { return pane.kind === '3d' ? await this.picture3d(pane.view) : await this.picture2d(pane.view); }
    catch (e) { console.warn('feedback picture', e); return null; }
  },

  async feedbackDialog() {
    const words = h('textarea', { class: 'textarea', id: 'fb-text', rows: 5, placeholder: t('What went wrong, or what would you like?'), style: { minHeight: '110px' } });
    const withPic = h('input', { type: 'checkbox', id: 'fb-pic' });
    withPic.checked = !!this.project && this.panes.some(x => x.role === 'main');
    withPic.disabled = !withPic.checked;
    const body = h('div', { class: 'dlg-body-inner', style: { display: 'grid', gap: '12px' } },
      h('div', { class: 'field' }, h('label', { for: 'fb-text' }, t('Your feedback')), words),
      h('label', { class: 'row-inline', style: { gap: '8px' } }, withPic, h('span', null, t('Add a picture of the view'))),
      h('p', { class: 'note-muted' }, t('Two files are made: your words with the app version, the device and what was open, and the picture. Not your house. Send them to the person who builds the app.')));
    const go = await UI.dialog({ title: t('Send feedback'), body, onOpen: () => setTimeout(() => words.focus(), 50), actions: [{ label: t('Cancel'), value: false }, { label: t('Send'), value: true, kind: 'primary', icon: 'share' }] });
    if (!go) return false;
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const txt = new Blob([this.feedbackText(words.value)], { type: 'text/plain' });
    const files = [{ name: `feedback-${stamp}.txt`, blob: txt }];
    if (withPic.checked) {
      const png = await this.feedbackPicture();
      if (png) files.push({ name: `feedback-${stamp}.png`, blob: png });
    }
    this._lastFeedback = files.map(f => ({ name: f.name, size: f.blob.size }));
    const phone = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (phone && window.File && navigator.canShare) {
      try {
        const fs = files.map(f => new File([f.blob], f.name, { type: f.blob.type }));
        if (navigator.canShare({ files: fs })) { await navigator.share({ files: fs, title: t('House Planner feedback') }); return true; }
      } catch (e) { if (e && e.name === 'AbortError') return false; console.warn('share', e); }
    }
    for (const f of files) this.downloadBlob(f.name, f.blob);
    this.toast(t('Saved: {n}. Send the files to the person who builds the app.', { n: files.map(f => f.name).join(', ') }), { ms: 8000 });
    return true;
  },
});
