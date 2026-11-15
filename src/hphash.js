/* ───────────── hphash.js — the surface hash of the house scene format (hp-hash/1, task 0031) ─────────────
   A port of hsf/surface.py of smholte/house-scene-format (tag v1.0.1, FORMAT.md section 5), bit for bit: a public test
   hashes the format's sample with it. The hash changes when a surface's geometry, its light-map UVs or its map size
   change, and only then: Fresing Render's bake of a surface is used again while the hash stays the same.
   Pure JavaScript (no three.js, no crypto.subtle: the app also runs from a file, and the hash must be synchronous). */

/** SHA-256, fed in pieces: new Sha256().update(bytes).update(…).hex() */
class Sha256 {
  constructor() {
    this.h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    this.buf = new Uint8Array(64); this.n = 0; this.len = 0; this.w = new Uint32Array(64);
  }
  update(bytes) {
    for (let i = 0; i < bytes.length; i++) {
      this.buf[this.n++] = bytes[i];
      if (this.n === 64) { this.block(); this.n = 0; }
    }
    this.len += bytes.length;
    return this;
  }
  block() {
    const K = SHA256_K, w = this.w, b = this.buf, H = this.h;
    for (let i = 0; i < 16; i++) w[i] = (b[i * 4] << 24) | (b[i * 4 + 1] << 16) | (b[i * 4 + 2] << 8) | b[i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], hh = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += hh;
  }
  hex() {
    const bits = this.len * 8;
    const tail = new Uint8Array(((this.n < 56 ? 56 : 120) - this.n) + 8);
    tail[0] = 0x80;
    const hi = Math.floor(bits / 0x100000000), lo = bits >>> 0;
    const k = tail.length - 8;
    tail[k] = hi >>> 24; tail[k + 1] = (hi >>> 16) & 255; tail[k + 2] = (hi >>> 8) & 255; tail[k + 3] = hi & 255;
    tail[k + 4] = lo >>> 24; tail[k + 5] = (lo >>> 16) & 255; tail[k + 6] = (lo >>> 8) & 255; tail[k + 7] = lo & 255;
    const len = this.len;
    this.update(tail);
    this.len = len;
    let s = '';
    for (const x of this.h) s += (x >>> 0).toString(16).padStart(8, '0');
    return s;
  }
}
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

const utf8 = s => new TextEncoder().encode(s);
const HP_HASH = 'hp-hash/1', HP_UV1 = 'hp-uv/1';

/** round half away from zero (never Math.round, which rounds −0.5 up): FORMAT.md section 5 */
const roundHalfAway = x => Math.sign(x) * Math.floor(Math.abs(x) + 0.5);

/** little-endian numbers into bytes */
function leBytes(kind, values) {
  const size = kind === 'u16' ? 2 : 4, out = new Uint8Array(values.length * size), dv = new DataView(out.buffer);
  for (let i = 0; i < values.length; i++) {
    if (kind === 'i32') dv.setInt32(i * size, values[i], true);
    else if (kind === 'u16') dv.setUint16(i * size, values[i], true);
    else dv.setUint32(i * size, values[i], true);
  }
  return out;
}

/** hp-hash/1 of a mesh as stored in the .glb: prims = [{ pos: Float32Array (x, y, z …), uv1: Float32Array | null,
 *  idx: Uint32Array | null }], uv1px = [W, H] for a MAP surface (else null). The first 32 hex digits. */
function hpSurfaceHash(prims, uv1px) {
  const h = new Sha256().update(utf8(HP_HASH)).update(new Uint8Array([0]));
  for (const pr of prims) {
    const n = pr.pos.length / 3;
    const mm = new Array(pr.pos.length);
    for (let i = 0; i < pr.pos.length; i++) {
      const c = pr.pos[i];
      if (!Number.isFinite(c)) throw new Error('a position is not a finite number');
      mm[i] = roundHalfAway(c * 1000);
      if (Math.abs(mm[i]) > 2147483647) throw new Error('a position lies more than 2,147 km from the origin');
    }
    h.update(utf8('P')).update(leBytes('u32', [n])).update(leBytes('i32', mm));
    if (pr.uv1) {
      if (pr.uv1.length !== n * 2) throw new Error('TEXCOORD_1 does not have one value per vertex');
      const q = new Array(pr.uv1.length);
      for (let i = 0; i < pr.uv1.length; i++) q[i] = Math.min(65535, Math.max(0, roundHalfAway(pr.uv1[i] * 65535)));
      h.update(utf8('U')).update(leBytes('u16', q));
    } else h.update(utf8('N'));
    const idx = pr.idx || Array.from({ length: n }, (_, i) => i);
    h.update(leBytes('u32', [idx.length])).update(leBytes('u32', idx));
  }
  if (uv1px) h.update(utf8('S')).update(leBytes('u32', [uv1px[0], uv1px[1]]));
  return h.hex().slice(0, 32);
}

/** one hash for a whole export: SHA-256 of the lines "<id> <hash>\n" sorted by id (UTF-8), first 32 hex digits.
 *  (Sorted as Python sorts text: by code point – the same as by UTF-16 unit for the ids the format allows.) */
function hpSceneHash(pairs) {
  const ids = Object.keys(pairs).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return new Sha256().update(utf8(ids.map(k => `${k} ${pairs[k]}\n`).join(''))).hex().slice(0, 32);
}
