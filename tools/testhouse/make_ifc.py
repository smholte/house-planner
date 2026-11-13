#!/usr/bin/env python3
"""The made-up test house as an IFC file (IFC4, metres): python3 tools/testhouse/make_ifc.py → tools/testhouse/testhouse.ifc

A detached family house invented for the app's example and its tests (task 0003) – not taken from any real house or
builder's drawing. Then `node tools/testhouse/build.mjs` reads it with the app's own IFC import (src/ifc2house.js) and
writes build/example.json with the versions, furniture, electrics, garden, plot and a document.

What it has (inner faces of the outside walls x 0 … 8, y 0 … 9.6; y 0 is the front, the street side):
  - three storeys: ground floor (0), first floor (2.8), attic (5.6); 0.2 m concrete floors
  - outside walls of three layers: brick 100 (outer leaf), insulation 130, sand-lime inner leaf 150 (carries the floors)
  - a gable roof (40°, ridge front to back) with knee walls (0.9 m) on the attic and the low storage behind them
  - two stairs above each other along the hall (x 3.1 … 4.0, y 1.0 … 4.2), each with its opening in the floor above
  - a front door with side lights, a double garden door, a double door with side lights, a side door, windows of
    several sizes; inside doors, a wide passage between kitchen and living room
  - rooms: hall, toilet, meter cupboard, utility room, kitchen, living room; landing, three bedrooms, bathroom, toilet;
    attic room, attic bedroom, storage behind the knee walls
To change the house: change the lists below (walls, doors, windows), run this script and build.mjs again, then
python3 build.py. Keep the room names (tools/testhouse/rooms.json) in line with the walls."""
import math, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'testhouse.ifc')

X1, Y1 = 8.0, 9.6                       # inner faces of the outside walls
EL = [0.0, 2.8, 5.6]                    # storey floor levels
SLAB = 0.2                              # concrete floor thickness (under each upper level)
LAYERS = [                              # (name, inner offset, outer offset) from the inner face, outwards
    ('Binnenblad kalkzandsteen 150', 0.0, 0.15),
    ('Isolatie spouw 130', 0.15, 0.28),
    ('Metselwerk gevel 100', 0.30, 0.40),
]
PITCH = math.radians(40)
K = math.tan(PITCH)
EAVE = 5.7                              # underside of the roof at the outer face of the side walls (x −0.4 / 8.4)
RIDGE_X = X1 / 2


def roof_under(x):
    """height of the roof's underside above x (both slopes)"""
    return EAVE + (min(x, X1 - x) + 0.4) * K


class W:
    """a tiny IFC STEP writer"""

    def __init__(self):
        self.lines, self.n = [], 0

    def add(self, s):
        self.n += 1
        self.lines.append(f'#{self.n}={s};')
        return f'#{self.n}'

    def guid(self):
        # 22 characters of the IFC base64 alphabet, made from the entity number (stable from run to run)
        A = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
        v, s = self.n + 1 + 7919, ''
        for _ in range(22):
            s = A[v % 64] + s
            v = v // 64 + 131
        return "'" + s + "'"


w = W()
def num(v):
    s = f'{v:.4f}'.rstrip('0')
    return s + '0' if s.endswith('.') else s
def pt(p): return w.add(f'IFCCARTESIANPOINT(({",".join(num(c) for c in p)}))')
def txt(s): return "'" + s.replace("'", "''") + "'"

# ── header objects ──
origin = pt((0, 0, 0))
axis = w.add(f'IFCAXIS2PLACEMENT3D({origin},$,$)')
ctx = w.add(f"IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,{axis},$)")
unit = w.add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)')
units = w.add(f'IFCUNITASSIGNMENT(({unit}))')
project = w.add(f"IFCPROJECT({w.guid()},$,'Testhuis',$,$,$,$,({ctx}),{units})")
place0 = w.add(f'IFCLOCALPLACEMENT($,{axis})')
site = w.add(f"IFCSITE({w.guid()},$,'Kavel',$,$,{place0},$,$,.ELEMENT.,$,$,$,$,$)")
building = w.add(f"IFCBUILDING({w.guid()},$,'Testhuis',$,$,{place0},$,$,.ELEMENT.,$,$,$)")
STOREY_NAMES = ['00 begane grond', '01 eerste verdieping', '02 zolder']
storeys = [w.add(f"IFCBUILDINGSTOREY({w.guid()},$,{txt(n)},$,$,{place0},$,$,.ELEMENT.,{num(e)})") for n, e in zip(STOREY_NAMES, EL)]
w.add(f'IFCRELAGGREGATES({w.guid()},$,$,$,{project},({site}))')
w.add(f'IFCRELAGGREGATES({w.guid()},$,$,$,{site},({building}))')
w.add(f'IFCRELAGGREGATES({w.guid()},$,$,$,{building},({",".join(storeys)}))')
contained = {s: [] for s in storeys}

