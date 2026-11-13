// GPU-compressed copies (KTX2 / Basis Universal) of the library's pictures (task 0009), called by
// tools/build-library.py:  node tools/lib-ktx2.mjs < jobs.json   (jobs: [{ in, out, kind }])
//   kind 'color'          ETC1S, sRGB          (the colour pictures: small files; the GPU gets ETC / BC / ASTC)
//   kind 'normal'         UASTC + zstd, linear (relief: ETC1S would make it blocky)
//   kind 'rough' / other  ETC1S, linear
// The picture is turned upside down first: the app's pictures are uploaded flipped (three.js flipY), a compressed
// texture can't be, so the file holds it the way the GPU gets it. Mipmaps are made here.
// Needs: npm ci --prefix tools (ktx2-encoder, sharp – pinned in tools/package.json).
import fs from 'fs';
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';

const jobs = JSON.parse(fs.readFileSync(0, 'utf8'));
const decode = async buf => {
  const { data, info } = await sharp(buf).flip().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
const log = console.log;
for (const j of jobs) {
  const o = j.kind === 'normal'
    ? { isUASTC: true, needSupercompression: true, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }
    : { isUASTC: false, qualityLevel: 160, compressionLevel: 2, isPerceptual: j.kind === 'color', isSetKTX2SRGBTransferFunc: j.kind === 'color' };
  console.log = () => {};        // (the encoder talks a lot)
  const out = await encodeToKTX2(new Uint8Array(fs.readFileSync(j.in)), { ...o, generateMipmap: true, imageDecoder: decode });
  console.log = log;
  fs.writeFileSync(j.out, out);
  log(j.out.split('/').pop(), out.length);
}
