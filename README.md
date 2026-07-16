# Sector Cartographer

A self-hosted, collaborative sci-fi sector map for tabletop and play-by-post
campaigns. One deployment gives your table a single shared map that everyone
sees live — and, because each player can be given their own login code, each
player sees only what their character is supposed to know.

It's a React single-page app with no server of its own. All shared state lives in
a Firebase Realtime Database you own, and the build is a static `dist/` folder you
can drop on any host or embed in a page you already have.

## What's in it

Five views, switched from the toolbar and each with its own URL:

- **Map** — the sector itself. Place star systems, connect them with hyperlanes,
  drop fleet markers, and draw freehand over the top for borders and staging
  arrows. Pan, zoom, and drag anything; below 25% zoom systems collapse to plain
  markers so a large sector stays readable.
- **Fleets** — who commands what. A fleet's carriers, each carrier's hangar of
  squadrons, and a compare mode for reading two fleets side by side. Also home to
  the ship art library. See [Fleets, carriers & squadrons](#fleets-carriers--squadrons).
- **Politics** — factions as nodes, their relationships as edges (alliance, trade
  pact, neutral, rivalry, war). Zoom into a faction to open up the characters and
  organizations inside it.
- **Codex** — the setting wiki: factions, characters, locations, lore, rules and
  misc. Entries are plain text, cross-link to each other, and support
  [CSV tables](#tables-in-codex-entries) for rosters and stat blocks.
- **Odds** — a standalone 2d6 mission-resolution table for settling an engagement
  at the table. See [Mission odds](#mission-odds).

Editing is gated by a **GM code**, and content can be revealed per player — see
[asymmetric-information play](#asymmetric-information-play-player-roles--visibility).
Anyone with the link gets a read-only public view with no code at all.

## Setup

### Prerequisites

- [Node.js](https://nodejs.org) v18 or newer
- A Google account, for the free-tier Firebase project the map saves into

### 1. Create a Firebase project

Shared data — systems, fleets, codex entries, drawings, access codes — lives in a
Firebase Realtime Database so every visitor sees the same map.

1. At https://console.firebase.google.com, create a project. The free Spark tier
   is plenty for a campaign.
2. **Build > Realtime Database > Create Database**. Pick a location and start in
   **test mode**; step 3 replaces the rules.
3. Still in Realtime Database, open the **Rules** tab and use:
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
   This scopes access to the `sectors/` path and leaves it open to anyone with the
   link, which matches the app's own casual edit-code lock. If you want real
   auth-gated writes instead, that means adding Firebase Auth — out of scope here,
   but these rules are where it would go.
4. **Project settings > General > Your apps**, click the **`</>`** (web) icon to
   register a web app, and copy the `firebaseConfig` values it shows you.

### 2. Configure and run

```sh
git clone <your-fork-url>
cd sector-cartographer
npm install
cp .env.example .env.local   # then paste in your firebaseConfig values
npm run dev
```

`.env.local` holds the `VITE_FIREBASE_*` variables from step 1.4. It is
gitignored — the values are per-deployment, not per-repo.

Open the printed `localhost` URL and you'll get an empty sector. Edits save to
your Firebase project within ~600ms; the indicator top-right shows SAVED.

### 3. Deploy

```sh
npm run build
```

That produces a static `dist/` folder — plain HTML, CSS and JS, no server
required — deployable to any static host (Firebase Hosting, Netlify, Vercel,
GitHub Pages, S3, or a directory on a box you already run).

The one thing to get right: **Vite inlines env vars at build time**, not at run
time. If your host builds from git, set the `VITE_FIREBASE_*` variables in that
host's environment-variables settings, or the deployed app will have no database
to talk to. If you build locally and upload `dist/`, your `.env.local` is already
baked in.

This repo ships a `firebase.json`, so Firebase Hosting works out of the box:

```sh
npx firebase-tools login
npx firebase-tools use --add     # select your own project
npx firebase-tools deploy --only hosting
```

Nothing depends on Firebase Hosting specifically — it's just the shortest path
when you already made a Firebase project in step 1.

### 4. Embedding it elsewhere (optional)

The app is fine to iframe into a site you already have (Google Sites, Notion,
WordPress, a static page of your own):

```html
<iframe src="https://your-deployed-url" style="border:0" width="100%" height="700"></iframe>
```

Give it room — it's responsive down to phone widths, but a map wants most of the
page width and 600px+ of height. Embeds are why `vite.config.js` sets
`base: "./"`: relative asset URLs work no matter what host path serves the app.

## Project layout

```
src/
  theme.js            colors, panel/input styles, the chamfered-panel clip-path
  constants.js         zoom limits, wiki categories, marker icon set, storage keys
  lib/firebase.js       Firebase app/init (reads config from env vars)
  lib/storage.js        get/set/delete adapter — shared data -> Firebase, personal -> localStorage
  lib/carriers.js       fleet composition — squadron counts, craft totals, model autocomplete
  lib/shipArt.js        the SVG ship-art library — name matching, upload validation, safety notes
  lib/visibility.js     who may see a given entry or carrier — see "Asymmetric-information play"
  lib/routing.js        which page a URL means, and vice versa — see "Linking to a page"
  lib/codexBody.js      codex body text -> prose + ```csv table segments — see "Tables in codex entries"
  lib/missionOdds.js    the mission odds table — E, success grades, casualties — see "Mission odds"
  hooks/useMapInteractions.js       pan/zoom/drag/draw — all the map's DOM/pointer/canvas logic
  hooks/usePoliticsInteractions.js  the same, for the politics graph
  hooks/useResponsive.js            mobile breakpoint tracking
  hooks/useHashRoute.js             the current page, read from and written to the URL hash
  components/            one file per UI piece (Toolbar, SidePanel, FleetView, WikiView, popups, ui/*)
  App.jsx                 top-level state + composition
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

## Mission odds

The **Odds** tab is a dice reference for resolving an engagement. It is
deliberately **not wired to the sector**: no fleet, carrier or squadron feeds it,
nothing it computes is saved, and bouncing to another tab and back resets it. You
type the numbers in and read the result off, the way you would with a table in a
rulebook — which is what lets it resolve the things the map doesn't model
(a boarding action, a ground assault, a raid on something that isn't a fleet).

Everything reduces to one number, **E**:

```
E = 2d6 + force-ratio shift + the relevant mission shift
```

E maps to a **success grade** (0–5) and to a **casualty percentage**. Outcome and
casualties take *separate* mission shifts and so get separate Es — which is how a
battle gets won badly, or lost cheaply.

- **Your vessels / Enemy vessels** — type both and the **Force ratio** column snaps
  to the nearest match. The snap is by ratio, not by difference, so 2:1 sits the
  same distance from 1:1 as 1:2 does. A line under the controls shows what it
  picked, and warns when the two forces are further apart than the table's end
  columns can express.
- **Force ratio** — or just pick the column yourself and ignore the vessel counts.
  Picking by hand overrides the snap (the line says so); you rarely have a
  headcount for an orbital bombardment, but you always have one for a fleet action.
- **Outcome shift / Casualty shift** — whatever the mission is worth, −12 to +12.
- **2d6 roll** — type the dice you rolled, or hit **Roll 2d6** to have it rolled for you.

The readout answers the question; the table below is the whole grid, with your
current row and column picked out. Grade colour runs worst → best, but it's only a
scan aid: every cell prints its grade and casualty figure, so nothing is carried by
colour alone.

## Tables in codex entries

A codex entry's body is plain text, with one exception: a fenced **```csv** block
renders as a real table. Rosters and stat blocks stay readable instead of turning
into hand-spaced columns that break the first time a name gets longer.

````
Crew figures are nominal complement, not current muster.

```csv Capital Roster
Ship,Class,Crew,Status
Hand of Gorb,Flagship,"2,400",Active
Vellum Sigh,Cruiser,880,Refit
```
````

- Anything after `csv` on the opening line becomes the **caption** (optional).
- The **first row is the header**.
- Columns whose values are all numbers are **right-aligned** automatically.
- Wrap a field in double quotes to keep a comma inside it (`"2,400"`), and double
  the quote (`""`) for a literal one — the same rules Sheets and Excel export, so
  a table copied out of a spreadsheet pastes in and just works.
- Rows may be ragged; short ones are padded out.
- Text outside a block is never touched — a comma in prose stays prose.

Since the GM edits in a plain textarea, use **Preview** (above the body) to see
the entry as players will read it, and **Insert table** to drop in a starter block
at the cursor. A wide table scrolls inside its own box rather than stretching the
entry — worth a preview check on a phone-width screen.

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
the database rules in [setup](#1-create-a-firebase-project) already cover the whole
`sectors/<name>` path.

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
| `#/odds` | the mission odds table |

e.g. `https://your-deployed-url/#/codex/lore/wk_193_iltz`. The ids are the
ones in the URL bar — open the thing you want to link to and copy the address.

A link only shows what its reader is allowed to see: send a player a link to a
GM-only entry and they get the codex, not the entry (see
[asymmetric-information play](#asymmetric-information-play-player-roles--visibility)).

Map popups are deliberately *not* in the URL — clicking systems and fleets on the
map would otherwise fill the Back button with a click-by-click history. The odds
tool's inputs stay out for the same reason: `#/odds` links to the tool, not to a
particular calculation, and putting every keystroke in the hash would make Back
useless.

Routes live after a `#` rather than as real paths (`/codex/lore/...`) so that a
deep link works on any static host, at any host path, with no SPA rewrite rule to
configure — the same reason the build uses relative asset paths. See the comment
at the top of `src/lib/routing.js`.

## Multiple maps from one deployment

Add `?sector=<name>` to the URL to get an independent map backed by its own
Firebase path (`sectors/<name>/...`) — e.g. `https://your-deployed-url/?sector=campaign-two`.
Useful if you run several campaigns and don't want to redeploy per-campaign.

It combines with the page links above — the sector goes before the `#`:
`https://your-deployed-url/?sector=campaign-two#/codex/lore/wk_193_iltz`.

## Notes

- The in-app GM code / player codes (the ACCESS badge, top-right) are a casual
  deterrent, not real security — anyone who knows a code (or reads it from
  Firebase) gets that access. Good enough for "don't let randoms who found the
  link mess with the map" and for keeping honest players in character, not for
  anything genuinely sensitive. See the visibility section above for the details.
- Personal data (which code *your* browser has entered) is stored in
  `localStorage` and never touches Firebase.