# colours (IFC surface styles): brick, roof tiles (dark grey), window frames …
def style(rgb):
    c = w.add(f'IFCCOLOURRGB($,{num(rgb[0])},{num(rgb[1])},{num(rgb[2])})')
    r = w.add(f'IFCSURFACESTYLERENDERING({c},0.,$,$,$,$,$,$,.FLAT.)')
    return w.add(f'IFCSURFACESTYLE($,.BOTH.,({r}))')
ST_BRICK = style((0.62, 0.36, 0.25))
ST_ROOF = style((0.24, 0.25, 0.26))
ST_CONCRETE = style((0.72, 0.72, 0.70))
ST_STAIR = style((0.93, 0.92, 0.88))


# ── solids: convex prisms as faceted breps with outward faces ──
def brep(verts, faces, st=None):
    loops = []
    for fc in faces:
        ps = [pt(verts[i]) for i in fc]
        loop = w.add(f'IFCPOLYLOOP(({",".join(ps)}))')
        bound = w.add(f'IFCFACEOUTERBOUND({loop},.T.)')
        loops.append(w.add(f'IFCFACE(({bound}))'))
    shell = w.add(f'IFCCLOSEDSHELL(({",".join(loops)}))')
    b = w.add(f'IFCFACETEDBREP({shell})')
    if st:
        w.add(f'IFCSTYLEDITEM({b},({st}),$)')
    return b


def prism(poly, axis_, a0, a1):
    """a convex polygon extruded: axis 'z' (poly in x, y), 'y' (poly in x, z) or 'x' (poly in y, z), from a0 to a1"""
    def P3(p, a):
        if axis_ == 'z': return (p[0], p[1], a)
        if axis_ == 'y': return (p[0], a, p[1])
        return (a, p[0], p[1])
    n = len(poly)
    verts = [P3(p, a0) for p in poly] + [P3(p, a1) for p in poly]
    faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    c = [sum(v[k] for v in verts) / len(verts) for k in range(3)]
    out = []
    for fc in faces:
        a, b, d = verts[fc[0]], verts[fc[1]], verts[fc[2]]
        u = [b[k] - a[k] for k in range(3)]; v = [d[k] - a[k] for k in range(3)]
        nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        fcn = [sum(verts[i][k] for i in fc) / len(fc) for k in range(3)]
        if sum(nn[k] * (fcn[k] - c[k]) for k in range(3)) < 0:
            fc = fc[::-1]
        out.append(fc)
    return verts, out


