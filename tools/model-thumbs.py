"""Pictures of a house's furniture models for Add furniture → Library (task 0028).

    python3 tools/model-thumbs.py <house folder> [--all]

Reads <house>/models/contents.csv and, for every .glb that has no picture yet (or all of them with --all), draws it in
the built app (dist/house-planner.html: python3 build.py first) exactly as the catalogue draws a model – from the front
right, at its real size – and writes <house>/models/thumbs/<name>.webp (240 × 180, a few kB). build.py puts each picture
into the library next to its model, so the app never draws them at start. The pictures are made once and kept with the
models (commit them); the test browser draws in software, which is fine for a picture this small."""
import csv, base64, os, sys, threading, http.server, functools, socketserver

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']


def main(argv):
    if not argv or argv[0].startswith('-'):
        sys.exit(__doc__)
    house, every = os.path.abspath(argv[0]), '--all' in argv
    mdir = os.path.join(house, 'models')
    rows = [r for r in csv.DictReader(open(os.path.join(mdir, 'contents.csv'), encoding='utf-8')) if r.get('file', '').endswith('.glb')]
    out_dir = os.path.join(mdir, 'thumbs')
    os.makedirs(out_dir, exist_ok=True)
    todo = []
    for r in rows:
        slug = os.path.splitext(os.path.basename(r['file']))[0]
        out = os.path.join(out_dir, slug + '.webp')
        if every or not os.path.exists(out):
            todo.append((r, out))
    if not todo:
        print(f'model pictures: all {len(rows)} there')
        return 0
    dist = os.path.join(ROOT, 'dist')
    if not os.path.exists(os.path.join(dist, 'house-planner.html')):
        sys.exit('Build the app first: python3 build.py --no-house')
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=dist)
    handler.log_message = lambda *a: None
    srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(args=GL)
        pg = b.new_page()
        pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/house-planner.html')
        pg.wait_for_function('() => window.__hp && window.__hp.glbThumb', timeout=60000)
        for r, out in todo:
            data = base64.b64encode(open(os.path.join(mdir, r['file']), 'rb').read()).decode()
            size = [float(r[k]) / 100 for k in ('width cm', 'depth cm', 'height cm')]
            url = pg.evaluate("""async ([b64, size]) => { const bin = atob(b64), u = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
                return window.__hp.glbThumb(u.buffer, size); }""", [data, size])
            assert url.startswith('data:image/webp;base64,'), url[:40]
            open(out, 'wb').write(base64.b64decode(url.split(',', 1)[1]))
            print(f'  {os.path.basename(out)}  {os.path.getsize(out) / 1000:.1f} kB')
        b.close()
    srv.shutdown()
    print(f'model pictures: {len(todo)} made, in {out_dir}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
