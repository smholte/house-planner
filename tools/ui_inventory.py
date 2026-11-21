"""What the app offers a person, and which test presses it (task 0047).

    python3 tools/ui_inventory.py              the actions found in src/, how many have a test, the gaps by lane
    python3 tools/ui_inventory.py --write      write tests/features.json (keeps its not-yet-tested list and notes)
    python3 tools/ui_inventory.py --check      the guard (tools/ci_precheck.py runs it): fails on a new action with no
                                               test that is not on the not-yet-tested list
    python3 tools/ui_inventory.py --json       everything as JSON

An **action** is something a person can press: a button, a menu or ⋯ entry, a tool, a mode, a field with an id. It is
found in the source (src/index.html and the h('button', …) / menu items of src/*.js), without a browser, so the
precheck can run it in a second. Its stable id, in this order (the first one it has):

    #<id>                  the element's id (index.html, h('button', { id: 'x' }), a menu item's id: 'x')
    [data-tool=<x>]        a data-tool / data-mode / data-dim value written in the source (tool rail, bars)
    btn:<English text>     a button without an id: its aria-label / title / text, which is its i18n key (the English
                           text is the key in i18n/translations.json, so it changes only when the text changes)
    menu:<English text>    a menu, ⋯ or toast entry ({ label: t('…'), fn: … })

Ids are used because the tests already press most buttons by them; an i18n key is the next best (the tests press
menus by their English text: has-text("…")). A button whose text is made at run time (a variable, a list of labels
mapped into segment buttons) has no stable id here: it counts under its file's "no stable id" (a follow-up gives it one).

A test **covers** an action when a public test file (tests/test_*.py) names it the way a test presses it: '#id' or
the bare id in quotes, data-tool="x", or the English text in quotes / has-text / text= – or when a test file says so in
a comment:  # covers: #btn-x, menu:Some entry   (for a test that reaches it in a way a search cannot tell).

tests/features.json holds every action with the test files that cover it, and the list **not_yet_tested**: actions
with no test today, each with its lane, size (S/M/L) and the task that will test it. The guard (--check) fails when:
  - an action in the source is not in features.json (a new button: add a test, or put it on not_yet_tested with a
    task number – python3 tools/ui_inventory.py --write lists it there for you to fill in),
  - an action has no covering test and is not on not_yet_tested,
  - an action on not_yet_tested now has a test (take it off the list: the list only shrinks).
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FEATURES = os.path.join(ROOT, 'tests', 'features.json')

# the lanes of the private TASKS.md, by source file (a gap is listed under its file's lane)
LANES = {
    'Plan & edit': 'model outline plan2d plan2d-x edit stairs voids openings facade drawings ifc ifc2house history',
    '3D': 'view3d view3d-x batch smooth reuse texlib hq glow speed autoq autoexp denoise render walk tour ar sun sunnear fullscreen',
    'Furnish': 'furniture furnish renato kitchen models space extras ral',
    'Fit-out': 'finish materials quantities install budget tasks wallviews notes diary docs',
    'Site': 'garden trees around hood hood01 gate bnr01 bnr01floor bnr01doc',
    'Files & sharing': 'share backup merge pdfplans store sw hpscene hpbake toolbox library',
}
LANE_OF = {f: lane for lane, fs in LANES.items() for f in fs.split()}


def lane_of(src_file: str) -> str:
    base = os.path.splitext(os.path.basename(src_file))[0]
    return LANE_OF.get(base, 'Shared (app, panels, ui)')


# ── the source ──────────────────────────────────────────────────────────────────────────────────────────────────────

T_CALL = re.compile(r"""\bt\(\s*'((?:[^'\\]|\\.)*)'|\bt\(\s*"((?:[^"\\]|\\.)*)\"""")
STR = re.compile(r"""'((?:[^'\\]|\\.)+)'""")


def _unq(s: str) -> str:
    return s.replace("\\'", "'").replace('\\"', '"')


def _braced(text: str, i: int) -> tuple[str, int]:
    """the {...} that starts at text[i] (strings skipped), and the index after it"""
    depth, j, q = 0, i, None
    while j < len(text):
        c = text[j]
        if q:
            if c == '\\':
                j += 2
                continue
            if c == q:
                q = None
        elif c in '\'"`':
            q = c
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return text[i:j + 1], j + 1
        j += 1
    return text[i:], len(text)


