"""Make a PDF smaller for the house's documents: the big pictures in it are made smaller and saved again as JPEG;
the lines and text (vectors) stay as they are. Pages, sizes and look stay the same.

    python3 tools/pdf-slim.py in.pdf out.pdf [--scale 0.5] [--min-kb 100] [--quality 78] [--max-px 2400] [--flate]

  --scale    the pictures' size × this (0.5 = half the pixels each way; 1 = only saved again)
  --max-px   and never longer than this on their long side
  --min-kb   only pictures bigger than this
  --quality  JPEG quality
  --flate    also the pictures stored without loss (renders, photos) become JPEG

Needs pikepdf and Pillow. A picture the tool can't read is left as it was."""
import sys, io, argparse
import pikepdf
from pikepdf import Name, PdfImage
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--scale', type=float, default=1.0)
ap.add_argument('--max-px', type=int, default=100000)
ap.add_argument('--min-kb', type=float, default=100)
ap.add_argument('--quality', type=int, default=78)
ap.add_argument('--flate', action='store_true')
a = ap.parse_args()

pdf = pikepdf.open(a.src)
done = skipped = 0
before = after = 0
for obj in list(pdf.objects):
    if not isinstance(obj, pikepdf.Stream) or obj.get('/Subtype') != Name.Image:
        continue
    raw = obj.read_raw_bytes()
    if len(raw) < a.min_kb * 1024:
        continue
    filt = obj.get('/Filter')
    filt = filt[0] if isinstance(filt, pikepdf.Array) and len(filt) == 1 else filt
    if filt == Name.DCTDecode:
        pass
    elif filt == Name.FlateDecode and a.flate:
        pass
    else:
        skipped += 1; continue
    if obj.get('/ImageMask') or int(obj.get('/BitsPerComponent', 8)) != 8:
        skipped += 1; continue
    cs = obj.get('/ColorSpace')
    if isinstance(cs, pikepdf.Array) and len(cs) and cs[0] == Name.Indexed:
        skipped += 1; continue
    try:
        im = PdfImage(obj).as_pil_image()
    except Exception as e:  # noqa
        print('  skip (cannot read):', e); skipped += 1; continue
    if im.mode == 'CMYK':
        # Adobe's CMYK JPEGs are stored with the inks turned around (Pillow gives them as stored); a /Decode
        # [1 0 …] turns them around once more
        dec = obj.get('/Decode')
        flip = bool(im.info.get('adobe')) != (dec is not None and len(dec) >= 2 and float(dec[0]) == 1)
        if flip:
            from PIL import ImageChops
            im = ImageChops.invert(im)
        im = im.convert('RGB')
    elif im.mode not in ('RGB', 'L'):
        im = im.convert('RGB')
    w, h = im.size
    k = min(a.scale, a.max_px / max(w, h))
    if k < 0.999:
        im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=a.quality, optimize=True, progressive=False)
    data = b.getvalue()
    if len(data) >= len(raw) * 0.95:
        skipped += 1; continue
    obj.write(data, filter=Name.DCTDecode)
    obj.Width, obj.Height = im.size[0], im.size[1]
    obj.ColorSpace = Name.DeviceGray if im.mode == 'L' else Name.DeviceRGB
    obj.BitsPerComponent = 8
    for k2 in ('/Decode', '/DecodeParms', '/Interpolate'):
        if k2 in obj: del obj[k2]
    before += len(raw); after += len(data); done += 1
pdf.save(a.dst, compress_streams=True, object_stream_mode=pikepdf.ObjectStreamMode.generate,
         recompress_flate=True)
print(f'{a.src}: {done} pictures {before / 1e6:.2f} → {after / 1e6:.2f} MB, {skipped} left as they were')
