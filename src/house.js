/* ───────────── house.js — what a house built into the app brings along ─────────────
   The app itself knows no particular house. A house can be built into it (build.py --house DIR: the folder's own
   modules, its example house and its texts – the owner's house lives in such a folder in the private repository and is
   never part of the public app or the web version). Its modules fill in HOUSE; everything here is optional and the app
   checks before it uses one, so without a house (the public app) nothing of it is there:
     migrate(p)          once when a house file opens, after the app's own upgrades: the house's own additions (its
                         kitchen, installations, documents …) – only for a file of that house
     site()              the example's plot from its site plan (an example file without a plot gets it)
     gardenDelivered(s)  the garden as the builder delivers it on that plot (a version without a garden gets it)
     gardenSample(s, g)  a first idea for the garden of the example's planned versions
     siteStep(p, n)      the house's own part of the plot's upgrade to site version n (2 … 10); true when the plot is
                         the house's own (it did the step), false for any other plot
     plot                { id, label, toast, site(), garden(site) }: the Garden tool's button "Plot of …"
     files(p)            files the house's data brings along (documents, pictures): [{ id, dataUrl, … }] for Assets
     mirror              { lot, x, dy, brick }: a neighbour that is this house mirrored (hood.js)
     viewerStub          what takes the place of the house's big files in a copy for viewing (share.js)
     ownId(id)           true for an id of the house's own additions (its kitchen, floor picture, budget lines …): the
                         public tests leave those out when they run on a build with the house (window.__hp.ownId)
     exports             names for the tests (window.__hp) */
const HOUSE = { migrate: null, site: null, gardenDelivered: null, gardenSample: null, siteStep: null, plot: null, files: null, mirror: null, viewerStub: '', ownId: null, exports: {} };