def _first_t(s: str) -> str | None:
    m = T_CALL.search(s)
    return _unq(m.group(1) if m.group(1) is not None else m.group(2)) if m else None


def _attr(attrs: str, name: str) -> str | None:
    """a literal value; one made from a literal and more ('q-' + k) is a family: 'q-*' """
    m = re.search(r"""(?:^|[{,\s])['"]?""" + re.escape(name) + r"""['"]?\s*:\s*'([^']+)'(\s*\+)?""", attrs)
    return (m.group(1) + ('*' if m.group(2) else '')) if m else None


def _attr_t(attrs: str, name: str) -> str | None:
    m = re.search(r"""['"]?""" + re.escape(name) + r"""['"]?\s*:\s*t\(\s*'((?:[^'\\]|\\.)*)'""", attrs)
    return _unq(m.group(1)) if m else None


GENERIC = set('btn sm primary ghost icon chip solid danger hide-sm hide-xs mi wide small active on off seg'.split())


def _classes(attrs: str) -> list[str]:
    "the element's own classes (not the generic look ones): tests press many buttons by them"
    c = _attr(attrs, 'class') or ''
    return [x for x in c.rstrip('*').split() if x not in GENERIC]


def scan_js(path: str) -> tuple[list[dict], list[dict]]:
    """(actions, buttons without a stable id) of one source file"""
    text = open(path, encoding='utf-8').read()
    rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
    line_at = lambda i: text.count('\n', 0, i) + 1  # noqa: E731
    acts, loose = [], []
    for m in re.finditer(r"h\(\s*'(button|input|select|textarea)'\s*,\s*", text):
        tag, i = m.group(1), m.end()
        attrs, after = ('', i)
        if text.startswith('{', i):
            attrs, after = _braced(text, i)
        where = f'{rel}:{line_at(m.start())}'
        el_id = _attr(attrs, 'id')
        aid = None
        if el_id:
            aid = '#' + el_id
        elif tag != 'button':
            continue                      # fields without an id: part of their panel, not an action of their own
        else:
            for d in ('data-tool', 'data-mode', 'data-dim'):
                v = _attr(attrs, d)
                if v:
                    aid = f'[{d}={v}]'
                    break
            if not aid:
                lab = _attr_t(attrs, 'aria-label') or _attr_t(attrs, 'title')
                if not lab:
                    # the button's text: the first t('…') or plain '…' after its attributes, before the line ends
                    rest = text[after:text.find('\n', after) if text.find('\n', after) > 0 else len(text)]
                    nxt = rest.find("h('button'")
                    rest = rest[:nxt] if nxt > 0 else rest
                    lab = _first_t(rest)
                    if lab is None:
                        sm = re.match(r"""\s*(?:icon\([^)]*\)\s*,\s*)?'((?:[^'\\]|\\.)+)'""", rest)
                        lab = _unq(sm.group(1)) if sm else None
                if lab:
                    aid = 'btn:' + lab
        if aid and not aid.startswith('btn:{'):
            acts.append({'id': aid, 'kind': tag, 'where': where, 'cls': _classes(attrs)})
        else:
            loose.append({'where': where, 'code': text[m.start():m.start() + 110].split('\n')[0]})
    # menu, ⋯ and toast entries: { label: t('…'), …, fn: … }
    for m in re.finditer(r"\{\s*label:\s*(t\(\s*'(?:[^'\\]|\\.)*'[^)]*\)|'(?:[^'\\]|\\.)*')", text):
        obj, _ = _braced(text, m.start())
        if not re.search(r'\bfn\s*:', obj):
            continue                      # a dialog's answer button (value: …): part of its dialog
        el_id = _attr(obj, 'id')
        lab = _first_t(m.group(1)) if m.group(1).startswith('t(') else _unq(m.group(1)[1:-1])
        acts.append({'id': '#' + el_id if el_id else 'menu:' + lab, 'kind': 'menu', 'where': f'{rel}:{line_at(m.start())}'})
    return acts, loose


