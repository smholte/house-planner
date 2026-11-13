"""Writes dist/gpu-check.html: the 3D check (tools/gpu-check.src.html) with three.js inside, one file that works
offline. Open it on a phone or computer where the house planner's 3D doesn't start: it shows the browser's own
reason, the graphics chip, and runs five short 3D steps like the app's (and remembers a step the driver crashed at).

    python3 tools/make-gpu-check.py"""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'tools', 'gpu-check.src.html'), encoding='utf-8').read()
three = open(os.path.join(ROOT, 'vendor', 'three', 'build', 'three.module.min.js'), encoding='utf-8').read()
assert '</script' not in three.lower() and '<!--' not in three
rev = re.search(r'var \w+="(\d+)"', three).group(1)
# the ES module as a plain script: wrapped in a function returning its exports (as build.py does for the app)
m = re.search(r'export\s*\{([^}]*)\};?\s*$', three)
assert m, 'three export block not found'
pairs = []
for item in m.group(1).split(','):
    item = item.strip()
    if item:
        local, name = [x.strip() for x in item.split(' as ')] if ' as ' in item else (item, item)
        pairs.append(f'{name}:{local}')
three = 'window.__THREE = (function(){\n' + three[:m.start()] + '\nreturn {' + ','.join(pairs) + '};\n})();'
out = src.replace('__THREE_REV__', rev).replace('__THREE_SRC__', three)
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
open(os.path.join(ROOT, 'dist', 'gpu-check.html'), 'w', encoding='utf-8').write(out)
print('dist/gpu-check.html', round(len(out) / 1024), 'KB, three r' + rev)
