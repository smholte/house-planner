"""Pictures of a house's furniture models for Add furniture → Library (task 0028).

    python3 tools/model-thumbs.py <house folder> [--all]
    python3 tools/model-thumbs.py --library [--all]       the same for the public library's models (Poly Haven, task 0051):
                                                           build/library/library.json gets each picture as a file with thumb: true

Reads <house>/models/contents.csv and, for every .glb that has no picture yet (or all of them with --all), draws it in
the built app (dist/house-planner.html: python3 build.py first) exactly as the catalogue draws a model – from the front
right, at its real size – and writes <house>/models/thumbs/<name>.webp (240 × 180, a few kB). build.py puts each picture
into the library next to its model, so the app never draws them at start. The pictures are made once and kept with the
models (commit them); the test browser draws in software, which is fine for a picture this small."""
import csv, base64, os, sys, threading, http.server, functools, socketserver

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']


def library_thumbs(argv):
    """pictures for the library's model items that have none (or all with --all)"""
    import importlib.util
    spec = importlib.util.spec_from_file_location('build_library', os.path.join(ROOT, 'tools', 'build-library.py'))
    BL = importlib.util.module_from_spec(spec); spec.loader.exec_module(BL)
    man = BL.load()
    todo = [it for it in man['items'] if it['kind'] == 'model' and ('--all' in argv or not any(f.get('thumb') for f in it['files']))]
    if not todo:
        print('library model pictures: all there')
        return 0
    def draw(pg, it):
        data = base64.b64encode(open(os.path.join(BL.LIB, it['files'][0]['f']), 'rb').read()).decode()
        url = pg.evaluate("""async ([b64, size]) => { const bin = atob(b64), u = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            return window.__hp.glbThumb(u.buffer, size); }""", [data, it['size']])
        assert url.startswith('data:image/webp;base64,'), url[:40]
        return base64.b64decode(url.split(',', 1)[1])
    with browser_page() as pg:
        for it in todo:
            it['files'] = [f for f in it['files'] if not f.get('thumb')]
            it['files'].append(dict(BL.put(BL.LIB, 'models', it['id'].replace(':', '-'), 'webp', draw(pg, it)), thumb=True))
    BL.save(man)
    BL.prune()
    print(f'library model pictures: {len(todo)} made, {sum(f["b"] for it in todo for f in it["files"] if f.get("thumb")) / 1000:.0f} kB')
    return 0


class browser_page:
    """the built app (dist/house-planner.html) open in the test browser, served from a local port"""
    def __enter__(self):
        dist = os.path.join(ROOT, 'dist')
        if not os.path.exists(os.path.join(dist, 'house-planner.html')):
            sys.exit('Build the app first: python3 build.py --no-house')
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=dist)
        handler.log_message = lambda *a: None
        self.srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        from playwright.sync_api import sync_playwright
        self.pw = sync_playwright().start()
        self.b = self.pw.chromium.launch(args=GL)
        pg = self.b.new_page()
        pg.goto(f'http://127.0.0.1:{self.srv.server_address[1]}/house-planner.html')
        pg.wait_for_function('() => window.__hp && window.__hp.glbThumb', timeout=60000)
        return pg

    def __exit__(self, *a):
        self.b.close(); self.pw.stop(); self.srv.shutdown()


def main(argv):
    if argv[:1] == ['--library']:
        return library_thumbs(argv)
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