def box(x0, y0, z0, x1, y1, z1):
    return prism([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 'z', z0, z1)


def shape(items, kind='Brep'):
    rep = w.add(f"IFCSHAPEREPRESENTATION({ctx},'Body',{txt(kind)},({','.join(items)}))")
    return w.add(f'IFCPRODUCTDEFINITIONSHAPE($,$,({rep}))')


def element(kind, name, storey, solids, st=None, extra='$'):
    items = [brep(v, fc, st) for v, fc in solids]
    e = w.add(f'{kind}({w.guid()},$,{txt(name)},$,$,{place0},{shape(items)},$,{extra})')
    contained[storey].append(e)
    return e


def pset(e, name, props):
    vals = []
    for k, v in props.items():
        if isinstance(v, bool):
            vals.append(w.add(f"IFCPROPERTYSINGLEVALUE({txt(k)},$,IFCBOOLEAN(.{'T' if v else 'F'}.),$)"))
        else:
            vals.append(w.add(f"IFCPROPERTYSINGLEVALUE({txt(k)},$,IFCLABEL({txt(str(v))}),$)"))
    ps = w.add(f"IFCPROPERTYSET({w.guid()},$,{txt(name)},$,({','.join(vals)}))")
    w.add(f'IFCRELDEFINESBYPROPERTIES({w.guid()},$,$,$,({e}),{ps})')


# ── walls with their openings ──
# a wall: (name, storey index, (x0, y0), (x1, y1) of its body rectangle in plan, z0, z1, load-bearing)
# openings: per wall, (u0, u1 along the wall from its lower x / y end, z0 and z1 above the storey's floor, filler)
def wall(name, si, x0, y0, x1, y1, z0, z1, load=None, top=None, st=None):
    sol = [top] if top else [box(x0, y0, z0, x1, y1, z1)]
    e = element('IFCWALL', name, storeys[si], sol, st, '.STANDARD.')
    if load is not None:
        pset(e, 'Pset_WallCommon', {'LoadBearing': load, 'IsExternal': name.startswith(('Binnenblad', 'Isolatie', 'Metselwerk'))})
    return {'e': e, 'si': si, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'alongX': (x1 - x0) >= (y1 - y0)}


def opening(wl, u0, u1, z0, z1, filler=None, name=''):
    """a hole through wall wl (u along the wall from its x0 / y0 end), z above the storey's floor; filler: 'door' |
    'window' | None"""
    e0 = EL[wl['si']]
    pad = 0.05
    if wl['alongX']:
        b = box(wl['x0'] + u0, wl['y0'] - pad, e0 + z0, wl['x0'] + u1, wl['y1'] + pad, e0 + z1)
    else:
        b = box(wl['x0'] - pad, wl['y0'] + u0, e0 + z0, wl['x1'] + pad, wl['y0'] + u1, e0 + z1)
    o = w.add(f"IFCOPENINGELEMENT({w.guid()},$,'Sparing',$,$,{place0},{shape([brep(*b)])},$,.OPENING.)")
    w.add(f'IFCRELVOIDSELEMENT({w.guid()},$,$,$,{wl["e"]},{o})')
    if filler:
        h, wd = z1 - z0, u1 - u0
        if filler == 'door':
            d = w.add(f"IFCDOOR({w.guid()},$,{txt(name or 'Binnendeur')},$,$,{place0},$,$,{num(h)},{num(wd)},.DOOR.,.SINGLE_SWING_LEFT.,$)")
        else:
            d = w.add(f"IFCWINDOW({w.guid()},$,{txt(name or 'Raam')},$,$,{place0},$,$,{num(h)},{num(wd)},.WINDOW.,.SINGLE_PANEL.,$)")
        w.add(f'IFCRELFILLSELEMENT({w.guid()},$,$,$,{o},{d})')
        contained[storeys[wl['si']]].append(d)


# the façade: for each storey and side, the three layers (front / back run the full width, sides fit in between)
FACADE = {}
for si in (0, 1):
    z0, z1 = EL[si], EL[si] + 2.8
    for name, a, b in LAYERS:
        inner = name.startswith('Binnenblad')
        top = EL[si] + 2.6 if inner else z1 + (0.2 if si == 1 else 0)   # the inner leaf carries the floor above
        zb = z0 - (0.3 if (si == 0 and not inner) else 0)                  # brick and insulation start below the floor
        st = ST_BRICK if name.startswith('Metselwerk') else None
        load = True if inner else None
        FACADE[(si, 'front', name)] = wall(name, si, -b, -b, X1 + b, -a, zb, top, load, st=st)
        FACADE[(si, 'back', name)] = wall(name, si, -b, Y1 + a, X1 + b, Y1 + b, zb, top, load, st=st)
        FACADE[(si, 'left', name)] = wall(name, si, -b, -a, -a, Y1 + a, zb, top, load, st=st)
        FACADE[(si, 'right', name)] = wall(name, si, X1 + a, -a, X1 + b, Y1 + a, zb, top, load, st=st)
# the gables on the attic: front and back, each layer up to the roof's underside
for side in ('front', 'back'):
    for name, a, b in LAYERS:
        y0, y1 = (-b, -a) if side == 'front' else (Y1 + a, Y1 + b)
        xa, xb = -b, X1 + b
        poly = [(xa, EL[2]), (xb, EL[2]), (xb, roof_under(xb)), (RIDGE_X, roof_under(RIDGE_X)), (xa, roof_under(xa))]
        st = ST_BRICK if name.startswith('Metselwerk') else None
        FACADE[(2, side, name)] = wall(name, 2, xa, y0, xb, y1, EL[2], roof_under(RIDGE_X), True if name.startswith('Binnenblad') else None, top=prism(poly, 'y', y0, y1), st=st)


def facade_hole(si, side, u0, u1, z0, z1, kind, name=''):
    """the same hole through all three layers; the inner leaf gets the door or window. u: along the inner face from
    its x 0 / y 0 end"""
    for lname, a, b in LAYERS:
        wl = FACADE[(si, side, lname)]
        shift = (0 - wl['x0']) if wl['alongX'] else (0 - wl['y0'])
        opening(wl, u0 + shift, u1 + shift, z0, z1, kind if lname.startswith('Binnenblad') else None, name)


# ground floor façade
facade_hole(0, 'front', 2.3, 3.8, 0, 2.3, 'door', 'Voordeur met zijlichten')         # front door with side lights
facade_hole(0, 'front', 0.6, 1.3, 1.5, 2.1, 'window', 'Raam toilet')
facade_hole(0, 'front', 4.8, 7.4, 0.9, 2.4, 'window', 'Raam keuken')
facade_hole(0, 'back', 0.3, 1.9, 0, 2.3, 'door', 'Tuindeuren')                       # double garden door
facade_hole(0, 'back', 4.2, 7.4, 0, 2.3, 'door', 'Schuifpui')                        # double door with side lights
facade_hole(0, 'left', 2.9, 3.8, 0, 2.3, 'door', 'Zijdeur')                          # side door of the utility room
facade_hole(0, 'left', 5.6, 8.0, 0.6, 2.4, 'window', 'Raam woonkamer')
facade_hole(0, 'right', 1.0, 2.4, 0.9, 2.2, 'window', 'Raam keuken zij')
facade_hole(0, 'right', 6.0, 8.2, 0.6, 2.4, 'window', 'Raam woonkamer zij')
facade_hole(0, 'right', 4.75, 5.65, 0, 2.3, 'door', 'Zijdeur woonkamer')                # a side door from the living room
# first floor façade
facade_hole(1, 'front', 0.4, 1.4, 1.2, 2.2, 'window', 'Raam badkamer')
facade_hole(1, 'front', 2.4, 3.6, 0.9, 2.3, 'window', 'Raam overloop')
facade_hole(1, 'front', 4.8, 7.3, 0.7, 2.4, 'window', 'Raam slaapkamer 1')
facade_hole(1, 'back', 0.6, 2.4, 0.8, 2.4, 'window', 'Raam slaapkamer 2')
facade_hole(1, 'back', 4.2, 7.2, 0.8, 2.4, 'window', 'Raam slaapkamer 3')
facade_hole(1, 'right', 1.5, 3.5, 0.8, 2.4, 'window', 'Raam slaapkamer 1 zij')
# attic gables
facade_hole(2, 'front', 3.2, 4.8, 0.8, 2.0, 'window', 'Raam zolder')
facade_hole(2, 'back', 3.0, 5.0, 0.8, 2.0, 'window', 'Raam zolderkamer')

# ── inside walls (centre lines, 100 mm; sand-lime ones carry the floor above) ──
T = 0.05
def inner(si, a, b, load=False, h=2.6, name=None):
    (xa, ya), (xb, yb) = a, b
    nm = name or ('Kalkzandsteen 100' if load else 'Metalstud 100')
    if ya == yb:
        return wall(nm, si, min(xa, xb), ya - T, max(xa, xb), ya + T, EL[si], EL[si] + h, load)
    return wall(nm, si, xa - T, min(ya, yb), xa + T, max(ya, yb), EL[si], EL[si] + h, load)

# ground floor
g_hall_l = inner(0, (2.0, 0), (2.0, 4.4), load=True)           # hall | toilet, meter cupboard, utility room
g_hall_r = inner(0, (4.05, 0), (4.05, 4.4), load=True)         # hall (stair) | kitchen
g_toilet = inner(0, (0, 1.4), (1.95, 1.4))                     # toilet | meter cupboard
g_meter = inner(0, (0, 2.5), (1.95, 2.5))                      # meter cupboard | utility room
g_back = inner(0, (0, 4.45), (8.0, 4.45), load=True)           # the front rooms | living room
opening(g_hall_l, 0.35, 1.15, 0, 2.315, 'door')                # toilet
opening(g_hall_l, 1.6, 2.3, 0, 2.315, 'door')                  # meter cupboard
opening(g_hall_l, 3.0, 3.83, 0, 2.315, 'door')                 # utility room
opening(g_hall_r, 0.15, 0.98, 0, 2.315, 'door')                # hall → kitchen
opening(g_back, 2.15, 2.98, 0, 2.315, 'door')                  # hall → living room
opening(g_back, 5.0, 7.4, 0, 2.6, None)                        # kitchen ↔ living room: a passage to the ceiling
# first floor
f_land_l = inner(1, (2.0, 0), (2.0, 5.5))                      # landing | bathroom, toilet
f_land_r = inner(1, (4.05, 0), (4.05, 5.5), load=True)         # landing (stair) | bedroom 1
f_bath = inner(1, (0, 3.45), (1.95, 3.45))                     # bathroom | toilet
f_back = inner(1, (0, 5.55), (8.0, 5.55), load=True)           # the front rooms | bedrooms 2 and 3
f_bed23 = inner(1, (3.0, 5.6), (3.0, 9.6))                     # bedroom 2 | bedroom 3
opening(f_land_l, 1.6, 2.4, 0, 2.315, 'door')                  # bathroom
opening(f_land_l, 4.0, 4.75, 0, 2.315, 'door')                 # toilet
opening(f_land_r, 4.4, 5.23, 0, 2.315, 'door')                 # bedroom 1
opening(f_back, 2.1, 2.9, 0, 2.315, 'door')                    # bedroom 2
opening(f_back, 3.15, 3.95, 0, 2.315, 'door')                  # bedroom 3
# attic: a wall between the attic room and the attic bedroom (the knee walls are boards of the roof, below)
# (its top follows the roof's underside towards the knee walls)
xa, xb, top = 0.62, X1 - 0.62, EL[2] + 2.4
xl = (top - EAVE) / K - 0.4
a_bed = wall('Metalstud 100', 2, xa, 5.5, xb, 5.6, EL[2], top, False,
             top=prism([(xa, EL[2]), (xb, EL[2]), (xb, roof_under(xb)), (X1 - xl, top), (xl, top), (xa, roof_under(xa))], 'y', 5.5, 5.6))
opening(a_bed, 4.3 - xa, 5.1 - xa, 0, 2.315, 'door')

# ── floors (concrete, with the stairwells), roof, stairs ──
WELL = (3.1, 1.0, 4.0, 4.2)
element('IFCSLAB', 'Begane grondvloer beton', storeys[0], [box(-0.15, -0.15, -SLAB, X1 + 0.15, Y1 + 0.15, 0)], ST_CONCRETE, '.FLOOR.')
for si in (1, 2):
    s = element('IFCSLAB', 'Vloer beton', storeys[si], [box(-0.15, -0.15, EL[si] - SLAB, X1 + 0.15, Y1 + 0.15, EL[si])], ST_CONCRETE, '.FLOOR.')
    o = w.add(f"IFCOPENINGELEMENT({w.guid()},$,'Trapgat',$,$,{place0},{shape([brep(*box(WELL[0], WELL[1], EL[si] - SLAB - 0.05, WELL[2], WELL[3], EL[si] + 0.05))])},$,.OPENING.)")
    w.add(f'IFCRELVOIDSELEMENT({w.guid()},$,$,$,{s},{o})')
# the roof: two slopes of 0.3 m (tiles, battens, insulation), 0.3 m over the eaves and 0.2 m over the gables
RT = 0.3
left = [(-0.7, roof_under(-0.7)), (RIDGE_X, roof_under(RIDGE_X)), (RIDGE_X, roof_under(RIDGE_X) + RT), (-0.7, roof_under(-0.7) + RT)]
right = [(X1 - x, z) for x, z in left][::-1]
# the knee walls (0.9 m) as the roof's own boards, as builders' models often have them (ifc2house.js finds them there)
knees = [box(x, 0, EL[2], x + 0.02, Y1, EL[2] + 0.9) for x in (0.6, X1 - 0.62)]
element('IFCROOF', 'Hellend dak pannen', storeys[2], [prism(left, 'y', -0.6, Y1 + 0.6), prism(right, 'y', -0.6, Y1 + 0.6)] + knees, ST_ROOF, '.GABLE_ROOF.')
# the stairs: 14 risers of 0.2 m over 3.2 m, rising to the back (two, one above the other)
for si in (0, 1):
    steps = []
    n, run = 14, WELL[3] - WELL[1]
    g = run / (n - 1)
    for i in range(n - 1):
        steps.append(box(WELL[0], WELL[1] + i * g, EL[si] + i * 0.2 - 0.12, WELL[2], WELL[1] + (i + 1) * g, EL[si] + (i + 1) * 0.2))
    steps.append(box(WELL[0], WELL[3] - 0.02, EL[si] + 2.4, WELL[2], WELL[3], EL[si] + 2.8))     # the top riser, up to the floor
    element('IFCSTAIR', 'Trap', storeys[si], steps, ST_STAIR, '.STRAIGHT_RUN_STAIR.')

for s, els in contained.items():
    if els:
        w.add(f'IFCRELCONTAINEDINSPATIALSTRUCTURE({w.guid()},$,$,$,({",".join(els)}),{s})')

head = ("ISO-10303-21;\nHEADER;FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');"
        "FILE_NAME('testhouse.ifc','2026-11-12',('House Planner'),('House Planner'),'tools/testhouse/make_ifc.py','tools/testhouse/make_ifc.py','');"
        "FILE_SCHEMA(('IFC4'));ENDSEC;\nDATA;\n")
with open(OUT, 'w', encoding='utf-8') as fo:
    fo.write(head + '\n'.join(w.lines) + '\nENDSEC;\nEND-ISO-10303-21;\n')
print(OUT, len(w.lines), 'entities', os.path.getsize(OUT) // 1024, 'KB')
