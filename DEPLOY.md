# House Planner on a fixed web address

`build.py` makes a web version in `dist/web/` (and the same files in `dist/house-planner-web.zip`). Put these
files on any static web host and the app has a fixed address that works on the phone and on the PC, can be
installed ("Add to Home screen" / "Install app") and then also works offline.

## What is in the web version

- The whole app, the same as `house-planner.html`.
- The **made-up example house** (a test house with three storeys, an original and two planned versions) behind the
  "Example" button – never a house built into the app (your own house is only in the offline file made with it). The
  web address is public, so it carries no data about your house.
- Your houses never go to the web host. They live in the browser of each device, exactly like the offline file.
  To bring your house in: export it in the app you use now (Export → Save file) and import that file in the web
  version (Import house file). Do this on each device. Merge (⋯ → Merge a copy of this house) brings changes
  from one device to the other later.

The web version and the offline file are separate places for the browser: a house in one is not automatically
in the other.

## GitHub Pages from this repository (how House Planner's own address is made)

https://smholte.github.io/house-planner/ is published by the workflow "Publish web version"
(`.github/workflows/publish.yml`), only by hand: Actions → "Publish web version" → Run workflow → version `main` (or
a commit) → Run workflow. It builds the web version of that commit, refuses when that commit's Tests run was not
green or when it finds a word of the owner's house (the list is the repository secret `HOUSE_WORDS`), and publishes
it. Settings → Pages → Source must be "GitHub Actions" (once).

## GitHub Pages by hand (free)

1. Make a GitHub account if you don't have one, and a new repository, e.g. `house-planner` (it can be public; it
   contains only the app).
2. Upload all files from `house-planner-web.zip` (unzipped) to the repository: "Add file → Upload files", drag the
   files in, "Commit changes". Keep the folder `lib/` (the asset library: pictures, skies, furniture models) as it is,
   next to `index.html`.
3. Settings → Pages → Build and deployment → Source: "Deploy from a branch", Branch: `main`, folder `/ (root)`,
   Save.
4. After a minute the app is at `https://<your-user-name>.github.io/house-planner/`.

## Netlify Drop (free, no account needed to try)

Open https://app.netlify.com/drop and drag the unzipped `web` folder onto the page. You get an address like
`https://something.netlify.app` (with a free account you can keep it and give it a nicer name).

## Updating

Upload the new files over the old ones (same names). The app checks for a new version when it opens; the next
time it starts it uses the new one. Your houses stay where they are. Which version a device runs is at the bottom of the projects page
("App version … · build …").

## AR (the plan in the real room)

AR needs the app opened from an `https://` address (GitHub Pages and Netlify give one), on an Android phone in
Chrome with "Google Play Services for AR". A downloaded `house-planner.html` can't start AR, and iPhones can't do
AR in a web page. The web version's example is the made-up house: import your own house file on the phone first.

To try AR without putting it online (a test on your own network):
1. On the PC, in the unzipped `web` folder: `python -m http.server 8000` (Python 3), and note the PC's address on
   your network (e.g. `192.168.1.20`).
2. On the phone in Chrome: open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enter
   `http://192.168.1.20:8000`, set it to Enabled and restart Chrome.
3. Open `http://192.168.1.20:8000` on the phone, import your house file, View → "AR: the plan in the real room".
Or, with a USB cable: Chrome on the PC → `chrome://inspect` → Port forwarding `8000` → `localhost:8000`; then
`http://localhost:8000` on the phone counts as secure.
