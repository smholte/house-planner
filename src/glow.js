/* ───────────── glow.js — Evening: a soft glow around every lamp ─────────────
   In the Evening light every ceiling light point and every lamp in the furniture gets a soft, warm halo (a sprite
   with a radial gradient, added to the picture): rooms read as lit from outside and from above, also the ones the
   eight real lights of the view don't reach. Not in Fast, not above the cut of a cut-open storey view. */

let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const S = 128, cv = makeCanvas(S, S), g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,240,215,1)'); gr.addColorStop(0.18, 'rgba(255,214,160,0.55)'); gr.addColorStop(0.5, 'rgba(255,190,120,0.16)'); gr.addColorStop(1, 'rgba(255,180,110,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  _glowTex = new THREE.CanvasTexture(cv);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

Object.assign(View3D.prototype, {
  /** after a build (and when the light changes): the halos of this picture */
  buildGlow() {
    if (this.glowGroup) { this.scene.remove(this.glowGroup); this.glowGroup.traverse(o => { if (o.material) o.material.dispose(); }); this.glowGroup = null; }
    if (!this.evening || this.fast || !this.spec) return;
    const spec = this.spec, cutH = spec.cut && spec.scope !== 'house' && !spec.walk ? 1.15 : null;
    const ys = new Map((spec.entries || []).map(en => [en.storey.id, en.y || 0]));
    const G = new THREE.Group();
    G.name = 'glow';
    for (const sp of this.lightSpots || []) {
      const base = ys.get(sp.storey) || 0;
      if (cutH != null && sp.pos.y - base > cutH) continue;
      if (sp.hidden) continue;    // its fitting is switched off (View → Ceiling / Electrics)
      const m = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: sp.furn ? 0.55 : 0.45 });
      const s = new THREE.Sprite(m);
      const k = sp.furn ? 0.55 : 0.85;
      s.scale.set(k, k, 1);
      s.position.copy(sp.pos);
      if (!sp.furn) s.position.y += 0.3;     // the ceiling light itself, not the spot the light is placed at
      s.renderOrder = 3;
      s.userData.glow = sp.room || sp.furn || true;
      G.add(s);
    }
    this.glowGroup = G;
    this.scene.add(G);
  },
});
