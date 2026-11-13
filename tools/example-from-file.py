"""Make the example house from a house file exported by the app (.house.gz or .house.json):
    python3 tools/example-from-file.py <export file>          → build/example.json (then python3 build.py --no-house)
    python3 tools/example-from-file.py <export file> --house  → house/example.json (the house built into the app)
The first house in the file becomes the example, with its versions (Original and plans, gardens), furniture, notes,
people, paths and plot. What only belongs to one screen is left out (slices, view settings, open / closed doors,
viewpoints), so the example opens fresh. The 3D shell comes from the file (its shell asset); when it is the same as
the one already packed, that one is kept."""
import base64, gzip, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'house' if '--house' in sys.argv else 'build', 'example.json')


def read_export(path):
    raw = open(path, 'rb').read()
    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    d = json.loads(raw.decode('utf-8'))
    if d.get('format') != 'house-planner':
        raise SystemExit('not a house file from the app')
    return d


def main():
    args = [a for a in sys.argv[1:] if a != '--house']
    if not args:
        raise SystemExit(__doc__)
    d = read_export(args[0])
    entry = d['projects'][0]
    p = entry['project']
    shell_json = None
    if p.get('shell'):
        a = d.get('assets', {}).get(p['shell'].get('assetId'))
        if a and a.get('kind') == 'shell':
            shell_json = a['json']
    old = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else None
    if shell_json is None and not old:
        raise SystemExit('the file has no 3D shell and there is no example to take it from')
    if old and (shell_json is None or gzip.decompress(base64.b64decode(old['shellGz'])).decode('utf-8') == shell_json):
        shell_gz = old['shellGz']
    else:
        shell_gz = base64.b64encode(gzip.compress(shell_json.encode('utf-8'), 9, mtime=0)).decode()
    for k in ('shell', 'slices', 'viewSettings', 'doorState', 'homeViews', 'viewpoints'):
        p.pop(k, None)
    p['example'] = True
    p['walk'] = {'nodes': [], 'edges': [], 'routes': []}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'project': p, 'shellGz': shell_gz}, f, ensure_ascii=False, separators=(',', ':'))
    vs = ', '.join(v['name'] for v in p['versions'])
    items = sum(len(l['items']) for l in (p.get('furniture') or {}).get('layouts', []))
    print(f'{OUT}: “{p["name"]}” – {vs}; {items} pieces of furniture; plot {"yes" if p.get("site") else "no"}')


if __name__ == '__main__':
    main()
