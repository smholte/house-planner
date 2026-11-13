/* ───────────── reuse.js — after an edit, only the storey that changed is built again in 3D ─────────────
   A 3D build makes every storey (walls, floors, ceilings, doors, windows, the builder's model, furniture, sockets,
   stairs), then the garden, then merges what never moves (batch.js). After an edit or an undo the app asks for a
   build with spec.reuse: each storey's group carries a signature of everything it was built from (its walls, rooms,
   openings, points, stairs, voids – also of the storey above, whose stairwell cuts this ceiling –, its furniture, place
   and the selection); a storey whose signature is the same is put back as it was – not built, not merged again – with
   its pick pieces, doors, lamps and selection ring. The garden likewise (its own signature: the plot and the garden
   are built from their own data alone). Anything that changes the whole picture (light, quality, the switches in the View menu, theme,
   door states, models that arrived, the builder's model, the Original) gives a different overall signature: then
   everything is built again, as before. Builds that are not after an edit (opening, switching, loading) never reuse. */

let _reuseId = 0;
function sigHash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; }

Object.assign(View3D.prototype, {
  /** what the whole picture depends on, besides the storeys themselves */
  reuseGlobal(spec) {
    const s = (this.app && this.app.settings) || {}, p = (this.app && this.app.project) || {};
    const pick = ['cut', 'ground', 'mode', 'light', 'ceilings', 'walk', 'plinth', 'windows', 'outside', 'roof', 'floors', 'scope', 'labels'].map(k => spec[k]);
    const shellId = spec.shell ? (spec.shell._rid || (spec.shell._rid = ++_reuseId)) : 0;
    const models = typeof MODELS !== 'undefined' ? [MODELS.geo.size, [...MODELS.user.values()].map(u => u.state).join(',')] : [];
    return JSON.stringify([pick, spec.entries.length, shellId, spec.origPlan ? sigHash(JSON.stringify(spec.origPlan)) : 0,
      cssVar('--paper'), cssVar('--ink'), document.documentElement.dataset.theme || '', quality3d(s), VIEW_KEYS.map(k => s[k]),
      p.doorState || null, (p.models || []).length, models, !!this.fast, !!this.high, !!this.opts.mini, TEXLIB.gen]);
  },
  /** everything one storey's group is built from */
  entrySig(spec, en) {
    const sid = en.storey.id, up = en.upperId || null, plan = en.plan;
    const part = pl => {
      const wids = new Set();
      const walls = pl.walls.filter(w => w.storey === sid && wids.add(w.id));
      return [walls, pl.rooms.filter(r => r.storey === sid), pl.openings.filter(o => wids.has(o.wall)), (pl.points || []).filter(q => q.storey === sid),
        (pl.stairs || []).filter(x => x.lower === sid || x.upper === sid || (up && (x.lower === up || x.upper === up))), (pl.voids || []).filter(v => v.storey === sid || v.storey === up)];
    };
    return sigHash(JSON.stringify([en.storey, en.offset, en.y || 0, en.label || '', en.bbox || null, en.versionId || '', !!en.edit, !!en.faintFurn, up,
      part(plan), en.basePlan && en.basePlan !== plan ? part(en.basePlan) : 0, en.furniture || [], en.diff ? Math.random() : 0, spec.selection || null]));
  },
  /** the garden: the plot, its areas, walls, hedges and plants, where it lies (it is built from these alone) */
  gardenSig(spec, cutH) {
    return sigHash(JSON.stringify([spec.site || null, spec.garden || null, spec.gardenAt || null, spec.gshow || null, cutH]));
  },
  /** after an edit: which storeys (and the garden) can stay; null = build everything */
  reusePlan(spec) {
    const gsig = this.reuseGlobal(spec), prev = this._rGlobal;
    this._rGlobal = gsig; this._rGlobalPrev = prev;
    if (!spec.reuse || prev !== gsig || !this.group.children.length) return null;
    const old = new Map();
    let garden = null;
    for (const r of this.group.children) { if (r.userData.garden) garden = r; else if (r.userData.rsig) old.set(r.userData.rsig, r); }
    const sigs = spec.entries.map(en => this.entrySig(spec, en));
    const byEntry = sigs.map(sg => { const r = old.get(sg); if (r) old.delete(sg); return r || null; });
    const keep = new Set(byEntry.filter(Boolean));
    const cutH = spec.cut && spec.scope !== 'house' && !spec.walk ? 1.15 : null;
    const kept = keep.size;
    if (garden && spec.site && garden.userData.rsig === this.gardenSig(spec, cutH)) keep.add(garden); else garden = null;
    // (for the tests and the speed check: storeys kept / built, and the garden)
    this.reused = { kept, built: spec.entries.length - kept, garden: spec.site ? (garden ? 'kept' : 'built') : null };
    return { sigs, byEntry, keep, garden };
  },
  /** empty the view, but keep the groups that stay (their geometry is not thrown away) */
  clearKeep(keep) {
    for (const r of [...this.group.children]) {
      if (keep.has(r)) continue;
      r.traverse(o => { if (o.geometry && !(o.userData && o.userData.keep)) o.geometry.dispose(); });
    }
    this.group.clear();
    if (this.ao) this.ao.box = null;
    this.pickables = [];
    this.labels = [];
    this.labelLayer.textContent = '';
    this.clearExtra();
  },
  /** the lists a storey adds to while it is built: pick pieces, doors, lamps, furniture to pick, the selection ring */
  regSnap() {
    return { pick: this.pickables.length, light: this.lightSpots.length, fp: this.furnPick.length, ring: this.furnRing, doors: new Map([...this.doorMap].map(([k, v]) => [k, v.length])) };
  },
  regSince(sn) {
    const doors = [];
    for (const [k, v] of this.doorMap) { const from = sn.doors.get(k) || 0; if (v.length > from) doors.push([k, v.slice(from)]); }
    return { pick: this.pickables.slice(sn.pick), light: this.lightSpots.slice(sn.light), fp: this.furnPick.slice(sn.fp), ring: this.furnRing !== sn.ring ? this.furnRing : null, doors };
  },
  regRestore(root) {
    const R = root.userData.reg;
    if (!R) return;
    this.pickables.push(...R.pick);
    this.lightSpots.push(...R.light);
    this.furnPick.push(...R.fp);
    if (R.ring) this.furnRing = R.ring;
    for (const [k, list] of R.doors) { if (!this.doorMap.has(k)) this.doorMap.set(k, []); this.doorMap.get(k).push(...list); }
  },
});
