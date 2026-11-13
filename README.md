# House Planner

An offline app for planning a new house: 2D and 3D per storey and for the whole house, the house as delivered
against named planned versions, furnishing, fit-out (floors, walls, tiles, electrics, kitchen, quantities, budget),
the plot and the neighbourhood, notes, documents and photo renders. One HTML file (also an installable web app);
everything stays on the device, houses move only as exported files. Plain JavaScript + three.js.

**Try it:** https://smholte.github.io/house-planner/ – the "Example" button opens a made-up test house.

    python3 build.py --no-house      the public app → dist/house-planner.html, dist/house-planner-app(.zip), dist/web
    python3 build.py --house DIR     with a house of your own built in (DIR/house.json: its modules, texts, example)
    python3 tests/test_web.py        one test file (Playwright, Chromium; tests/README.md)
    python3 tools/ci_groups.py       how GitHub splits the tests into parallel groups

| Where | What |
| --- | --- |
| `src/` | the app: plain-JS modules glued in the order of `order` in `build.py` (module map: `DEVELOPING.md`) |
| `i18n/translations.json` | Dutch and Norwegian texts |
| `vendor/` | three.js r187 + add-ons, pdf.js, path tracer, licences |
| `build/` | the made-up example house (`example.json`, made by `tools/testhouse/`), model library, material pictures |
| `tests/` | browser tests on the made-up house (`tests/README.md`) |
| `tools/` | scripts; `ci_*.py`: the GitHub test runs |
| `.github/workflows/` | **Tests** (every push: precheck, build and web check, the test files in parallel groups) and **Publish web version** (by hand: puts the web version on the address above – `DEPLOY.md`) |

Work on this app is planned in a private repository (task list, changelog, the owner's own house); this one holds
the app, the made-up house and the public tests only – nothing of a real house. Licences: `vendor/`,
`OFL-barlow.txt`; models and textures in the web version are CC0 / CC BY only.
