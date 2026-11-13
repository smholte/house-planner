"""Collect the English words on screen from the source (string and template literals), for translation.
Template literals become keys with {0}, {1}… where ${…} was. Output: JSON list of {key, files, ctx}."""
import re, json, sys, os, glob

SRC = os.path.join(os.path.dirname(__file__), '..', 'src')
REGEX_BEFORE = set('(,=:[!&|?{};+-*%<>~^') | {''}
KEYWORDS_BEFORE_REGEX = {'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw'}

def tokens(src):
    """yield (kind, value, pos) for strings/templates; skips comments and regex literals"""
    i, n = 0, len(src)
    last = ''  # last significant char or word
    while i < n:
        c = src[i]
        if c in ' \t\r\n': i += 1; continue
        if src.startswith('//', i): j = src.find('\n', i); i = n if j < 0 else j; continue
        if src.startswith('/*', i): j = src.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if c in '"\'':
            j = i + 1; buf = []
            while j < n and src[j] != c:
                if src[j] == '\\': buf.append(src[j:j + 2]); j += 2; continue
                buf.append(src[j]); j += 1
            yield ('str', ''.join(buf), i); i = j + 1; last = 'x'; continue
        if c == '`':
            j = i + 1; parts = []; cur = []; k = 0
            while j < n and src[j] != '`':
                if src[j] == '\\': cur.append(src[j:j + 2]); j += 2; continue
                if src.startswith('${', j):
                    depth = 1; j += 2; start = j
                    while j < n and depth:
                        if src[j] == '{': depth += 1
                        elif src[j] == '}': depth -= 1
                        elif src[j] in '"\'`':
                            q = src[j]; j += 1
                            while j < n and src[j] != q:
                                if src[j] == '\\': j += 1
                                j += 1
                        j += 1
                    inner = src[start:j - 1]
                    # strings inside the expression are collected too
                    for tk in tokens(inner): yield tk
                    cur.append('{%d}' % k); k += 1
                    continue
                cur.append(src[j]); j += 1
            yield ('tpl', ''.join(cur), i); i = j + 1; last = 'x'; continue
        if c == '/':
            if last in REGEX_BEFORE or last in KEYWORDS_BEFORE_REGEX:
                # regex literal
                j = i + 1; inclass = False
                while j < n:
                    if src[j] == '\\': j += 2; continue
                    if src[j] == '[': inclass = True
                    elif src[j] == ']': inclass = False
                    elif src[j] == '/' and not inclass: break
                    elif src[j] == '\n': break
                    j += 1
                j += 1
                while j < n and src[j].isalpha(): j += 1
                i = j; last = 'x'; continue
            i += 1; last = '/'; continue
        m = re.match(r'[A-Za-z_$][\w$]*', src[i:i + 40])
        if m: last = m.group(0); i += len(last); continue
        m = re.match(r'\d[\d.eE_xXa-fA-F]*', src[i:i + 40])
        if m: last = 'x'; i += len(m.group(0)); continue
        last = c if c not in ')]' else 'x'; i += 1

KEYNAMES = {'Escape', 'Enter', 'Delete', 'Backspace', 'Shift', 'Control', 'Meta', 'Alt', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'AbortError', 'NotAllowedError', 'SecurityError', 'NotFoundError', 'Helvetica', 'Helvetica-Bold', 'WinAnsiEncoding', 'Barlow'}

def unescape(s):
    return re.sub(r'\\(u\{?[0-9a-fA-F]{4}\}?|.)', lambda m: {'n': '\n', 't': '\t', "'": "'", '"': '"', '\\': '\\', '`': '`'}.get(m.group(1), m.group(0)) if not m.group(1).startswith('u') else chr(int(m.group(1).strip('u{}'), 16)), s)

def ui_like(s, in_t):
    s2 = s.strip()
    if not re.search(r'[A-Za-z]{2}', s2): return False
    if s2 in KEYNAMES: return False
    if re.search(r'^[.#\[<@/]|=>|\$\{|^\w+\(|;\s*$|\d+px|^(rgba?|hsla?|var|url|calc)\(|--[a-z]', s2): return False
    if re.match(r'^[MmLlHhVvCcZzAaQqSsTt][\d.\-]', s2): return False
    if re.search(r'[a-z]:[a-z]', s2) and ' ' not in s2: return False
    if '/' in s2 and ' ' not in s2: return False
    if re.match(r'^[\w-]+$', s2):
        if in_t: return True
        # a single word: capitalised words count (Select, Done); lower case identifiers don't
        return bool(re.match(r'^[A-Z][a-z]+$', s2))
    if re.match(r'^[a-z0-9_.-]+( [a-z0-9_.-]+)*$', s2) and not in_t:
        # lower-case words only: CSS classes ('btn sm primary') unless it reads like a sentence
        words = s2.split()
        if any(w in {'btn', 'sm', 'ghost', 'icon', 'primary', 'solid', 'danger', 'num', 'seg', 'chip', 'active', 'on', 'off', 'tag', 'row', 'list'} for w in words): return False
        return len(words) >= 3
    if re.search(r'(^|\s)(is-|has-)\w', s2) and not in_t: return False
    return True

out = {}
for path in sorted(glob.glob(os.path.join(SRC, '*.js'))):
    name = os.path.basename(path)
    if name in ('sw.js',): continue
    src = open(path, encoding='utf-8').read()
    for kind, val, pos in tokens(src):
        val = unescape(val)
        in_t = bool(re.search(r'\bt\(\s*$', src[max(0, pos - 6):pos]))
        if '\n' in val and len(val) > 200: continue
        key = re.sub(r'\s+', ' ', val).strip()
        if not key or len(key) > 400 or not ui_like(key, in_t): continue
        e = out.setdefault(key, {'key': key, 'files': [], 'ctx': src[max(0, pos - 70):pos].replace('\n', ' ')[-70:]})
        if name not in e['files']: e['files'].append(name)
# the page template: text between tags and the title / aria-label / placeholder attributes
html = open(os.path.join(SRC, 'index.html'), encoding='utf-8').read()
html = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', html, flags=re.S)
for m in re.finditer(r'>([^<>]+)<|(?:title|aria-label|placeholder)="([^"]+)"', html):
    key = re.sub(r'\s+', ' ', (m.group(1) or m.group(2) or '')).strip()
    if key and '__' not in key and ui_like(key, True):
        out.setdefault(key, {'key': key, 'files': ['index.html'], 'ctx': ''})
items = sorted(out.values(), key=lambda e: (e['files'][0], e['key']))
json.dump(items, open(sys.argv[1] if len(sys.argv) > 1 else '/dev/stdout', 'w'), ensure_ascii=False, indent=0)
print(len(items), 'strings', file=sys.stderr)
