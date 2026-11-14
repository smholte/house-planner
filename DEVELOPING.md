# House Planner – source

Plain JavaScript, no framework. `build.py` glues everything into one HTML file (order: see `order` in build.py).
The modules of the owner's own house (its plot, neighbourhood, documents …) are built in from a private folder
(`python3 build.py --house DIR`); their notes are kept with them, not here (task 0008). Tests and GitHub runs:
`tests/README.md`, `.github/workflows/`.

    src/util.js      helpers, geometry (shortStoreyName: BG, 1e, 2e on phones)
    (app.js)         phones (≤ 600 px, coarse pointer), 2D: barsAway() – the bars step aside while you pan, zoom or draw
                     (#editor.bars-away), back 1.4 s after the last finger lifts (barsWire: a window-level finger count,
                     a new first finger forgets lost ones; plan2d onDown does the same for its own pointers); a strip
                     of the top bar (--pull-h, #bars-pull) stays: tap or pull down → barsBack(). Computers never hide.
    src/i18n.js      t('English text', {vars}) → the text in the chosen language (I18N.dict.nl / .no); fmtEuro().
                     All new screens use t(); the full Dutch / Norwegian translation fills the dictionaries later.
                     ?lang=nl or ?lang=no in the address shows the translated parts.
    src/store.js     IndexedDB storage, autosave (Saver), save points, trash, crash recovery, Settings.
                     assetIdsOf() also lists note photos (so they are exported and not garbage-collected).
    src/model.js     data model, wall/opening geometry, version comparison, room detection, migrateProject()
                     (adds the newer parts to old files: furniture, notes, viewpoints, walk, people, doorState)
    src/outline.js   meshOutline(): the top view of a 3D model (rasterised, traced, simplified) for its 2D symbol;
                     also used by tools/pack-models.mjs
    src/furniture.js the furniture catalogue: FURN_TYPES (49 pieces, any size), furnSymbol() = 2D architect symbol,
                     furnMesh() = 3D model, both from the same numbers. Local frame: x right, y to the FRONT, back at
                     y = −d/2; rot in degrees (plan), 3D rotation.y = −rot. furnZ(): height above the floor.
    src/plan2d.js    2D SVG plan: drawing, snapping, editing tools, pan/zoom/pinch
    src/plan2d-x.js  2D part 2: furniture drawing + dragging / turning / sizing (handles), snapFurniture() (sides
                     against wall faces and other pieces; wall pieces turn their back to the wall; corners), note pins,
                     walking paths, space-check marks, taps in Furnish and View (modeDown / modeDrag / modeTap)
    src/view3d.js    three.js 3D views; slice tool (SLICE.sets; slices are saved in project.slices via
                     app.persistSlices, sliceToJSON / sliceFromJSON); ViewCube; home views (project.homeViews)
    src/view3d-x.js  3D part 2: ceilings (facing down, so invisible from above; none under a sloping roof),
                     day / evening light (a pool of PointLights moved to the rooms nearest the camera), doors that
                     swing (doorMap, swingDoor; the wall above a door also swings it), furniture (updateFurniture
                     rebuilds only the furniture), note pins (HTML), picking (doors, furniture, rooms, note placing)
    src/batch.js     fewer draw calls (30 Oct): after a build, what never moves (per storey group, and the garden in
                     16 m squares) is copied into one mesh per material + shadow setting (batchStatic); the originals
                     stay in the scene hidden (visible = false, userData.merged = true) for every ray test (firstHit
                     accepts merged pieces; a merged mesh's raycast does nothing). Not merged: doors and the gate's
                     leaf (doorMap groups), furniture, see-through materials, overlays, meshes with children; the
                     drawing view (noBatch). window.__hpNoBatch = true switches it off (to compare). About 10× fewer
                     draw calls (whole house ~3,000 → ~340; one storey ~900 → ~120), the same pictures.
    src/app.js       controller: screens, versions, panes, undo. app.mode = build | furnish | view.
                     Two-version modes (app.comparing): side by side and the compare slider. In Furnish, the left
                     side shows app.furnCompare = {versionId, layoutId}.
    src/panels.js    inspector, dialogs, export/import, drawing import + scale, built-in PDF reader (PDFJS_GZ)
    src/modes.js     mode switch, tool rails of Furnish / View, the bar over the views, doors (project.doorState,
                     pop-up in Build, straight toggle in Furnish / View), entryExtras() (furniture, pins, paths per
                     storey), what is kept with the house (VIEW_KEYS → project.viewSettings; slices), keys
    src/furnish.js   layouts (project.furniture.layouts, activeLayoutId), placing / moving / turning, sets
                     (project.furniture.sets), shopping list (+ CSV), details panels, the small live 3D view (pip)
    src/kitchen.js   the kitchen builder (kind 'krun'): it.units left to right (RUN_UNITS by zone: under the
                     worktop – doors, drawers, sink, hob (+ downdraft), dishwasher, oven, blind corner, open, free
                     space, cupboard opening to the end (islands); tall – tall cupboard, fridge, oven tower with
                     u.apps from the bottom, niche for a free-standing fridge with cupboards above; on the worktop –
                     onbox; fillers and 19 mm panels that follow their neighbours' height). unitFaces() gives the
                     fronts of a column (door, drawer, panel, dw, oven …, wall, bulk, grille) for 3D, the front view
                     (runElevation, the builder in the details) and the plan (runSymbol). runMesh builds carcass,
                     fronts with gaps, plinth, worktop (topOv, topTrim [l, r] for corners), sink, tap, hob,
                     downdraft, wall cabinets / hood, bulkhead to the ceiling, then merges per material (kMerge).
                     Islands: main row faces −y (it.cd deep), it.back a second row facing +y (it.bd deep), the rest of
                     it.d is the overhang; topEnd. The look: color, grain (oak texture with vertical grain), handles
                     (none/bar/knob/rail/profile) + handleC, carcass, plinthC/plinthH, top/topMat (plain, marble,
                     stone, wood)/topT, h, sinkC, tapC; “Use this look for the whole kitchen” (K_LOOK_KEYS).
                     Texture coordinates of the boxes are in metres (kbox). Fill the wall, a run round the corner
                     (addCornerRun), bar stools along an island.
    src/models.js    3D models as furniture (type 'model', item.model = 'k:<id>' library / 'u:<id>' your own):
                     the Kenney library (MODEL_LIB: names, sizes, flags, outlines + a gzip'd geometry blob unpacked on
                     first use), your models (project.models, the .glb kept as an asset; import .glb / .gltf / .obj +
                     .mtl / .ifc, settings: name, category, front, Z up, unit), catalogue cards with 3D pictures,
                     addon() = three.js add-ons packed by build.py (GLTFLoader, OBJ/MTL, GLTFExporter, GTAO)
    src/space.js     "Check space": walls, overlaps, door swings, room in front / beside, walkways (5 cm grid,
                     distance field, doorways reachable at the walkway width)
    src/share.js     Export for viewing (a page with the app and the house inside, or a .house.json with a viewer
                     mark), the viewer copy (project.viewer, id 'v_' + owner's id, View only, n.mine on their notes),
                     Send notes back (format 'house-planner-notes') and reading them back into the owner's house
    src/history.js   the undo history: undoStack / redoStack hold { s: project JSON, t: time }; historyJump(n) moves
                     n steps back or forward and restores once; histDescribe(a, b) names a step by comparing two states
                     (versions, walls, openings, rooms, points, stairs, voids, garden, furniture per layout, notes,
                     storeys, budget, tasks); historySheet() (Ctrl+H, the History button in the tool rail)
    src/search.js    the search box (Ctrl+K, /, the magnifier): searchIndex() of rooms, storeys, versions, layouts,
                     notes and actions (with Dutch and English keywords), every typed word must match (accents and
                     capitals ignored), ↑ ↓ Enter
    src/help.js      the help overlay (?, F1, ⋯ → Help): numbered badges on the visible buttons (HELP: selector, name,
                     what it does; other buttons by their tooltip) and the keys (HELP_KEYS)
    src/notes.js     notes (project.notes: type, status, text, at {storey,x,y,h} or room, versionId / layoutId tag,
                     photos = asset ids), notes list, saved viewpoints (project.viewpoints), View-mode panel
    src/diary.js     the building diary: two more note types – 'diary' (dated entry with several photos) and 'hidden'
                     (pipes and cables: n.runs ['water', 'drain', 'electric', 'heating', 'data', 'vent', 'gas',
                     'other'], n.inside 'wall' | 'floor' | 'ceiling'); both carry n.date (yyyy-mm-dd) and are made
                     done (n.diaryDone) so they never count as open notes – diaryInit() keeps that right when the
                     type changes. Room details: a timeline (roomDiary) above the notes, which leave these out;
                     Notes → Building diary: the whole house by day (diarySheet). Wraps notePanel / updateNote /
                     roomNotesSection; pins of these types are never drawn faded (plan2d-x, view3d-x)
    src/walk.js      Walker (free walk: keys / mouse / joysticks; path walk: arrows and rings, stair points are
                     passed without stopping), collision with plan walls (open doors pass, outside doors of the
                     builder's model stay shut) and furniture, floor following by ray-casting walkable meshes
                     (userData.walk: room floors, slabs, stair treads); autoPaths() and stairLine() (tread centres
                     from the 3D model); people (project.people: eye height, speed)
    src/tour.js      routes with stops (project.walk.routes: stops = where you stand and look + a text), played along
                     the walking paths (Dijkstra), the tour card; recording a walk as a video (WalkRecorder:
                     the picture + stop texts on a 2D canvas → MediaRecorder, .mp4 or .webm)
    src/ral.js       RAL Classic colours (screen approximations)
    src/extras.js    colour library (project.colours + RAL), saving a picture (2D: SVG with inlined styles → PNG;
                     3D: drawn twice as sharp, with labels), measuring in 3D (View mode)
    src/finish.js    finishes per wall (session 3): wallFaces() = where room edges run along wall sides ({wall, room,
                     side, u0, u1}), roomFaces() lettered A, B, C …; the room's finish (wallColor/Name, wallBase paint |
                     renovlies | paper, wallPaper {img, w, h, fit repeat | fill}, tiles {to (0 = full), w, h, joint,
                     color, grout, lay, waste}) and a wall's own finish for one room (wall.fin[roomId], any of color,
                     name, base, paper, tiles); faceArea() (to the ceiling, without openings), tileCount(); 3D: tile
                     textures (canvas), wallpaper from project.images (asset), finishMat(); 2D bands + letters; room
                     panel Walls / Each wall / Ceiling (ceilingColor, ceilingName, ceilingFinish, ceilingH)
    src/quantities.js per room and the whole house: floor (+ waste per material), walls by covering, ceiling, skirting,
                     paint (2 coats), primers, renovlies rolls, wallpaper rolls (strips per roll width), tiles,
                     sealant; rates in project.qty; room.noQty leaves a room out; CSV (; and decimal comma) and print
    src/install.js   electrics and installations: plan.points [{kind socket | switch | light | walllight | data | tv |
                     conduit | vent | wallvent | smoke | thermostat | manifold | water | bell | unit, sub, n, x, y, h
                     (null = ceiling; a unit: its underside), wall, side, rot, size (units: [w, d, h]), label, note}], the
                     Electrics tool (E) snaps wall things to the nearest wall face, 2D symbols (screen size), 3D plates
                     with height labels up close (View → 3D heights, off at first), counts per room, room.heat {on, zone} (floor
                     heating pattern with the Electrics tool or on the selected room); the floor-heating check: floor.thick /
                     under / underR / fix and floorHeatR() (R = thickness / λ + underlay, ISSO 49: ≤ 0.15, advised ≤ 0.10)
                     View → Ceiling (settings.ceilItems, in VIEW_KEYS): the ceiling kinds (light, smoke, vent: PT_KINDS
                     .ceil) separately from Electrics (settings.installs: everything else); ceilShown(s) – until it is
                     set it follows Electrics (old settings); PlanView.ptOn(pt), the Electrics tool shows all; 3D: a
                     hidden own light still lights its room in the evening (lightSpots .hidden: no fitting, no glow)
    src/budget.js    project.budget {total, cats, items [{cat, name, qty, unit, price, mat (a material key: amount from
                     the quantities of each version), paid, status, store, link, photo (asset), ver, room}]};
                     budgetFor(p, version); furniture from the shopping list; compare two versions; CSV. Not in viewer copies.
    src/tasks.js     task board: project.tasks {phases [{id, name, steps [{id, name, who}]}] (default = the work
                     schedule), cells {'roomId|stepId': {s todo | doing | done | skip, who, date, note}}};
                     roomProgress(), colorBy 'progress' on the plan
    src/edit.js      drawing and editing (session 4): rooms follow the walls (roomAnchors / followRooms around a wall
                     change; settings.roomFollow), dimension chains (dimChain: wall length, openings and the gaps between;
                     tap a number → <input class="dim-input"> → app.applyDim), several at once (selection {type: 'multi',
                     items}), box select, move, copy / paste (also to another storey or version; clipboard app.clip),
                     mirror, line up, same height; furniture copy / paste / mirror / align / spread
    src/stairs.js    stairs drawn in the app: plan.stairs [{id, storey, kind straight | L | U, x, y, rot, w, g, n, turn
                     left | right, H, upper, hole}]; stairGeom() (treads, landing, walking line), the opening in the
                     floor above (stairHoles → roomHoles / slabs), 2D symbol, 3D treads you can walk on, the panel
                     (riser height and the step rule 2r + g)
    src/openings.js  door and window types: op.style (doors hinged | double (op.leaves 2) | sliding | pocket | glass |
                     folding; windows fixed | turn | tilt | sliding | top); 2D symbols, 3D leaves (sliding doors slide:
                     registerDoor(id, grp, full, slide)), window frames, handles (lever / bar / flush / knob, both
                     faces). buildOpeningFills(): under every door, opening and floor-level window the floor runs on
                     (floor strips split where the rooms meet, each in its room's floor) or a threshold to the outside
                     (frame colour under a model door, 2 cm high); in an outside wall of layers the cavity beside, above
                     and below each opening is closed (frame colour for façade openings, plaster for a cavity wall
                     between two rooms); boxes merged per material
    src/facade.js    façade changes: the layers of an outside wall (inner leaf, insulation, brick) are parallel walls;
                     an opening put in one is made in the others (op.leaf true, op.link = the first opening's id) and
                     they follow it (withAssembly / withAssemblies). 3D: facadeDiff(original plan, plan) per storey →
                     facadeShellParts() cuts the builder's shell triangles (brick, insulation, bands) where openings are
                     new or wider, with reveals and a sill (part 'fx:sill'), and bricks up the ones that went (patches
                     at the model's real faces); the app draws frames, glass and leaves of new façade openings
    src/drawings.js  drawings: four façades and sections (across / lengthwise at a place, or any slice) rendered in
                     a hidden View3D with an orthographic camera at a true scale (ppm), the cut parts filled (slice
                     cap colour), in colour or as lines (white + EdgesGeometry); levels, title and scale bar drawn on a
                     2D canvas; saved as PNG or printed at 1:50 … 1:500 on A4 (drawingPrintScale)
    src/voids.js     floor openings (plan.voids: stairwell / vide) as zones: drawn dashed with a cross in 2D, selected
                     and moved / resized in Build (rectangles stay rectangles), the Floor opening tool (H, two taps);
                     new ones go into every version (the original too) unless "All versions" is off; "Same in all
                     versions" / "Delete in all versions" change them everywhere, also in a locked original
    src/trees.js     trees, shrubs, grasses, hedges and reeds in 3D. Fast keeps garden.js' simple shapes; Beautiful
                     (also phones: 'mid') and High ('high') grow them: trunk and branches as tapered tubes with bark,
                     the crown as leaf cards (canvas twigs with leaves, cut out by alpha – alphaTest + alphaToCoverage;
                     transparent pixels take the leaves' mean colour so mipmaps have no dark fringe) in clumps at
                     the branch ends; card normals point out of the crown and cards deep inside are darker, so the
                     crown is lit as a volume (MeshLambertMaterial, the back of a card keeps the front's normal).
                     Species from kind + name (vegSpecies: maple, willow, poplar, birch, multi-stem, broadleaf;
                     a small tree is a Japanese maple); templates per species, size (0.5 m steps) and variant are
                     shared (VEG_TPL, userData.keep). Hedges keep their clipped box with leafy patches standing out;
                     reeds are wide cards of a whole stand along a bank (vegReeds)
    src/gate.js      a metal gate with railing (garden line kind 'gate'). The leaf is its own mesh in a group that turns
                     about the hinge (registerDoor, like doors; project.doorState[line id] = 'open'; app.isGate);
                     gardenBlocks() gives walking the garden's walls, hedges, fences, quay and gate (a closed gate
                     opens when walked into). gateLayout() places the leaf (l.gate =
                     { w, at 0…1, side }), the posts and the railing runs along the line; gateGeometry() builds
                     posts with caps, rails, bars with spear tips, the leaf's arched top rail (tube), scrolls, lock
                     and lever as one merged mesh; gateSvg() draws the railing, posts, leaf and its swing in 2D
    src/hq.js        the High quality preset (settings.quality 'high'; quality3d() gives Beautiful when
                     !canHighQuality(): a coarse pointer, a screen under 700 px or no WebGL 2 – phones never run it).
                     hqApply() swaps materials for High versions (hqMaterial, shared): a normal map made from the
                     colour texture's own pattern (hqMapsFor: luminance → height, inverted when the joints are the
                     lighter part, blurred, Sobel), parallax occlusion mapping for textures with a userData.hq.relief
                     depth in metres (reliefPatch: the uv walks along the view ray to the height map; surface frame
                     from screen-space derivatives, so no tangents are needed; fades out with distance), and a fine
                     plaster grain on painted walls (userData.hq.plaster). Also: 4096 sun shadows, a sky that lights
                     and reflects (PMREM of a generated sky; hqLight balances it with the sun and the hemisphere),
                     contact shadows (GTAO, 24 samples, a wide denoise) on every frame
    src/speed.js     the speed check (Settings → 3D quality): measure3d() turns the whole house for a few seconds
                     and keeps the frame times (frameStats: the middle one → pictures a second, the 95th
                     percentile), draw calls and triangles per picture; deviceInfo() (graphics chip, screen and
                     pixel ratio, cores, memory); speedAdvice() picks the best quality that stays smooth (30 a
                     second, few slow pictures); "Use … on this device" sets settings.quality (per browser)
    src/render.js    the photo render (View → "Photo render of this view"): renderView3d(view, {passes, size | W, H})
                     pauses the view's own loop (view.rendering), sizes the renderer to the picture and draws the
                     scene again per pass with the camera jittered (setViewOffset, Halton 2/3), the sun on its disc
                     (Halton 5/7) and a shadow-casting "sky spot" light from a cosine-weighted sky direction (skyDir)
                     carrying RENDER_SKY of the hemisphere light; GTAO per pass at view.aoK 0.75; readPixels and a
                     running sum in linear light (SRGB2LIN / LIN2SRGB tables) on the processor; a light meter pass
                     opens the exposure up to 2× for dark interiors. Everything is put back after (lights, sun,
                     exposure, pixel ratio, view offset, size). renderSheet(): the dialog (progress, Stop, Save PNG,
                     Same view in another version via setActiveVersion + waitView3d, the pictures in a strip, Compare
                     with a slider; back to the starting version and camera on Close). The selection is cleared
                     while rendering (it tints the 3D) and selected again after; between passes the loop yields a
                     task (setTimeout 0) before the next frame, so taps (Stop) get through on slow devices
    src/ar.js        AR (View → "AR: the plan in the real room"): arSupport() (secure context, navigator.xr,
                     immersive-ar), arNotHere() explains what is needed; arSetup() picks storey, room and corners A/B
                     (arCorners: the longest side; arCornerSvg); arGo() asks for the session first (inside the tap:
                     hit-test required, dom-overlay + local-floor optional, the overlay div as root), then builds the
                     storey in a hidden View3D (mini, noBatch, no ground / ceilings / shell, outside walls on) and hands
                     its renderer to three's WebXRManager (reference space 'local'); arFrame() moves the reticle to the
                     hit-test pose; two taps (button or 'select') → arFit(): plan (x, y) → room, turned by rot about the
                     vertical (group.rotation.y = -rot), the middle of A–B on the middle of the taps, floor at the taps'
                     height; nudges turn about that middle and shift along / across A–B. arLook(): visibility per kind
                     (slab, brick + insulation leaves, floors, furniture, points, pipes) and see-through walls on cloned
                     materials (A.clones, never the shared cache); arPipes() posts + sprite labels for 'hidden' notes;
                     arEnd() tidies everything after 'end'. tests/fixtures/fake-xr.js is a pretend AR phone for tests
    src/reuse.js     after an edit or undo (spec.reuse, set by mutate / restoreState via app._editRefresh) a 3D build
                     keeps every storey group whose signature (entrySig: its walls, rooms, openings, points, stairs and
                     voids – also those of the storey above –, furniture, place, selection) is unchanged, with what it
                     added to pickables / doorMap / lightSpots / furnPick / furnRing (regSnap / regSince / regRestore);
                     the garden likewise (gardenSig). reuseGlobal(): anything else that shapes the picture – a change
                     there builds everything. Kept roots are not batched or High-ified again (userData.nBatched)
    src/smooth.js    phones (coarse pointer, dpr > 1, not Fast): pixel ratio × 0.6 while the camera moves, back after
                     250 ms (a timer – frames may pause); prewarm(): renderer.compile after each build, then polls
                     each program's isReady() (not compileAsync: it throws when a material is disposed while it
                     waits – a rebuild during the wait); the loop keeps the last picture until done (max 4 s)
    src/glow.js      Evening: an additive halo sprite at every lightSpot (not above a storey cut, not in Fast)
    src/autoq.js     the first 3D build on a device measures the still view for 1.2 s (measureStill): < 20 fps →
                     Fast with an Undo toast; ≥ 50 on a computer with Beautiful → a toast offering High; once
                     (settings.autoQ; the tests set it so it never runs there)
    src/sun.js       sun and north: NOAA sun position (Dutch summer time), the sun bar in 3D (day, time, play),
                     sun hours per room and in the garden (depth renders from the sun every 30 minutes)
    src/pdfplans.js  plans as PDF to scale: an own small PDF writer (JPEG pictures, Helvetica), plan pictures from a
                     hidden PlanView at 4 px/mm, A4 / A3, the largest fitting scale or one you choose, scale bar,
                     north, title block; façades and sections from drawings.js
    src/merge.js     merging a copy of the same house (file): mergeChanges(mine, theirs) lists differences per
                     version, plan list, garden, furniture, notes, task cells, budget, colours…; each taken or
                     skipped; a save point first
    src/backup.js    backup reminders (settings.backups[projectId] = last export; backupRemind days) and folder
                     backup (File System Access; the folder handle in its own IndexedDB 'house-planner-backup',
                     guarded by a localStorage flag so a failed read can't stop the app starting); packHouse() makes
                     .house.gz (gzip) or .house.json; readHouseFile() reads both; renderFolderStatus(): the top-bar chip #folder-status
                     (last copy / Paused → folderResume; click → menu), folderPanel() shared by Settings and
                     folderDialog() (Export window, ⋯, Search); the reminder's “Save a copy” = quickBackup(): the file
                     is made when the reminder shows (quickBackupPrep) so the tap can share at once (phones: the share
                     sheet, .house.gz → .house.json → .txt; computers: a download); a cancelled share notes nothing
    src/materials.js floors in a pattern (floorSpec: pattern plank | wide | herringbone | chevron, tiles grid | half |
                     third | herringbone, l × w, dir, grout; floorLayout() → one period of polygons for the 3D texture
                     and the plan's SVG pattern), wood tones, paint sheen (matt / satin / gloss) and renovlies.
                     floor.photo = { img, mode: 'piece' | 'pattern', w, h }: a photo of a sample – one plank or tile
                     drawn into every plank / tile of the layout (3D canvas: an affine map per polygon; 2D: one
                     <image> in the defs, a <use> with a matrix per piece), or a piece of floor repeated at w × h
    src/wallviews.js wall views per room: roomFaces → faceFrame(f) (standing in the room: x from the left corner),
                     wallViewData() (top profile under slopes, openings, tiles with tileFall() – centred, whole rows
                     from the floor, one tile less instead of a sliver under a third of a tile –, points on that
                     face incl. units, kitchen runs whose long back edge lies on the face), wallViewSvg() (metres,
                     y up = negative; the kitchen via runElevation), the dialog and wallViewsPdf() (A4 landscape a
                     wall, the SVG made a JPEG with its computed light-theme styles by svgJpeg)
    src/i18n.js      t() and the on-screen translation layer: a MutationObserver translates every text node (and
                     title / aria-label / placeholder) found in the dictionary; keys with {0} / {n} are patterns;
                     " · "-joined pieces and a trailing number are handled; skips inputs and translate="no".
                     The words are in i18n/translations.json ({ English: [Dutch, Norwegian] }), packed into the app
                     as LANG_GZ and unpacked at start when Dutch or Norwegian is chosen.
                     New words: python3 tools/extract_strings.py out.json lists the English texts in the source
    src/ui.js        icons, dialogs, menus, toasts (a menu's button closes its own menu again; a tall menu goes
                     below its button and scrolls, never over it)
    src/ifc.js       IFC (STEP) reader
    src/ifc2house.js IFC → project: storeys, walls, doors, windows, rooms, 3D shell (flags roof, plinth, win,
                     odoor, out, floor; stairs and railings under key 'stair'), plan.voids (stairwells)
    src/styles.css   all styling (light + dark)
    src/index.html   page template
    src/sw.js        service worker for the installable version

2D over the garden (plan2d.js): rooms lie on a plain sheet (room-under), and drawWallSheet() puts one under every wall
(full length, through its openings) and over the cavity between the layers of an outside wall, so the lawn doesn't
show in openings or cavities.
Small live 3D view next to the 2D plan (furnish.js updatePip): Build and Furnish, started per settings.pipBuild
(default off) / settings.pipFurnish (default on), switched for now with the 3D chip (app.pipState).
Phones: app.updateInsets() measures what an open menu (top) and the details sheet (bottom) cover and calls
view.setInsets(top, bottom, focus) — the 2D plan shifts (and keeps a selected room or piece in view).

Libraries (in vendor/, so the app can be rebuilt from this folder alone): three.js r170 (build + OrbitControls, and
the add-ons GLTFLoader, OBJLoader, MTLLoader, GLTFExporter, GTAOPass + what they use: turned into factories by build.py,
packed gzip + base64 as ADDONS_GZ and unpacked on first use with await addon('loaders/GLTFLoader.js')) and pdf.js
3.2.146 (bundled gzip + base64, unpacked only when a PDF is opened; works offline).

3D models library: Kenney Furniture Kit 2.0 (CC0, www.kenney.nl; vendor/LICENSE-kenney.txt).
    node tools/pack-models.mjs "<kit>/Models/GLTF format"      → build/models.json (settings: tools/kenney-config.json)
Looks (30 Oct): glass and water reflect the sky (hq.js skyReflect: the sky picture as the material's envMap, also in
Beautiful); the sky light for everything (scene.environment) stays High only (indoors it lit the rooms too much
without contact shadows, and it cost a lot); grass and paving get patches over the area in metres (garden.js
macroPatch, a seamless noise read at world x/z, chained in capPatch after the High relief); walking by day: a sky
with clouds (walkSkyTexture, the horizon in the haze colour) and Fog 80–400 m, the ground plane out to 1.2 km; phones
and tablets get the soft shadows in corners at half size (aoScale 0.5), drawn once when the view stands still.
Outside the house (furniture.js outdoorsAt: lowest storey, a plot, not closed in by outside walls on all four sides)
a piece stands on the garden (site.level) and is not shown in the original. Cars: kind 'car' (carProfile /
carParts, styles fast / hatch / saloon), category Outside, noWall (no snapping against walls; also own models
kept under Outside).
Sun shadows: renderer.shadowMap.autoUpdate is off; the loop sets shadowMap.needsUpdate when anything but the
camera asked for a picture (view.needs before the frame, doors swinging → view.shadowDirty). Camera moves set
view.camMoved (OrbitControls 'change', linked views). Other renders of a view's scene set needsUpdate themselves.
Canvases from makeCanvas() are read back in memory (willReadFrequently): textures, speckle, depth maps, PDF pages.
Soft shadows in corners: AOEffect in view3d-x.js (a depth-only pass with the real materials, so slices and the cut
stay cut; GTAO from that depth, multiplied over the picture; drawn when the view stands still; settings.ao; in High
always on and drawn with every picture).
Wall corners (view3d.js wallEnds): each wall end gets an extension per face – in line: end to end; a T: up to the
near face of the wall it meets; an L of the same height: mitred; a taller wall covers a lower one – so no two walls
put a face in the same place (no flicker). Attic: roofCeiling(sid) samples the underside of the builder's roof on a
5 cm grid per storey (the lowest roof face above each point, opened by 10 cm); buildRoofFlats() fills the flat top
inside the rooms with the roof's inner material, and walls get a top profile from it (wallRoofProfile).
Furniture in 3D (view3d-x.js furnDragSetup): in Furnish a piece is dragged over its floor; the selected piece has a
ring (buildFurnRing) to turn it; both go through app.dragFurnMove / dragFurnRot (shared with the 2D plan).
Walking with the mouse (walk.js bindLook): drag to look, hold the right button (or press L) for pointer lock; the
turn is eased in tick() unless settings.walkSmooth is false; settings.walkLook (sensitivity), walkInvert. Outside
doors open when you walk into them, so you can walk out into the garden.
Outside doors of the builder's model: ifc2house puts each leaf of a façade door set in a shell group of its own
(material key '…|door:<opening id>:<leaf>'), view3d.shellDoors() turns it about its hinge like the plan's door
(and adds a lever on the inside). The model draws frames / leaves only for openings with a brick ('outer') layer;
other doors in outside walls (a cavity wall between two rooms) are drawn by the app. Frame, glass and leaf parts are
boxes of 12 triangles: shells made before 28 Oct have them inside out, decodeShell() turns them (outwardBoxes()).

Façade details from the model (facade.js / openings.js): low walls (≤ 0.6 m) of an upper storey standing in the line
of its brick above a lower roof (the builder's aerated-concrete upstands) are drawn in the façade's most used brick
(facadeBrickMat), 3 mm proud, and their corners closed (buildUpstandCorners). For each window of the model,
modelWindowInfo() finds its frame, glass and window board in the shell; buildOpeningFills() adds the frame's bottom
rail up to 2 cm above the board (the glass starts there) and closes the space under the board ('winRail').
Tests:  see tests/README.md         (Playwright for Python; serve dist/house-planner-app first)

House file format (export): JSON, or the same gzip-compressed (.house.gz; the app reads both)
    { format: "house-planner", formatVersion: 1, exported, projects: [{ project, savePoints: [] }], assets: { id: { dataUrl, w, h } } }
    project: storeys, versions[{plan: {walls, openings, rooms, voids}}], underlays, shell, homeViews, slices,
    viewSettings, doorState, furniture {layouts, sets, activeLayoutId}, notes, viewpoints, walk {nodes, edges, routes},
    people, colours, models (your 3D models), snagNo (last handover number), viewer (only in a viewer copy),
    images (wallpaper pictures: {name, asset, w, h, avg}), qty (rates), budget, tasks, site (v, plot, north, levels,
    water {level, bed, poly}, streets, trees, around)
    plan (per version) also: points (electrics), walls[].fin, rooms[].tiles / wallBase / wallPaper / ceiling… / heat,
    stairs, openings[].style / leaves / link (façade layers), openings[].leaf (an opening in a façade layer),
    garden {base, areas, lines, plants}, rooms[].floor {material, color, pattern, l, w, dir, grout}, rooms[].wallSheen
    notes: type question | todo | decision | idea | problem | snag (handover point: no, status open | reported |
    fixed | done, statusAt), by (who sent it), mine (made in a viewer copy)
    doorState: 'closed' for inside doors, 'open' for outside doors of the builder's model (closed unless opened)
    assets: { kind: 'model' } for your 3D models (dataUrl of the .glb)
Notes file (Send notes back): { format: "house-planner-notes", projectId, house, from, exported, notes, assets }
Lengths are metres. Plan x to the right, y towards the back of the house.

## Graphics update (1 Nov 2026): three.js r187, real material pictures, real skies, near sun, path tracer
    vendor/three     three.js r187: build/three.module.min.js = three.module.js + three.core.js of the r187 build,
                     bundled and minified with esbuild (one ES module, as build.py expects); examples/jsm add-ons as
                     before plus csm/, loaders/HDRLoader.js, lights/SunLight.js + SunLightShadow.js, utils/SkeletonUtils.js
                     (GLTFLoader needs it) and gpu-pathtracer/pathtracer.js (below). build.py: add-on imports/exports
                     only at the start of a line (their doc comments show example imports). r187 changes handled:
                     PCFSoftShadowMap is gone (PCFShadowMap + shadow.radius 2), GTAOPass.renderPass → _renderPass.
    tools/build-textures.py  ambientCG sets (CC0) → build/textures.json: per set colour 512 px, normal 512, roughness
                     256 (+ metalness), size in metres, avg colour; strips (planks between joints, from the normal
                     map), grid (tile cells), squares (parts without a joint, from the height map); the two skies
                     (Poly Haven, CC0) 1024 × 512 RGBE, gzip + base64. The source zips (≈ 200 MB) are not kept.
                     Since task 0009 its result goes into the asset library (build/library/, below), not textures.json.
    src/texlib.js    TEXLIB (since task 0021 nothing decoded at start: libSet / libSky load a set or sky the first time a
                     3D view, render or walk asks – libLoadSet, libLoadSky –, then TEX/MAT/KMAT/FMAT cleared and 3D built
                     again, one rebuild for several arrivals; TEXLIB.ready = nothing loading and every 3D view built since
                     (texlibSettled, View3D._texGen), TEXLIB.idle() / load(ids) / stats(); TEXLIB.gen is in
                     reuse.js's whole-picture signature); libTex (a picture repeating at its size: one GPU texture per
                     picture, clones repeat), libDetail/libTintCanvas/libTintTex (the picture's light and dark, soft-light
                     over a colour), libMaterial(id, {tint, contrast, rough, normal, side, metal}), libPiece (a plank or
                     tile to cut), libPieceTex (garden tiles), libSky('day' | 'sunset') (HDRLoader; mean brightness and
                     sun position in userData). The bricks: see "The bricks" below.
                     Fast: colour maps only. settings.realTex === false switches the pictures off.
                     Used in: shellMaterial (bricks, roof), brickMat, around (neighbours tinted), garden (gardenLib:
                     lawn, soil, bark, gravel, road, decking, pavers; tiles and pavements cut piece by piece), walls
                     (wallMat: plaster relief), floors (floorMat; floorPatternTexture: each plank/tile cut from the picture,
                     soft-light over the chosen colour), bathroom tiles (tileTexture), kitchen (kTopMat marble/wood,
                     kFrontMat wood upright, kMetal black/brass, the black sink), door handles (handleMat), sofas
                     (Fabric028 on meterBox), tree bark (vegBarkTex). hq.js: the real sky for the environment (High) and
                     skyReflect (glass, water), scaled to the drawn sky's brightness, turned so its sun is the app's sun.
    src/sunnear.js   walking on a computer (not Fast): three's SunLight (two cascaded shadow maps that follow the view,
                     70 m) instead of the DirectionalLight (switched invisible); its direction, colour and strength copied
                     each frame; shadows redrawn when the camera moves. Phones keep the one map. The render ends it.
    src/render.js    renderPathTraced (three-gpu-pathtracer's WebGLPathTracer, computers only): the real sky as the
                     environment, setScene (sync – the async one needs a web worker), renderSample until the samples or
                     Stop, the canvas copied out; Quick 64 / Good 256 / Best 1024 samples. The light-pass render stays
                     (phones, and "Light passes (faster)").
                     Since 1 Nov (evening; your Best render came out black, trees black, then "createImageData … width
                     is zero"): one tile per renderSample, then gpuDone (a fence, polled between tasks) before the next –
                     the graphics card never holds more than one tile; tiles start at ~250 000 px each, grow ×1.5 when a
                     tile takes > PT_TILE_MS (120 ms; Windows resets a card busy 2 s with one piece – TDR – and the
                     browser loses every WebGL context of the page), at least ~48 px each; bounces 6, transmissive 4.
                     A lost context (webglcontextlost / isContextLost) stops it with lostError (e.lost, a clear message);
                     the picture is grabbed by drawing the accumulation to the canvas (pausePathTracing + renderSample)
                     and copying in the same task; canvasBlank → an error, never a black result. The dialog drops a
                     result without a canvas (no black thumbnail) and waits for a new view (waitView3d skips lost ones).
                     Light passes: lostError too (the drawing buffer reads 0 × 0 when lost). The dialog opens without
                     rendering (since 1 Nov, evening): #rn-start "Start render" while there is no picture yet, the
                     options free; .rn-empty says so in the picture's place.
                     Light: libSkyNoSun (texlib.js: the sky picture clipped at 4 × its mean – no sun) as environment, the
                     app's DirectionalLight is the sun (before: the sun twice → ~2.4 × too bright); PT_SKY 1,
                     PT_EXPOSURE 1.25 (the hemisphere light is not path traced). View3D: webglcontextlost/restored →
                     app.view3dLost (toast; panes rebuilt – layoutKey = null, setupPanes – at once when restored, else
                     after 2.5 s; not more than 3 times in 2 minutes); destroy() sets destroyed first (its own
                     forceContextLoss is not a loss).
    vendor/three/examples/jsm/gpu-pathtracer/pathtracer.js  three-gpu-pathtracer (main) + three-mesh-bvh (master)
                     bundled with esbuild (three external); three-mesh-bvh's *.generated.js made from its templates
                     (tools/pathtracer-generate.py). Licence: vendor/LICENSE-pathtracer.txt (MIT).
                     Patched by hand (search "house-planner patch"): mergeGeometries' colour copy when the merged colour
                     has 4 values and a mesh's 3 – upstream wrote the target's zeros into the mesh's own colours and left
                     the merged ones 0 (trees, hedges, reeds black; the scene's tree colours overwritten). Keep the patch
                     when the bundle is made again.

## The bricks (1 Nov 2026): one waalformaat wall in wildverband, coloured from the photo of the house
    tools/brickkit.py  made at build time (build-textures.py → set HouseBrick): 12 header units × 20 courses = 1.32 ×
                     1.25 m, 1024 × 960 px. Bricks 210 × 50 mm (headers 100), head joints 10, bed joints 12.5 (courses
                     62.5 mm); every course a random mix of stretchers and headers (≤ 4 stretchers / 2 headers in a row),
                     odd courses shifted 55 mm so head joints never line up; it repeats seamlessly both ways. Each brick
                     face gets a real brick's surface (one of the single bricks of ambientCG Bricks092, its light and
                     dark around its own average, its relief), sometimes mirrored. Outputs: kit (PNG: R joint 0…255
                     soft, G a random number per brick, joints carry the nearest brick's), detail (JPEG grey, 128 = the
                     brick's average; joints: sand + shade along the bricks), normal (OpenGL, from the height: joints
                     4 mm back, edges rounded 2 mm), rough. The three loose brick pictures (Bricks092/073A/093) are gone.

## Full screen and the sun bar (1 Nov 2026, evening)
    src/fullscreen.js  FS.el/ok (Fullscreen API, webkit prefixes too); app.toggleFullscreen (documentElement,
                     navigationUI hide; only from a click or key), renderFullscreenBtn (#btn-fullscreen at the right end
                     of the top bar, hide-sm: ≤ 860 px it's ⋯ → Full screen, fullscreenMenuItem; html.is-fullscreen;
                     follows fullscreenchange, so Esc is seen), Search "full screen / volledig scherm", Help. Hidden
                     where fullscreenEnabled is false (iPhone Safari). F11 is the browser's own (a page can't see it).
    src/sun.js       sunBar: #sun-fold (the sun) folds the bar (.sun-bar.folded: only the sun) – app._sunFold, reset
                     when settings.light isn't 'sun' (renderStageOverlays), so it is open each time Sun is chosen.
                     #sun-day-lab / #sun-time-lab are buttons: sunDayPicker (UI.dialog: a month grid from Monday,
                     Intl month and weekday names in the app's language, SUN_YEAR (no 29 Feb, as the slider), arrows,
                     Today / Longest day 21 Jun / Shortest day 21 Dec) and sunTimePicker (hours 04–23, minutes in fives,
                     23 → :00 only, Now / Sunrise / Sun highest (mid of rise and set) / Sunset). Both live (setSunDay,
                     setSunTime: slider, label, words, the sun) and put back on Cancel or ×. #sun-times follows the day.
    src/app.js       overlayPush: bars in .stage-top that reach the pane's top right corner (the view cube and the
                     Slice dock) push those down below them (--ov-push on the pane; CSS top: calc(… + var(--ov-push))).
                     Called after renderStageOverlays and by a ResizeObserver on the overlay (wrapping, folding,
                     window size). No transition on top: the natural top is measured as top − the current push.

## Outside doors in wood, and less memory for the pictures (1 Nov 2026, evening)
    Wood012      (ambientCG, CC0; your download) the outside doors' leaves: shellMaterial → libMaterial('Wood012',
                 { rot: 90 }) for materials with odoor and part 'leaf' (frames, glass, metal unchanged). build-textures.py
                 keeps a picture's shape now (512 wide, its height by the picture; size [w, h] in metres): Wood012
                 [1, 0.5], Concrete034 [2, 1] (it was squeezed square before). libTex(id, kind, size, rot): rot turns it.
    texlib.js    one picture per pattern for all colours: libMaterial with a tint → libDetailTex(id, contrast, size, rot)
                 (the picture's light and dark, raw values – NoColorSpace –, one GPU texture per picture and contrast,
                 clones repeat) + the material's colour; softMaterial/softPatch: the shader lays the colour over it with
                 the canvas's soft-light formula in screen values (sRGBTransferOETF/EOTF) – the same look (test_round23
                 compares it with libTintCanvas). capPatch's chain and hqMaterial's clone run softPatch first (before
                 the relief, which takes the map include over). renderPathTraced doubles their colours while setScene
                 reads them (the path tracer multiplies colour and picture; the grey's middle is 0.5).
                 libBrickShared(rgb): the neighbours' gable bricks and the quay – one grey wall (BRICK_GREY, half size)
                 soft-lit with the colour. around.js: façade pictures for colours rounded to steps of 0.06 (17 → 5).
                 libLowMem() (a phone, or Fast): the house's brick colour pictures at half size (the relief stays full),
                 libPieceTex at 384 px (garden tiles), the neighbours' façades 256 px.
                 Measured (the example, whole house + garden, the pictures in the scene, w × h × 4 × 4/3): before
                 93 MB; now 77 MB on a computer, 55 MB on a phone. (Floors cut piece by piece – fp| – and bathroom tiles
                 keep a picture per colour: their joints have their own colour.)

## The render's light (1 Nov 2026, late evening)
    Your renders looked flat and bluish (the sky white, white specks, Best hardly better than Quick). Measured: in the sky
    photo the sun gives 2.4 × the sky's light on the ground (horizontal); the path tracer had the sky at twice the sun.
    texlib.js    libSkyDecode also sums the sun (what is above the clip of libSkyNoSun, over the solid angle):
                 userData.sunE (its light on a surface facing it), sunRGB.
    render.js    renderPathTraced: environment = libSkyNoSun × PT_SKY × Sky, turned so its bright side is at the app's
                 sun; the background the same sky (Sky behind the house) with backgroundIntensity/Rotation; the
                 DirectionalLight = PT_SKY × sunE × rel(elevation, as the app's sun) × Sun (put back after). Exposure:
                 meter() reads 24 rows of the path tracer's float target (the running mean), the log-average of the
                 light with the brightest tenth left out, put at PT_KEY (0.18), × 2^ev; after samples 1, 4 and 16.
                 filterGlossyFactor 0.5 (glints after the first bounce blurred: no white specks). Warmth: warmCanvas
                 (gains on red and blue in light values) on every grab.
                 RENDER_LIGHT { ev, sun, sky, warm, skyBg } with settings.renderLight over it (renderLight()); the light
                 passes use them too (sun ×, hemi/env/sky light ×, exposure × 2^ev, the gains in paint, the sky behind).
                 The render window: "Light" rows (#rl-ev, #rl-sun, #rl-sky, #rl-warm, #rl-skybg, #rl-reset Normal light),
                 kept in settings.

## The render window frames the photo; Continue; time per quality (1 Nov 2026, night)
    render.js    View3D.prototype.borrow(box) / giveBack(): the 3D view's own canvas moved into the render window's frame
                 (#rn-frame); resize() takes that box's size (and does nothing while v.rendering – a render sets the
                 size itself and calls resize when done); the pane keeps a still copy (canvas.gl-still), the room
                 names hidden, no view offset; pick() does nothing while borrowed (view3d-x.js). destroy() takes a lent
                 canvas out of the window too. The window re-lends when the 3D view is started anew (a 400 ms check).
                 The frame: RENDER_RATIOS ('view' = the pane's shape when opened, '16:9' … '9:16', or a number dragged
                 with the edge grips .rn-grip.l/r/t/b), fitted into .rn-area; renderRatio, renderDims(longSide, ratio)
                 (even numbers); RENDER_RES hd 1280, fhd 1920, 2k 2560, 4k 3840 (renderResList: no 4K on a phone).
                 settings.renderOpts { q, method, res, ratio, dn } kept; app._renderOpts the live object (tests set W, H,
                 passes on it). Start render / Stop in the dialog's footer (#rn-start, #rn-stop); the preview bar
                 #rn-ratio (menu #rn-ratio-16-9 …) and #rn-px, or #rn-back when a picture is shown (#rn-view over the
                 frame); actions #rn-save, #rn-more (Continue), #rn-other, #rn-compare.
                 renderView3d / renderPathTraced take keep: true – the render stays set up when done; res.more(extra,
                 {onPass, onPaint, stop}) adds passes/samples to the same picture (the path tracer, its targets and the
                 light kept), res.end() puts the view back (Back to the view, another render, Close). msSampling: the
                 path tracer's time without its BVH. settings.renderSpeed { pt, passes }: ms per sample per million
                 pixels (60 % new, 40 % old) → the "≈ time" under Quick / Good / Best, and "about … left" while running.
                 Pictures in the window: shrinkUrl (2048 px long side; thumbnails 360) – the full canvas kept to save.
    ui.js        a dialog no longer focuses a range slider first (it scrolled the render window down); Esc with a menu
                 open over a dialog closes only the menu.

## Path traced pictures that converge; cleaning their grain (2 Nov 2026, night)
    vendor/…/gpu-pathtracer/pathtracer.js  (house-planner patch) the StratifiedSamplesTexture is read as (slot, bounce)
                 with slots 0 … 16; the library sized it (bounces + transmissiveBounces + 5) wide – 15 with our 6 + 4 –
                 so rand(15) (the lobe a bounce takes) and rand2(16) read zeros: the same per pixel for every sample, a
                 grain that never went (Best ≈ Quick, white dots). Now init(n, n) with n = max(20, …). Measured on a
                 small scene: the error against 1024 samples 0.13 at 16, 64 and 256 samples before; 0.060, 0.040, 0.025 now.
    denoise.js   makeDenoiser(renderer, scene, camera, W, H): the view drawn once plainly into a half-float target
                 (4 × MSAA up to 4.2 Mpx): MeshBasicMaterial copies (colour, map, vertex colours, alpha test; soft-lit
                 colours × 2 as the path tracer sees them) with the view distance in alpha (onBeforeCompile); glass
                 (transmission, or transparent and opacity < 0.6 without a picture) and ShadowMaterial left out; lines,
                 points and sprites hidden. Normals from the distances (the nearer neighbour across an edge). run(tex,
                 samples): light = colour ÷ reflectance (the surface colour × 0.96 + 0.04 for non-metals – the mirror-like
                 part –, the colour for metals); its grain measured (the variance over 5 × 5 neighbours alike in plane,
                 normal and colour) with the local mean light (target V); 5 à-trous passes (5 × 5 B3 kernel, steps
                 1 … 16) weighted by the plane distance, the normal (dot^32), the surface colours' likeness (albW) and the
                 light's difference against DN_SIGMA (2.5) × the grain (carried along as Σw²var/(Σw)²) – the first pass
                 compares the local means, not the single grainy values (otherwise a bright speck counts for nothing
                 next to darker neighbours and the picture loses light: measured up to 11 % darker); × reflectance
                 again; the sky as it was. dispose(). Measured on the small scene, the same 8 samples as they are and
                 cleaned (res.redraw): the light the same within 1 – 6 %, the grain to about a third.
    render.js    renderPathTraced: denoise (default on): pt.renderToCanvasCallback draws the cleaned target when grab()
                 takes the picture (not while sampling); res.redraw(on) takes it again with or without (the window's
                 "Clean up the grain" row .rn-dn, also on the picture shown); res.denoised.

## The view's exposure follows what you look at (2 Nov 2026, night)
    autoexp.js   View3D.prototype.aeStep(active) every frame (view3d.js loop, before the draw): 320 ms after the camera
                 stops (also walking: after you stop), and a second after the light changes – applySun (the sun bar,
                 playing the day) and applyLight (every build) set _aeLight – and on every second while it goes on, it
                 asks for a draw; aeTake() (the loop, right after that draw) copies 12 rows of the screen's drawing into
                 a pixel-pack buffer (readPixels into a PBO, a fence – no waiting: a reading that waits held the page for
                 the whole picture, 7 – 80 s on the test computer's software graphics); aeCollect() (aeStep, when the
                 fence has passed) reads ~96 points per row, screen values back to light values (AE_LIN), the log-average
                 with the brightest tenth left out, ÷ the exposure it was drawn with. Target k = clamp((AE_REF 0.054 ÷
                 L)^0.5, 1, 1.8) – never darker than the normal view (its rooms are lit evenly: a light room means white
                 walls); after camera moves the exposure glides there (time constant 160 ms, steps of at most 250 ms),
                 after a light change it jumps. base × k (base 1.0 by day, 1.1 in the evening, when it is off). aeOn(): not
                 in the evening, not in small (mini) views, not when settings.autoExposure === false (Settings → 3D
                 quality → Exposure: #set-ae Automatic / Always the same), not after a device failed (_aeBroken).
                 (Not a separate drawing of the scene into a light-value target: that needs every material's shader again
                 – it held a slow device for minutes; side by side timed out in the tests. Not other redraws – a wider
                 window is the same view.) AE_REF measured: the overview of the example by day 0.054. The photo render
                 keeps and gives back toneMappingExposure, so it starts from the view's.

## The garden and driveway tiles close up (2 Nov 2026, night)
    tools/build-textures.py   Tiles050 (the garden tiles, 50 × 50 on the parking): plain=0.06 – of the squares without a
                 joint (clean_squares, from the height map) only those whose mean light (of the colour picture) is at most
                 0.06 above the median: the two light pink riven stones are left out (they looked streaky pink close up);
                 px=1024 – its colour picture at 1024 px instead of 512 (a tile is cut from ~0.14 of the picture: 146 px
                 instead of 73 for a tile drawn 160 px wide). textures.json +150 KB. Every other set came out byte for
                 byte the same when rebuilt (python3 tools/build-textures.py <texsrc> <sky-day.hdr> <sky-sunset.hdr>).
    texlib.js    libPiece: a square is cut 3 % in from its edges (no trace of the joint around it – a light line at a
                 tile's edge). libPieceTex with squares: each tile turned a quarter at random and mirrored at random;
                 never the same square as the tile left of it or above it, also across the repeat (up to 12 tries).
                 Tested by test_round28.py (the tile texture's tiles: light, redness, edges, neighbours; PC and phone).

## A lock for the view in the render window (2 Nov 2026, midday)
    render.js    renderSheet: #rn-lock (chip in the preview's bar, next to the shape; aria-pressed; disabled while
                 rendering) toggles `locked` (per opening of the window – it starts unlocked; kept through a render and
                 Back to the view). Locked: #rn-shield, a cover over the frame (z-index 1: above the lent canvas, below
                 the grips and the hint) – nothing reaches the canvas, so OrbitControls, the walker's look-around, the
                 double click (home) and pinching all stay off without touching their code; touch-action pan-y on the
                 cover and the frame, so a drag on a phone scrolls the window. Locking stops a glide that is still going
                 (freeze: view.anim, the controls' _sphericalDelta/_panOffset/_scale, the walker's look, pointer lock). A
                 click on the cover shows in the hint how to unlock and nudges the button (.rn-nudge). The shape (menu,
                 grips) and the size still change – the camera stays where it is. Tested by test_round29.py.

## The app's version on the projects page (2 Nov 2026, evening)
    util.js      APP_VERSION = { n, date, build }: n is the number of the last delivered round (the notes' rounds –
                 raise it by one, with the date, for every delivery), build the placeholder '__BUILD__' that build.py
                 fills in with the build code (sha1 of the single file with the placeholder still in it + textures.json,
                 10 hex – the same code as the offline cache's name hp-… in sw.js; a second '__BUILD__' anywhere in the
                 source stops the build). app.js renderAppVersion(): under the footer of the projects page, "App version
                 31 · 2 Nov 2026 · build …" (#app-version; the date in the app's language). Tested by test_round31.py.

## The neighbourhood from the site plan (2–3 Nov 2026, night)
    hood.js      buildStreets: road and parking strip 10 cm below the pavement (HOOD_LEVEL), slabs from 45 cm below;
                 kerbs (12 cm, top level with the pavement) and flat bands from hoodKerbs – every ~1 m of a low strip's
                 edge looks 0.3 m outside it (pavement, a planter, the plot → kerb; the parking strip → band; road →
                 nothing; nothing → kerb); planters (raised kerb, bark, low shrubs within 60 m), lamps (5.4 m pole, round
                 lamp), street trees. The road's herringbone (20 × 10 cm, at 45°) and the parking strip's stretcher bond
                 are canvases (hoodPaverTex) in the colours of the street view (road #B7A28F in the sun, strip #9F9387).
                 buildHood: each house one gable volume (hoodVolume: walls with windows – the around façade –, gables
                 white or brick, roof tiles in its colour, pitch 50°, eaves 5.7 m or 3.4 m for a roof wider than 11.5 m,
                 ridge at most 12 m) plus its cross gables (on to the main ridge, a little lower), its panels on the
                 roof planes; annexes (3.1 m, the brick of the nearest house) and sheds (2.5 m, dark wood), coping close
                 by. Level of detail by distance to the plot: < 45 m gutters, boards along eaves and verges and ridge
                 tiles; < 100 m cross gables, panels, sheds; further only the main volume. Merged per material (VegBuf).
                 Walls (brick + course on edge, 0.45 m), screens (1.8 m) and hedges along the plots. buildLot3: the
                 builder's model's outside (out, win, odoor, roof, plinth; not floors or stairs) mirrored (scale.x −1)
                 at x' = 68.3 − x, y' = y − 0.37, its own materials (lot3Material: never cut; the red brick × 0.84).

## The park on to the houses on the other side (3 Nov 2026, night)
    around.js    around.water may hold { o, h } (a canal round islands): water and bed with holes, banks along the
                 outline and round each island (gBankSlope(…, away = true)), the islands' grass; the ground's holes are
                 the outlines; 2D with fill-rule evenodd. The park's paths in hoodParkPathMat (Concrete014 tinted
                 #C9C2B7, no joints). The playground (buildPlay, hood.js) with Water & park.

## Connection points, dimmers, switch colours (3 Nov 2026)
    install.js   'connect': a wired connection point (aansluitpunt) – for an appliance, an awning, a garden lighting
                 cable, an electric car – drawn as the builder's dot with three strokes (+ Z / K / EV). Switches can
                 have a dimmer (pt.dim; the sub 'dimmer' is a single dimmer): a filled wedge in 2D, a knob in 3D, ' · with
                 dimmer' in names and counts. plan.elecColor (white, matt black, anthracite, aluminium) colours the
                 plates of switches, sockets, data / TV and conduits in 3D (pt|plate-<colour>); plan.elecRange names the
                 range. model.js: the floor 'casco' (no screed yet; counted like screed).

## Your floor and your sofa (4 Nov 2026, evening)
    materials.js floorProductFields: a room's Floor can be a named product (floor.product = { name, pack: m² a pack });
                 quantities.js counts such floors by name (floorProductKey: 'floor|<material>|p:<name>', the same in
                 every language, so a budget line can follow it) in whole packs (amount = packs × pack m²).
    renato.js    The Renato of Inhouse (after furniture.js): 30 types of kind 'modsofa' in the category 'renato' (from the
                 model sheet: straight 1–3-seaters with 0, 1 or 2 arms, loveseat, corner, round corner 111 × 111, round
                 island 136 × 128, corner + round island 100 × 230, longchair with arm 113 × 182, ottoman 100 × 135,
                 footstools 70 × 80/90/100; depth 100, seat 44, back 85, arms 20 wide and 60 high). renatoParts gives
                 the plan shapes (outline, back and arm bands, seat and back cushions, rolls, legs; L/R mirrored);
                 renatoSymbol draws them in 2D, renatoMesh in 3D: soft blocks (rnPrism: the shape moved in by its
                 rounding, ExtrudeGeometry with a bevel, UVs in metres for the fabric picture Fabric028 in the piece's
                 colour), rolls as cylinders, black metal legs. RENATO_COLOR #868A72 (the green of your photo).
                 rnMerge (5 Nov): a piece's 20–60 parts become one mesh per material and shadow setting (batch.js's
                 batchGeometry; userData.soft = the soft blocks in it) – the corner sofa took 80 draw calls, now 18
                 (test_round8: a phone storey under 250).
    tools        gpu-check.src.html + make-gpu-check.py → dist/gpu-check.html: a 3D check for a phone or computer
                 where 3D won't start (the browser's reason, the chip, ten steps like the app's, resumable after a
                 crash). On the Pixel 10 (PowerVR DXT-48-1536): Chrome's ANGLE on OpenGL ES crashed at the material
                 pictures; on Vulkan every step ran. Tested by test_round38.py.

## The house overlay and the made-up test house (task 0003, 12 Nov 2026)

    src/house.js   HOUSE: what a house built into the app brings (migrate, site, gardenDelivered, gardenSample, siteStep,
                   plot, files, mirror, viewerStub, exports). All empty in the public app; the app checks before use.
                   Callers: model.js (migrateProject → HOUSE.migrate; buildExampleProject → HOUSE.gardenSample),
                   garden.js (migrateSite: HOUSE.site / gardenDelivered, the site steps 2 … 10 through HOUSE.siteStep;
                   a plot with site.from whose house is not built in is left as it is; the Garden tool's HOUSE.plot
                   button), docs.js (docsEnsureFiles: HOUSE.files + exampleFiles – the example's own document files,
                   EXAMPLE_HOUSE.files – + docsFromLibrary: a document with doc.lib = 'doc:<name>' gets its PDF and
                   thumb from the library item of that id, under its own asset ids, where they are not on the device;
                   without the library Documents shows a hint with Load library…; task 0022), share.js (viewerScript: the "big files of the house" marks → HOUSE.viewerStub),
                   hood.js (the mirrored neighbour: HOUSE.mirror), main.js (window.__hp gets HOUSE.exports).
    build.py       --house DIR / --no-house (default: house/ when it is there). The house's modules go just before
                   main.js; its "texts" replace whole quoted texts of the public app (general → the house's own); the web
                   version is the public app with the made-up example house only (task 0008); house.json "secret" words may not be in the
                   public app, the web version or DEPLOY.md (asserted).
    tools/testhouse/  the made-up house: make_ifc.py (an IFC4 file, written by hand), make_pdf.py, build.mjs (the
                   app's own IFC import + versions, furniture, electrics, plot, garden, a PDF) → build/example.json.

## The asset library (task 0009, 13 Nov 2026)

    build/library/   the public library, committed: library.json (items: id, kind tex / sky, licence, source, base, meta,
                     maps / gpu / files: [{ px, f, b }]) and its files, each named <id>.<map>.<px>.<sha256:12>.<ext> (a new
                     picture is a new name: a device never keeps an old one). tex/ the 25 picture sets (as textures.json
                     was), sky/ the two skies at 1024 and 512, gpu/ KTX2 copies of colour, relief, gloss, metal (ETC1S;
                     relief UASTC + zstd; turned upside down – a compressed texture can't be flipped on upload).
    tools/build-library.py  --import <textures.json> (build-textures.py calls it), --gpu (the KTX2 copies: node
                     tools/lib-ktx2.mjs, npm ci --prefix tools), --check (whole, hashes, no stray file, licences CC0 /
                     CC BY – ci_precheck.py runs it, and stray_models(): no .glb / .gltf outside it except tests/fixtures),
                     words_in() (build.py: no house word in the web version's library, list and bytes).
    tools/package.json  the node tools, pinned: ktx2-encoder + sharp (lib-ktx2.mjs), @gltf-transform + meshoptimizer
                     (glb-pack.mjs: a house's models – dedup, prune, WebP pictures ≤ 1024 px, meshopt geometry, the
                     top-view outline with src/outline.js).
    build.py         make_lib(): build/library + 'pack:kenney' (the Kenney geometry, gzip) + 'code:basis' (the basis
                     transcoder of three.js r187, for KTX2) + a house's models ('l:<file name>', private, from
                     house/models/contents.csv; packed copies cached in dist/.glbcache) → lib/ of the app folder (named
                     'house' when it has private models) and of the web version (always 'public': asserted no model, all
                     CC0 / CC BY, no house word); dist/house-planner-library.zip = the app folder's lib/ (stored, not
                     deflated). The single file: TEXLIB_DATA = the base sets at their smallest size and the skies at 512 as
                     data URLs, MODEL_LIB_BLOB = the Kenney geometry; hosted: both null (MODEL_LIB keeps names, sizes,
                     outlines and pack: 'pack:kenney'). Add-ons for it: utils/WorkerPool, libs/ktx-parse, libs/zstddec,
                     math/ColorSpaces, loaders/KTX2Loader, libs/meshopt_decoder (a minified module's export block at the
                     end of a line is read too; import.meta.url → location.href).
    src/library.js   LIB: a second IndexedDB database, house-planner-lib (files: { f, blob }, libs: { name, man, from })
                     – the houses' database is never touched. libraryInit (stored libraries; hosted: lib/library.json
                     with cache 'no-cache', kept for offline, then files no list names are pruned), libItem, libPick
                     (largest size ≤ asked, else the smallest), libWantPx / libWantGpu (app.settings.texSize, texGpu;
                     safe pictures – libSafe – cap them at 512 / off), libBlob (device, else fetch lib/<f> and keep),
                     libUrl, libGunzip, libLoadZip (the zip's central directory, file by file with File.slice; stored or
                     deflated; sizes checked against the list before anything is unpacked; a failed or replaced load
                     is pruned), libRemove, libStatus. Item kinds: tex, sky, pack, code, model ('l:…', the owner's
                     models) and doc ('doc:…', the owner's documents: a PDF and a thumb { thumb, w, h } – build.py
                     house_docs() from house/docs/docs.json; task 0022). libValid: a list (served or from a zip or kept) whose items lack
                     their files is refused. The list is fetched with a 6 s timeout (then the kept one); files of an
                     old list are pruned only after the new base is kept (texlibInit). The KTX2 transcoder is used only
                     when its SHA-256 equals LIB_CODE_SHA (build.py builds the hashes of vendor/…/basis into the app).
    src/texlib.js    texlibInit: the single file's TEXLIB_DATA or (hosted) libBaseData – the base sets from the library
                     at the size asked – decoded at start as before (TEXLIB.ready keeps its meaning); then libUpgrade
                     (other sizes, the 1024 skies for the single file with a library), libLoadSet (sets not in the base:
                     on a material's first ask), libGpuTex / libKtx2 (KTX2Loader with the library's transcoder via a
                     LoadingManager URL modifier); texlibRefresh (old textures disposed after the views are rebuilt);
                     texlibSettingsChanged (texSize / texGpu changed). TEXLIB.px / skyPx: the widths shown.
    src/models.js    loadModelLib: MODEL_LIB_BLOB, else the library's pack; 'l:' models (libModelTemplate: GLB with
                     meshopt via GLTFLoader.setMeshoptDecoder, unit box as your own models); missing: a plain box in the
                     piece's colour (userData.libMissing), the panel's note (furnish.js .lib-missing), 2D: the box symbol.
                     libAfterLoad (a library came or went). modelPackB64: a viewer copy made from a hosted version gets
                     the Kenney geometry inside (share.js viewerScript).
    src/sw.js        leaves lib/ alone (the app keeps it in house-planner-lib; a new app version doesn't fetch it again).
    src/panels.js    Settings → Library (librarySettings: status per library, Load library…, Remove).
