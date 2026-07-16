# Sector Cartographer

A self-hosted, collaborative sci-fi sector map: star systems, fleets and their
carrier rosters, hyperlanes, freehand drawing, and a setting wiki/codex — with
per-player roles for running asymmetric-information games (see below). Originally a single-file Claude
artifact; this is the same app split into a normal React project with a real
shared backend (Firebase Realtime Database) so it can be deployed anywhere and
embedded in a Google Sites page.

## Project layout

```
src/
  theme.js            colors, panel/input styles, the chamfered-panel clip-path
  constants.js         zoom limits, wiki categories, marker icon set, storage keys
  lib/firebase.js       Firebase app/init (reads config from env vars)
  lib/storage.js        get/set/delete adapter — shared data -> Firebase, personal -> localStorage
  lib/carriers.js       fleet composition — squadron counts, craft totals, model autocomplete
  lib/shipArt.js        the SVG ship-art library — name matching, upload validation, safety notes
  lib/routing.js        which page a URL means, and vice versa — see "Linking to a page"
  hooks/useMapInteractions.js   pan/zoom/drag/draw — all the map's DOM/pointer/canvas logic
  hooks/useResponsive.js        mobile breakpoint tracking
  hooks/useHashRoute.js         the current page, read from and written to the URL hash
  components/            one file per UI piece (Toolbar, SidePanel, FleetView, WikiView, popups, ui/*)
  App.jsx                 top-level state + composition
```

## 1. Set up Firebase (one-time, ~5 minutes)

The map's shared data (systems, fleets, wiki entries, drawings, the edit-lock
code) lives in a Firebase Realtime Database so every visitor sees the same map.

