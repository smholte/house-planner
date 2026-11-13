#!/usr/bin/env python3
"""A small PDF for the made-up test house's documents (two A4 pages: the ground floor and the first floor drawn as
simple outlines) and its thumbnail: python3 tools/testhouse/make_pdf.py → tools/testhouse/plans.pdf, plans-thumb.jpg.
Written by hand (no PDF library), so the file is the same on every run."""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
S = 40          # points per metre (1:~70 on A4)
OX, OY = 120, 300

GROUND = [  # rooms (x0, y0, x1, y1) in metres from the inner faces of the outside walls, y 0 at the front
    ('Hal', 2.05, 0, 4.0, 4.4), ('Toilet', 0, 0, 1.95, 1.35), ('Meterkast', 0, 1.45, 1.95, 2.45), ('Bijkeuken', 0, 2.55, 1.95, 4.4),
    ('Keuken', 4.1, 0, 8.0, 4.4), ('Woonkamer', 0, 4.5, 8.0, 9.6)]
FIRST = [
    ('Overloop', 2.05, 0, 4.0, 5.5), ('Badkamer', 0, 0, 1.95, 3.4), ('Toilet', 0, 3.5, 1.95, 5.5), ('Slaapkamer 1', 4.1, 0, 8.0, 5.5),
    ('Slaapkamer 2', 0, 5.6, 2.95, 9.6), ('Slaapkamer 3', 3.05, 5.6, 8.0, 9.6)]


def page(title, rooms):
    ops = ['0.6 w 0 0 0 RG']
    ops.append(f'{OX - 0.4 * S:.1f} {OY - 0.4 * S:.1f} {8.8 * S:.1f} {10.4 * S:.1f} re S')
    for name, x0, y0, x1, y1 in rooms:
        ops.append(f'{OX + x0 * S:.1f} {OY + y0 * S:.1f} {(x1 - x0) * S:.1f} {(y1 - y0) * S:.1f} re S')
        ops.append(f'BT /F1 9 Tf {OX + x0 * S + 4:.1f} {OY + (y0 + y1) / 2 * S:.1f} Td ({name}) Tj ET')
    ops.append(f'BT /F1 16 Tf 60 780 Td ({title}) Tj ET')
    ops.append('BT /F1 9 Tf 60 762 Td (Testhuis - verzonnen huis voor de app en haar tests, geen echt ontwerp) Tj ET')
    ops.append('BT /F1 9 Tf 60 60 Td (Voorgevel onder, 1:70 op A4) Tj ET')
    return '\n'.join(ops).encode('latin-1')


def make_pdf(path):
    pages = [page('Begane grond', GROUND), page('1e verdieping', FIRST)]
    objs = []
    objs.append(b'<< /Type /Catalog /Pages 2 0 R >>')
    kids = ' '.join(f'{4 + 2 * i} 0 R' for i in range(len(pages)))
    objs.append(f'<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>'.encode())
    objs.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    for i, c in enumerate(pages):
        objs.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {5 + 2 * i} 0 R >>'.encode())
        objs.append(b'<< /Length ' + str(len(c)).encode() + b' >>\nstream\n' + c + b'\nendstream')
    out = bytearray(b'%PDF-1.4\n')
    offs = []
    for i, o in enumerate(objs):
        offs.append(len(out))
        out += f'{i + 1} 0 obj\n'.encode() + o + b'\nendobj\n'
    x = len(out)
    out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'.encode()
    for o in offs:
        out += f'{o:010d} 00000 n \n'.encode()
    out += f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n'.encode()
    open(path, 'wb').write(bytes(out))


def make_thumb(path):
    W, H = 200, 283
    k = W / 595
    im = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(im)
    Y = lambda y: H - y * k
    d.rectangle([(OX - 0.4 * S) * k, Y(OY + 10.0 * S), (OX + 8.4 * S) * k, Y(OY - 0.4 * S)], outline='black')
    for _, x0, y0, x1, y1 in GROUND:
        d.rectangle([(OX + x0 * S) * k, Y(OY + y1 * S), (OX + x1 * S) * k, Y(OY + y0 * S)], outline='black')
    d.rectangle([60 * k, Y(796), 300 * k, Y(780)], fill='black')
    im.save(path, 'JPEG', quality=80)


if __name__ == '__main__':
    make_pdf(os.path.join(HERE, 'plans.pdf'))
    make_thumb(os.path.join(HERE, 'plans-thumb.jpg'))
    print('plans.pdf', os.path.getsize(os.path.join(HERE, 'plans.pdf')), 'bytes; plans-thumb.jpg')
