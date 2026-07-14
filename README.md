# Sector Cartographer

A self-hosted, collaborative sci-fi sector map: star systems, fleets, hyperlanes,
freehand drawing, and a setting wiki/codex — with per-player roles for running
asymmetric-information games (see below). Originally a single-file Claude
artifact; this is the same app split into a normal React project with a real
shared backend (Firebase Realtime Database) so it can be deployed anywhere and
embedded in a Google Sites page.

## Project layout

```
src/
  theme.js            colors, panel/input styles, the chamfered-panel clip-path
  constants.js         zoom limits, wiki categories, marker icon set, storage keys
  data/seed.js          the demo sector loaded the first time there's no saved data
  lib/firebase.js       Firebase app/init (reads config from env vars)
  lib/storage.js        get/set/delete adapter — shared data -> Firebase, personal -> localStorage
  hooks/useMapInteractions.js   pan/zoom/drag/draw — all the map's DOM/pointer/canvas logic
  hooks/useResponsive.js        mobile breakpoint tracking
  components/            one file per UI piece (Toolbar, SidePanel, WikiView, popups, ui/*)
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

Open the printed `localhost` URL. You should see the demo sector; edits save
to your Firebase project within ~600ms (see the SAVED indicator top-right).

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

## Asymmetric-information play (player roles & visibility)

Built for running games where each player only knows what their character
knows. The single "edit code" is now the **GM code**:

1. Open the **ACCESS** badge (top-right) and set a GM code. You are now the GM —
   you edit everything and see everything.
2. Still in ACCESS, add a **player role** for each player (a name + a login code).
   Give each player their own code.
3. On any **codex entry** (Codex tab) or any **ship** (click a fleet on the map),
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

Hiding *every* ship in a fleet from a player also hides that fleet's marker from
them, so you can keep a whole task force secret by restricting its ships.

Players sign in from the same ACCESS badge (their code or the GM code both work
there) and can sign out to drop back to the anonymous, public-only view. Roles
and visibility save with the sector, so they survive reloads and a **Reset
sector** leaves your player roles intact.

> ⚠️ Like the edit lock, this is a **casual** control, not real security. The
> underlying sector data — including hidden entries and ships — still lives in a
> world-readable Firebase path, so anyone technical who opens the database can
> read it. It keeps honest players in character; it is not a secret-keeper against
> a determined one. For true secrecy, don't put it in the map.

## Multiple maps from one deployment

Add `?sector=<name>` to the URL to get an independent map backed by its own
Firebase path (`sectors/<name>/...`) — e.g. `https://your-map.netlify.app/?sector=campaign-two`.
Useful if you run several campaigns and don't want to redeploy per-campaign.

## Notes

- The in-app GM code / player codes (the ACCESS badge, top-right) are a casual
  deterrent, not real security — anyone who knows a code (or reads it from
  Firebase) gets that access. Good enough for "don't let randoms who found the
  link mess with the map" and for keeping honest players in character, not for
  anything genuinely sensitive. See the visibility section above for the details.
- Personal data (which code *your* browser has entered) is stored in
  `localStorage` and never touches Firebase.