1. Go to https://console.firebase.google.com and create a project (free tier is enough).
2. In the left sidebar, go to **Build > Realtime Database** and click **Create Database**.
   Choose a location, and start in **test mode** for now (we'll lock it down in step 4).
3. Go to **Project settings** (gear icon) > **General** > scroll to **Your apps** > click
   the **`</>`** (web) icon to register a new web app. Copy the `firebaseConfig` values shown.
4. In this project, copy `.env.example` to `.env.local` and paste in those values:
   ```
   cp .env.example .env.local
   ```
   Fill in `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`, etc.
5. Lock down the database rules so strangers can't wipe your map. In the Realtime
   Database console, go to the **Rules** tab and use:
   ```json
   {
     "rules": {
       "sectors": {
         "$sector": {
           ".read": true,
           ".write": true
         }
       }
     }
   }
   ```
   This keeps it open to anyone with the link (matching the app's own casual
   edit-code lock) but scoped only to the `sectors/` path. If you want real
   auth-gated writes instead of the in-app edit-code, that requires adding
   Firebase Auth — out of scope here, but the rules are the place to add it.

## 2. Run it locally

Requires [Node.js](https://nodejs.org) (v18+).

```
npm install
npm run dev
```

Open the printed `localhost` URL. The app loads your saved sector from Firebase
(an empty sector on a brand-new project); edits save to your Firebase project
within ~600ms (see the SAVED indicator top-right).

## 3. Build & deploy

```
npm run build
```

This produces a static `dist/` folder — plain HTML/CSS/JS, no server required.
Deploy it to any static host. Two easy free options:

**Netlify** (drag-and-drop):
1. Run `npm run build`.
2. Go to https://app.netlify.com/drop and drag the `dist` folder in.
3. You'll get a URL like `https://random-name.netlify.app`. Note: the *Firebase*
   env vars need to be set at build time, so if you use Netlify's git-based
   deploys instead of drag-and-drop, add the `VITE_FIREBASE_*` vars in
   **Site settings > Environment variables** and let Netlify run `npm run build`.

**Vercel**:
1. `npm i -g vercel` then `vercel` in this folder, or connect the repo at
   https://vercel.com/new.
2. Add the `VITE_FIREBASE_*` variables in the project's **Settings > Environment Variables**.

Either way, once deployed you'll have a public URL serving the map.

## 4. Embed in Google Sites

1. Open your Google Site in edit mode.
2. Insert > **Embed** > **By URL**, and paste your deployed URL
   (e.g. `https://your-map.netlify.app`).
3. Resize the embed block to a good size — the app is responsive down to phone
   widths, but a large embed (most of the page width, 600px+ tall) works best
   for a map.
4. Publish the site.

Google Sites embeds run in an iframe, which is why `vite.config.js` builds
with relative asset paths (`base: "./"`) — it works regardless of the host path.

If Google Sites' embed dialog rejects the URL, use **Insert > Embed > Embed code**
instead with:
```html
<iframe src="https://your-map.netlify.app" style="border:0" width="100%" height="700"></iframe>
```

## Fleets, carriers & squadrons

The model has three levels:

- **Fleet** — a marker on the map. Belongs to a faction, and is either stationed
  at a system or in transit. Drag it around; drop it near a system to station it there.
- **Carrier** — the only vessels tracked individually, by name (e.g. *Hand of Gorb*).
  A fleet's roster is a list of carriers. Drag a carrier onto another fleet's marker
  to transfer it, hangar and all.
- **Squadron** — the craft a carrier flies, tracked in bulk rather than by name: a
  **count** and a **model**, e.g. `24 × v1_fighters`, `13 × b4_bombers`. Each carrier's
  hangar holds as many squadrons as you like.

A carrier also has an optional **class** (its design, e.g. `Gorb-class Carrier`) —
what sister ships share and what the [ship art](#ship-art) library matches on.

Model names are free text — invent whatever your setting uses. Once a model is
used anywhere in the sector it's offered as an autocomplete suggestion on every
other squadron's model field, so `v1_fighters` doesn't quietly become
`v1_fighter` on the other side of the map.

The number badge on a fleet marker counts its **carriers**; hover the marker for
the full picture (`Vega Reserve · 3 carriers · 37 craft`).

### Where to edit a fleet

Two places, for two jobs:

- **The map** — click a fleet marker for its roster popup. Best for quick edits in
  context, and the only place to rename a fleet, change its affiliation, disband it,
  or drag a carrier to another fleet.
- **The Fleets tab** — the full roster with room to breathe: carriers stacked down a
  scrolling column, each carrier's hangar laid out to its right. Pick a fleet from the
  **Fleet** dropdown; use the **Compare** dropdown to pin a second fleet beside it and
  read the two side by side. On a phone the two stack vertically instead.

  The GM can do everything here that the popup's roster does — rename carriers, add and
  remove them, and edit squadrons. Players and anonymous viewers get the same view,
  read-only. "Open in Fleet view" on the map popup jumps straight here.

Fleets no longer link to codex entries — the Fleets tab replaced that. Systems,
factions, characters and organizations still link to the codex as before.

## Ship art

Upload SVG drawings of your ships and they appear beside carriers and squadrons
in both the Fleets tab and the map's fleet popup.

Art is matched to ships **by name**, so one upload serves the whole sector:

1. In the **Fleets** tab, open **SHIP ART** and click **Upload SVG** (GM only).
   You can select several files at once.
2. Name each entry to match a model — e.g. `Flooba mk3 Fighters`, or a carrier
   class like `Gorb-class Carrier`. The name field autocompletes from the models
   already in use, and an entry that matches nothing is flagged **"matches no ship
   yet"** so a typo doesn't just silently show no picture. Matching ignores case
   and surrounding spaces.
3. Give each carrier a **class** (in either the Fleets tab or the map popup) and
   every sister ship of that class picks up the same drawing. Squadrons match on
   the model name they already have.

Art is stored under its own Firebase key (`sectors/<name>/galaxy-sector-art:v1`),
separate from the sector itself — the sector blob is rewritten on every keystroke,
and artwork shouldn't be re-uploaded with it. No extra Firebase setup is needed:
the rules in step 5 above already cover the whole `sectors/<name>` path.

Files must be `.svg` and under 128KB. SVGs containing a `<script>` tag are rejected.

> ⚠️ **Why art renders as an `<img>`.** Uploaded SVG is displayed via
> `<img src="data:image/svg+xml,…">`, never inlined into the page. An `<img>` cannot
> execute scripts or load external resources from the SVG — which matters, because
> the database is world-writable and anyone who finds it can add art. The cost is
> that art can't be recoloured per-faction via CSS, so put your colours in the file.
> Don't switch this to an inline `<svg>` or `dangerouslySetInnerHTML` without real
> sanitizing: it would become a stored-XSS hole against every visitor.

## Asymmetric-information play (player roles & visibility)

Built for running games where each player only knows what their character
knows. The single "edit code" is now the **GM code**:

1. Open the **ACCESS** badge (top-right) and set a GM code. You are now the GM —
   you edit everything and see everything.
2. Still in ACCESS, add a **player role** for each player (a name + a login code).
   Give each player their own code.
3. On any **codex entry** (Codex tab) or any **carrier** (click a fleet on the map),
   use the **Visible to** control to choose who can see it:
   - **Everyone** — public; anyone with the link sees it (the default).
   - one or more **players** — only those players (and you) see it.
   - **no players selected** — GM only; hidden from every player.

How each visitor sees the map:

| Who | How they get in | What they see | Can edit? |
|-----|-----------------|---------------|-----------|
| **GM** | knows the GM code | everything | yes |
| **Player** | knows their role's code | public content + whatever is shared with their role | no |
| **Anonymous** | just the link, no code | public content only | no |

Visibility is set per carrier, and a carrier's hangar follows it — hide a carrier
from a player and its squadrons go with it. Hiding *every* carrier in a fleet from
a player also hides that fleet's marker from them, so you can keep a whole task
force secret by restricting its carriers.

Players sign in from the same ACCESS badge (their code or the GM code both work
there) and can sign out to drop back to the anonymous, public-only view. Roles
and visibility save with the sector, so they survive reloads.

> ⚠️ Like the edit lock, this is a **casual** control, not real security. The
> underlying sector data — including hidden entries and carriers — still lives in a
> world-readable Firebase path, so anyone technical who opens the database can
> read it. It keeps honest players in character; it is not a secret-keeper against
> a determined one. For true secrecy, don't put it in the map.

## Linking to a page

Every page has its own URL, so the Back button works and you can paste a link to
exactly what you're looking at:

| URL | Where it opens |
|-----|----------------|
| `#/map` | the sector map |
| `#/fleet` | the Fleets tab |
| `#/fleet/flt_res` | that fleet's roster |
| `#/fleet/flt_res/vs/flt_3rd` | that roster with a second fleet pinned beside it |
| `#/politics` | the faction politics view |
| `#/codex` | the codex |
| `#/codex/lore` | a codex category |
| `#/codex/lore/wk_193_iltz` | a single codex entry |

e.g. `https://your-map.netlify.app/#/codex/lore/wk_193_iltz`. The ids are the
ones in the URL bar — open the thing you want to link to and copy the address.

A link only shows what its reader is allowed to see: send a player a link to a
GM-only entry and they get the codex, not the entry (see
[asymmetric-information play](#asymmetric-information-play-player-roles--visibility)).

Map popups are deliberately *not* in the URL — clicking systems and fleets on the
map would otherwise fill the Back button with a click-by-click history.

Routes live after a `#` rather than as real paths (`/codex/lore/...`) so that a
deep link works on any static host, at any host path, with no SPA rewrite rule to
configure — the same reason the build uses relative asset paths. See the comment
at the top of `src/lib/routing.js`.

## Multiple maps from one deployment

Add `?sector=<name>` to the URL to get an independent map backed by its own
Firebase path (`sectors/<name>/...`) — e.g. `https://your-map.netlify.app/?sector=campaign-two`.
Useful if you run several campaigns and don't want to redeploy per-campaign.

It combines with the page links above — the sector goes before the `#`:
`https://your-map.netlify.app/?sector=campaign-two#/codex/lore/wk_193_iltz`.

## Notes

- The in-app GM code / player codes (the ACCESS badge, top-right) are a casual
  deterrent, not real security — anyone who knows a code (or reads it from
  Firebase) gets that access. Good enough for "don't let randoms who found the
  link mess with the map" and for keeping honest players in character, not for
  anything genuinely sensitive. See the visibility section above for the details.
- Personal data (which code *your* browser has entered) is stored in
  `localStorage` and never touches Firebase.