def scan_html(path: str) -> list[dict]:
    text = open(path, encoding='utf-8').read()
    rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
    acts = []
    for m in re.finditer(r'<(button|input|select|textarea)\b([^>]*)>', text):
        tag, attrs = m.group(1), m.group(2)
        line = text.count('\n', 0, m.start()) + 1
        im = re.search(r'\bid="([^"]+)"', attrs)
        if im:
            acts.append({'id': '#' + im.group(1), 'kind': tag, 'where': f'{rel}:{line}'})
            continue
        for d in ('data-tool', 'data-mode', 'data-dim'):
            dm = re.search(r'\b' + d + r'="([^"]+)"', attrs)
            if dm:
                acts.append({'id': f'[{d}={dm.group(1)}]', 'kind': tag, 'where': f'{rel}:{line}'})
                break
    return acts


def scan(root: str = ROOT) -> tuple[dict, list[dict]]:
    """{action id: {'kind', 'where': [...], 'lane'}}, [buttons without a stable id]"""
    found, loose = [], []
    found += scan_html(os.path.join(root, 'src', 'index.html'))
    for p in sorted(glob.glob(os.path.join(root, 'src', '*.js'))):
        a, l = scan_js(p)
        found += a
        loose += l
    acts: dict = {}
    for a in found:
        e = acts.setdefault(a['id'], {'kind': a['kind'], 'where': [], 'lane': lane_of(a['where'].split(':')[0])})
        e['where'].append(a['where'])
        e.setdefault('cls', [])
        e['cls'] += [c for c in a.get('cls', []) if c not in e['cls']]
    return acts, loose


# ── the tests ───────────────────────────────────────────────────────────────────────────────────────────────────────

NOT_COVERING = {'test_ci_checks.py'}     # tests of this machinery: they name actions without pressing them


def test_texts(root: str = ROOT) -> dict:
    return {os.path.basename(p): open(p, encoding='utf-8').read() for p in sorted(glob.glob(os.path.join(root, 'tests', 'test_*.py')))
            if os.path.basename(p) not in NOT_COVERING}


COVERS = re.compile(r'#\s*covers:\s*(.+)')


def covered_by(aid: str, texts: dict, cls: list[str] | None = None) -> list[str]:
    "the test files that press the action (by its id, its text, or – a button – one of its own classes)"
    out = []
    by_cls = re.compile(r"\.(?:" + '|'.join(re.escape(c) for c in cls) + r")(?![\w-])") if cls else None
    if aid.startswith('#') and aid.endswith('*'):            # a family of ids ('q-' + k): any of them
        x = re.escape(aid[1:-1])
        pat = re.compile(r"#" + x + r"[\w-]|['\"]" + x + r"[\w-]*['\"]|id[\^*]?=['\"]?" + x)
    elif aid.startswith('#'):
        x = re.escape(aid[1:])
        pat = re.compile(r"#" + x + r"(?![\w-])|['\"]" + x + r"['\"]|id=['\"]?" + x + r"(?![\w-])")
    elif aid.startswith('['):
        d, v = aid[1:-1].split('=', 1)
        pat = re.compile(re.escape(d) + r"""=\\?['"]?""" + re.escape(v) + r"""(?![\w-])""")
    else:
        lab = aid.split(':', 1)[1]
        lab = lab.split('{')[0].rstrip() if '{' in lab else lab        # 'Auto ({l})' → pressed as has-text("Auto (")
        lab = lab.rstrip('…').rstrip() or lab
        if len(lab) < 2:
            return out
        x = re.escape(lab)
        pat = re.compile(r"""(?:has-text\(\\?['"]|text=\\?['"]?|get_by_text\(['"]|name=['"]|aria-label=\\?['"]|title=\\?['"])""" + x
                         + r"""|['"]""" + x + r"""(?:…)?['"]""")
    for name, text in texts.items():
        if pat.search(text) or (by_cls and by_cls.search(text)) or any(aid in [c.strip() for c in m.group(1).split(',')] for m in COVERS.finditer(text)):
            out.append(name)
    return out


# ── features.json ───────────────────────────────────────────────────────────────────────────────────────────────────

