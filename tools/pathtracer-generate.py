"""three-mesh-bvh: make the *.generated.js files from the templates (as its own build does with 'preprocess'):
INDIRECT false → name.generated.js, INDIRECT true → name_indirect.generated.js"""
import os, re, sys
src = sys.argv[1]
pat = re.compile(r'/\* @if INDIRECT \*/(.*?)(?:/\* @else \*/(.*?))?/\* @endif \*/', re.S)
n = 0
for dp, _, fs in os.walk(src):
    for f in fs:
        if not f.endswith('.template.js'): continue
        t = open(os.path.join(dp, f)).read()
        assert t.count('/* @if') == t.count('/* @endif */')
        for ind in (False, True):
            out = pat.sub(lambda m: (m.group(1) if ind else (m.group(2) or '')), t)
            out = out.replace('/* @echo INDIRECT_STRING */', '_indirect' if ind else '')
            assert not re.search(r'/\* @(if|else|endif|echo)', out), f
            name = f.replace('.template.js', ('_indirect' if ind else '') + '.generated.js')
            open(os.path.join(dp, name), 'w').write(out); n += 1
print('generated', n)
