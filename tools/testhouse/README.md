# The made-up test house

The public app's example house and the house the public tests open (task 0003). Invented for the app: not taken
from any real house, plot or builder's drawing.

- 3 storeys (ground floor, first floor, attic), 8.0 × 9.6 m inside, outside walls of brick / insulation / sand-lime
  inner leaf, concrete floors, a 40° gable roof with knee walls (0.9 m) and the storage behind them, two stairs above
  each other with their floor openings
- doors: a front door with side lights, double garden doors, a double door with side lights, two side doors, inside doors,
  a passage to the ceiling; windows of several sizes, in the gables too
- rooms: Hal, Toilet, Meterkast, Bijkeuken, Keuken, Woonkamer · Overloop, Badkamer, Toilet boven, Slaapkamer 1–3 ·
  Zolder, Zolderkamer, 2 × Opslag achter knieschot
- versions: Original (as delivered) · Plan – study (the living room split: Woonkamer + Werkkamer; oak floors, warm
  white walls; the one it opens on, like the owner's house opens on its first plan) · Plan – open kitchen (the wall
  between kitchen and living room taken out: Woonkeuken; PVC floors, greige walls); floor heating; the toilets tiled
  to 1.5 m (30 × 60)
- two furniture layouts with a kitchen run and an island (marble-look worktop), and a cabinet from the app's 3D model library; 69 electrics
  points in every version; a plot with a street, two neighbours, street trees, a ditch behind the gardens (Water &
  park) and a garden in every version (soil and a paved drive as delivered; in the plans lawn / terrace / trees, the
  drive a parking place of 50 × 50 cm tiles, a metal gate with railing across the side passage, a pond in one); one PDF (2 pages) in the documents

Make it again after a change (each step writes the next one's input; the ids stay the same from run to run – a fixed
random sequence and a fixed clock – as long as the order of the steps in build.mjs stays; tests use some of them):

    python3 tools/testhouse/make_ifc.py      → tools/testhouse/testhouse.ifc   (the building: walls, doors, windows, roof, stairs)
    python3 tools/testhouse/make_pdf.py      → tools/testhouse/plans.pdf, plans-thumb.jpg
    node tools/testhouse/build.mjs           → build/example.json             (versions, furniture, electrics, plot, garden, document)
    python3 build.py --no-house

Where to change what: the building in `make_ifc.py` (positions in metres from the inside of the outside walls, y 0 at
the front); room names in `rooms.json` (a point in each room); everything else in `build.mjs`. Tests that check numbers
of this house (room areas, counts of points) have to follow a change.
`probe.mjs` prints what the IFC import makes of the building (rooms, walls, openings) – handy while changing it.