def load_features(path: str = FEATURES) -> dict:
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def build(root: str = ROOT, old: dict | None = None) -> dict:
    old = load_features() if old is None else old
    acts, loose = scan(root)
    texts = test_texts(root)
    nyt_old = old.get('not_yet_tested', {})
    actions, nyt = {}, {}
    for aid in sorted(acts):
        cov = covered_by(aid, texts, acts[aid]['cls'])
        actions[aid] = {'tests': cov, 'where': acts[aid]['where'][:3]}
        if not cov:
            e = nyt_old.get(aid) or {'lane': acts[aid]['lane'], 'size': 'S', 'task': 'TODO'}
            nyt[aid] = e
    no_id: dict = {}
    for l in loose:
        no_id.setdefault(l['where'].split(':')[0], []).append(int(l['where'].split(':')[1]))
    return {
        'note': ('Every action a person can take in the app (task 0047), found in src/ by tools/ui_inventory.py, with the '
                 'public test files that press it. not_yet_tested: today\'s gaps – lane, size S/M/L, the task that tests it; '
                 'it only shrinks. no_stable_id: buttons whose text is made at run time (lines in each file) – a follow-up '
                 'gives them an id. Written by: python3 tools/ui_inventory.py --write'),
        'counts': {'actions': len(actions), 'tested': sum(1 for a in actions.values() if a['tests']),
                   'not_yet_tested': len(nyt), 'no_stable_id': len(loose)},
        'actions': actions,
        'not_yet_tested': nyt,
        'no_stable_id': no_id,
    }


def check(root: str = ROOT) -> list[str]:
    """the guard: plain messages, [] when all is well"""
    feats = load_features(os.path.join(root, 'tests', 'features.json'))
    if not feats:
        return ['tests/features.json is missing or not JSON: python3 tools/ui_inventory.py --write']
    acts, _ = scan(root)
    texts = test_texts(root)
    listed, nyt = feats.get('actions', {}), feats.get('not_yet_tested', {})
    bad = []
    for aid in sorted(acts):
        where = acts[aid]['where'][0]
        cov = covered_by(aid, texts, acts[aid]['cls'])
        if aid in nyt:
            if cov:
                bad.append(f'{aid} ({where}) now has a test ({", ".join(cov)}): take it off not_yet_tested in tests/features.json '
                           '(python3 tools/ui_inventory.py --write) – the list only shrinks')
            elif not str(nyt[aid].get('task', '')).strip() or nyt[aid].get('task') == 'TODO':
                bad.append(f'{aid} ({where}) is on not_yet_tested without a task number: write the task that will test it')
            continue
        if aid not in listed and not cov:
            bad.append(f'{aid} ({where}) is new and has no test: add one (a test that presses it, or "# covers: {aid}" in '
                       'the test that reaches it), or put it on not_yet_tested in tests/features.json with a task number')
        elif not cov:
            bad.append(f'{aid} ({where}) has no test any more: {", ".join(listed[aid].get("tests") or []) or "its test"} '
                       f'no longer presses it. Add one, or put it on not_yet_tested with a task number')
    for aid in sorted(set(nyt) - set(acts)):
        bad.append(f'{aid} is on not_yet_tested but no longer in the app: take it off (python3 tools/ui_inventory.py --write)')
    return bad


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()
    if args.check:
        bad = check()
        for b in bad:
            print('FAIL ' + b)
        print('features: ok' if not bad else f'features: {len(bad)} problem(s)')
        return 1 if bad else 0
    f = build()
    if args.json:
        print(json.dumps(f, indent=1, ensure_ascii=False))
        return 0
    if args.write:
        with open(FEATURES, 'w', encoding='utf-8') as fh:
            json.dump(f, fh, indent=1, ensure_ascii=False)
            fh.write('\n')
    c = f['counts']
    print(f"{c['actions']} actions, {c['tested']} with a test, {c['not_yet_tested']} not yet tested, "
          f"{c['no_stable_id']} buttons without a stable id")
    by: dict = {}
    for aid, e in f['not_yet_tested'].items():
        by.setdefault(e['lane'], []).append(aid)
    for lane in sorted(by):
        print(f'  {lane}: {len(by[lane])}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
