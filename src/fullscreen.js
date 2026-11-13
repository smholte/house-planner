/* ───────────── fullscreen.js — the app on the whole screen (like F11), with a button at the top right ─────────────
   The browser's full screen (the Fullscreen API): the app fills the screen, without tabs, address bar or the app
   window's title bar. The button at the right end of the top bar (computers; on phones and narrow windows the top bar is
   full: ⋯ → Full screen), Search "full screen". The button again, or Esc, leaves it. Not shown where the browser can't
   do it (iPhone Safari). (F11 is the browser's own full screen – a page can't see it; the button then simply asks for
   the app's.) */
const FS = {
  el: () => document.fullscreenElement || document.webkitFullscreenElement || null,
  ok: () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled),
};

Object.assign(app, {
  fullscreenSupported() { return FS.ok(); },
  isFullscreen() { return !!FS.el(); },
  /** on or off (from a click or a key: browsers only allow it then) */
  async toggleFullscreen() {
    try {
      if (FS.el()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else {
        const el = document.documentElement;
        await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
      }
    } catch (e) {
      this.toast(t('Full screen is not possible here.'));
    }
    this.renderFullscreenBtn();
  },
  /** the button: its picture and words follow the state (also when Esc left full screen) */
  renderFullscreenBtn() {
    const b = $('#btn-fullscreen');
    if (!b) return;
    b.hidden = !FS.ok();
    const on = !!FS.el(), lab = on ? t('Leave full screen') : t('Full screen');
    b.textContent = '';
    b.appendChild(icon(on ? 'fullscreen-exit' : 'fullscreen'));
    b.setAttribute('aria-label', lab);
    b.setAttribute('aria-pressed', String(on));
    b.title = lab + (on ? ' (Esc)' : '');
    document.documentElement.classList.toggle('is-fullscreen', on);
  },
  /** the ⋯ menu's line for it (null where the browser can't) */
  fullscreenMenuItem() {
    if (!FS.ok()) return null;
    const on = !!FS.el();
    return { label: on ? t('Leave full screen') : t('Full screen'), icon: on ? 'fullscreen-exit' : 'fullscreen', id: 'mi-fullscreen', fn: () => this.toggleFullscreen() };
  },
});
document.addEventListener('fullscreenchange', () => app.renderFullscreenBtn());
document.addEventListener('webkitfullscreenchange', () => app.renderFullscreenBtn());
