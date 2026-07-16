import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapIcon, Library, Satellite, Network, Ship, Dices } from "lucide-react";
import { T, panelStyle, cut } from "./theme.js";
import { KNOWN_CODE_KEY, ROLE_COLORS, DEFAULT_SQUADRON_SIZE } from "./constants.js";
import { storage } from "./lib/storage.js";
import { loadSector, saveSector, emptySector } from "./lib/sectorRepo.js";
import { buildSectorUpdates } from "./lib/sectorSchema.js";
import { resolveViewer, canSee } from "./lib/visibility.js";
import { craftInCarrier, withSquadrons } from "./lib/carriers.js";
import { uid } from "./utils/id.js";
import { useResponsive } from "./hooks/useResponsive.js";
import { useMapInteractions } from "./hooks/useMapInteractions.js";
import { useHashRoute } from "./hooks/useHashRoute.js";
import Btn from "./components/ui/Btn.jsx";
import AccessControl from "./components/AccessControl.jsx";
import Toolbar, { SaveStatus } from "./components/Toolbar.jsx";
import MobileToolbar from "./components/MobileToolbar.jsx";
import SidePanel from "./components/SidePanel.jsx";
import MapCanvas from "./components/MapCanvas.jsx";
import FleetView from "./components/FleetView.jsx";
import WikiView from "./components/WikiView.jsx";
import PoliticsView from "./components/PoliticsView.jsx";
import OddsView from "./components/OddsView.jsx";

export default function GalaxySectorMap() {
  // Empty until the saved sector loads from storage; the loading gate below keeps
  // the UI hidden until then, so these never render as a bare demo.
  const [factions, setFactions] = useState([]);
  const [relations, setRelations] = useState([]);
  const [layers, setLayers] = useState([]);
  const [systems, setSystems] = useState([]);
  const [links, setLinks] = useState([]);
  const [fleets, setFleets] = useState([]);
  const [wiki, setWiki] = useState([]);
  const [roles, setRoles] = useState([]); // player roles for asymmetric-info games
  const [art, setArt] = useState([]);     // ship-art library

  const [mode, setMode] = useState("select"); // select | link | draw
  const [view, setView] = useState({ scale: 1, ox: 60, oy: 40 });
  const [strokes, setStrokes] = useState([]);

  const [selSystem, setSelSystem] = useState(null);
  const [selFleet, setSelFleet] = useState(null);
  const [linkSource, setLinkSource] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error

  const [lockCode, setLockCode] = useState("");   // shared: "" means editing is open to everyone; else the GM code
  const [knownCode, setKnownCode] = useState(""); // personal: the GM/player code this browser has entered
  const [accessOpen, setAccessOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");

  // Who is looking: GM (admin), a player role, an anonymous viewer, or legacy open mode.
  const viewer = useMemo(() => resolveViewer(knownCode, lockCode, roles), [knownCode, lockCode, roles]);
  const canEdit = viewer.seesAll; // GM and open mode edit; players & anon are view-only

  const isMobile = useResponsive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* ------------------------------------------------ which page we're on — lives in the URL, not in state.
     See lib/routing.js: the tab, the codex category + open entry, and the fleet
     being read (plus any fleet pinned beside it to compare) are all in the hash,
     so pages are shareable and Back works. */
  const [route, navigate] = useHashRoute();
  const { tab: activeTab, cat: activeCat, wikiId: selectedWikiId,
    fleetId: fleetPrimaryId, compareId: fleetCompareId } = route;

  // Setters keeping the useState signature (a value or an updater) that the
  // views below already call them with, so only their plumbing changed.
  const fromSetter = (v, cur) => (typeof v === "function" ? v(cur) : v);
  const setActiveTab = (v) => navigate((r) => ({ tab: fromSetter(v, r.tab) }));
  // Changing category drops the open entry — it belongs to the category you left.
  const setActiveCat = (v) => navigate((r) => ({ cat: fromSetter(v, r.cat), wikiId: null }));
  const setSelectedWikiId = (v, opts) => navigate((r) => ({ wikiId: fromSetter(v, r.wikiId) }), opts);
  const setFleetPrimaryId = (v) => navigate((r) => {
    const fleetId = fromSetter(v, r.fleetId);
    return { fleetId, compareId: r.compareId === fleetId ? null : r.compareId }; // never compare a fleet with itself
  });
  const setFleetCompareId = (v) => navigate((r) => ({ compareId: fromSetter(v, r.compareId) }));

  useEffect(() => { if (isMobile) setPanelOpen(false); }, [isMobile]); // avoid opening full-screen on first mobile load

  // Everything that lives in the shared sector, in one object: what gets saved,
  // and what the last save is diffed against. The lock code is in here too — it
  // is shared state like any other, and giving it a write path of its own is how
  // it once got left behind by a migration, silently unlocking the sector.
  const sector = useMemo(
    () => ({ factions, relations, layers, systems, links, fleets, strokes, wiki, roles, art, lockCode }),
    [factions, relations, layers, systems, links, fleets, strokes, wiki, roles, art, lockCode],
  );
  // The sector as the database currently has it. Null until the load below fills
  // it in, which is also what stops an autosave from firing against an empty
  // sector before the real one has arrived and wiping it.
  const savedRef = useRef(null);

  /* ------------------------------------------------ load saved sector on open */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, schema } = await loadSector();
        if (!cancelled) {
          setFactions(data.factions); setRelations(data.relations); setLayers(data.layers);
          setSystems(data.systems); setLinks(data.links); setFleets(data.fleets);
          setStrokes(data.strokes); setWiki(data.wiki); setRoles(data.roles); setArt(data.art);
          setLockCode(data.lockCode);
          // Diffing against what was loaded means opening a sector writes nothing.
          // Except on a sector still in the v1 layout: diffing against an empty
          // one makes the first edit write the whole tree, migrating it in place
          // for anyone who never ran scripts/migrate-v2.mjs.
          savedRef.current = schema === 1 ? emptySector() : data;
        }
      } catch (e) {
        // Storage unavailable, or Firebase not configured — keep the empty sector.
        // savedRef stays null, so autosave holds off rather than writing this
        // empty sector over the real one. Say so: edits will not be saved, and
        // that has to be visible rather than looking like an idle, saved map.
        console.warn("[sector] could not load the sector", e);
        if (!cancelled) setSaveStatus("error");
      }
      try {
        const res = storage.get(KNOWN_CODE_KEY); // personal: what this user knows
        if (!cancelled && res && typeof res.value === "string") setKnownCode(res.value);
      } catch (e) {
        // this browser/account has never entered a code
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  /* ------------------------------------------------ debounced autosave (editors only).
     One save for the whole sector, but only the entities that actually changed
     get written — see lib/sectorSchema.js buildSectorUpdates. That's what lets
     art and game state share a save without art's SVGs riding along on every
     keystroke, which under the old one-blob-per-key layout they had to. */
  useEffect(() => {
    if (!loaded || !canEdit || !savedRef.current) return; // viewers never write to shared storage
    // Nothing changed (a re-render, or the load settling) — stay quiet rather
    // than flashing the save indicator at an idle sector.
    if (!Object.keys(buildSectorUpdates(savedRef.current, sector)).length) return;
    setSaveStatus("saving");
    const t = setTimeout(async () => {
      const prev = savedRef.current;
      try {
        const ok = await saveSector(prev, sector);
        // Only once the write lands: if it throws, the next save still diffs
        // against what the database really has and retries the whole change.
        if (ok) savedRef.current = sector;
        setSaveStatus(ok ? "saved" : "error");
      } catch (e) {
        setSaveStatus("error");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [sector, loaded, canEdit]);

  /* ------------------------------------------------ edit-lock management (frontend-only gate, not real security).
     The code is part of the sector snapshot, so the autosave above persists it
     like any other change — there is no separate write to forget. */
  function setNewLockCode(code) {
    if (!canEdit) return;
    const trimmed = code.trim();
    if (!trimmed) return;
    setLockCode(trimmed);
    try { storage.set(KNOWN_CODE_KEY, trimmed); } catch (e) { /* ignore */ }
    setKnownCode(trimmed);
    setCodeInput(""); setCodeError("");
  }
  function removeLockCode() {
    if (!canEdit) return;
    setLockCode("");
    setCodeInput(""); setCodeError("");
  }
  // Accepts either the GM code or any player role's code.
  async function tryUnlock(code) {
    const trimmed = code.trim();
    const matchesGM = trimmed && trimmed === lockCode;
    const matchesRole = trimmed && roles.some((r) => r.password && r.password === trimmed);
    if (matchesGM || matchesRole) {
      try { storage.set(KNOWN_CODE_KEY, trimmed); } catch (e) { /* ignore */ }
      setKnownCode(trimmed);
      setCodeInput(""); setCodeError(""); setAccessOpen(false);
    } else {
      setCodeError("Incorrect code");
    }
  }
  async function signOut() {
    try { storage.set(KNOWN_CODE_KEY, ""); } catch (e) { /* ignore */ }
    setKnownCode(""); setCodeInput(""); setCodeError("");
  }

  /* ------------------------------------------------ player roles (GM-managed logins for asymmetric info) */
  function addRole() {
    if (!canEdit) return;
    const color = ROLE_COLORS[roles.length % ROLE_COLORS.length];
    setRoles((rs) => [...rs, { id: uid("role"), name: "New Player", password: "", color }]);
  }
  function patchRole(id, p) { if (canEdit) setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r))); }
  function removeRole(id) {
    if (!canEdit) return;
    setRoles((rs) => rs.filter((r) => r.id !== id));
    // scrub the deleted role from every visibility list so nothing dangles
    const scrub = (vis) => (Array.isArray(vis) ? vis.filter((rid) => rid !== id) : vis);
    setWiki((w) => w.map((e) => (Array.isArray(e.visibility) ? { ...e, visibility: scrub(e.visibility) } : e)));
    setFleets((fs) => fs.map((f) => ({
      ...f, ships: f.ships.map((sh) => (Array.isArray(sh.visibility) ? { ...sh, visibility: scrub(sh.visibility) } : sh)),
    })));
  }

  const factionById = (id) => factions.find((f) => f.id === id) || factions[factions.length - 1];
  const layerById = (id) => layers.find((l) => l.id === id);
  const w2s = (x, y) => ({ x: x * view.scale + view.ox, y: y * view.scale + view.oy });

  /* ------------------------------------------------ CRUD (all guarded — viewers cannot mutate shared data) */
  function addSystemAt(wx, wy) {
    if (!canEdit) return;
    const id = uid("sys");
    setSystems((ss) => [...ss, { id, name: "New System", x: wx, y: wy, factionId: "fac_none", markers: [] }]);
    setMode("select"); setSelFleet(null); setSelSystem(id);
  }
  function addSystemCenter() {
    if (!canEdit) return;
    const wx = (mapInt.containerSize.w / 2 - view.ox) / view.scale + (Math.random() * 40 - 20);
    const wy = (mapInt.containerSize.h / 2 - view.oy) / view.scale + (Math.random() * 40 - 20);
    addSystemAt(wx, wy);
  }
  function addFleetCenter() {
    if (!canEdit) return;
    const wx = (mapInt.containerSize.w / 2 - view.ox) / view.scale + (Math.random() * 40 - 20);
    const wy = (mapInt.containerSize.h / 2 - view.oy) / view.scale + (Math.random() * 40 - 20);
    const id = uid("flt");
    setFleets((fs) => [...fs, { id, name: "New Fleet", factionId: factions[0].id, systemId: null, x: wx, y: wy, ships: [] }]);
    setMode("select"); setSelSystem(null); setSelFleet(id);
  }
  function deployFleetAt(sysId) {
    if (!canEdit) return;
    const sys = systems.find((s) => s.id === sysId);
    const id = uid("flt");
    setFleets((fs) => [...fs, { id, name: "New Fleet", factionId: sys.factionId, systemId: sysId, x: sys.x, y: sys.y, ships: [] }]);
    setSelSystem(null); setSelFleet(id);
  }
  function deleteSystem(id) {
    if (!canEdit) return;
    const sys = systems.find((s) => s.id === id);
    setFleets((fs) => fs.map((f) => (f.systemId === id ? { ...f, systemId: null, x: sys.x + 40, y: sys.y + 40 } : f)));
    setLinks((ls) => ls.filter((l) => l.a !== id && l.b !== id));
    setSystems((ss) => ss.filter((s) => s.id !== id));
    setSelSystem(null);
  }
  function deleteFleet(id) { if (!canEdit) return; setFleets((fs) => fs.filter((f) => f.id !== id)); setSelFleet(null); }
  const patchSystem = (id, p) => { if (canEdit) setSystems((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s))); };
  const patchFleet = (id, p) => { if (canEdit) setFleets((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f))); };

  function addMarker(sysId, layerId) {
    if (!canEdit) return;
    const lay = layerById(layerId) || layers[0];
    const mk = { id: uid("mk"), layerId: lay.id, iconKey: "Gem", label: "New" };
    setSystems((ss) => ss.map((s) => (s.id === sysId ? { ...s, markers: [...s.markers, mk] } : s)));
  }
  function patchMarker(sysId, mkId, p) {
    if (!canEdit) return;
    setSystems((ss) => ss.map((s) => s.id === sysId
      ? { ...s, markers: s.markers.map((m) => (m.id === mkId ? { ...m, ...p } : m)) } : s));
  }
  function removeMarker(sysId, mkId) {
    if (!canEdit) return;
    setSystems((ss) => ss.map((s) => s.id === sysId ? { ...s, markers: s.markers.filter((m) => m.id !== mkId) } : s));
  }
  function addShip(fleetId) {
    if (!canEdit) return;
    const ship = { id: uid("shp"), name: "New Carrier", squadrons: [] };
    setFleets((fs) => fs.map((f) => (f.id === fleetId ? { ...f, ships: [...f.ships, ship] } : f)));
  }
  function patchShip(fleetId, shipId, p) {
    if (!canEdit) return;
    setFleets((fs) => fs.map((f) => f.id === fleetId
      ? { ...f, ships: f.ships.map((s) => (s.id === shipId ? { ...s, ...p } : s)) } : f));
  }
  function removeShip(fleetId, shipId) {
    if (!canEdit) return;
    setFleets((fs) => fs.map((f) => f.id === fleetId ? { ...f, ships: f.ships.filter((s) => s.id !== shipId) } : f));
  }
  function moveShip(fromId, toId, shipId) {
    if (!canEdit || fromId === toId) return;
    setFleets((fs) => {
      let ship = null;
      const stripped = fs.map((f) => {
        if (f.id === fromId) { ship = f.ships.find((s) => s.id === shipId); return { ...f, ships: f.ships.filter((s) => s.id !== shipId) }; }
        return f;
      });
      if (!ship) return fs;
      return stripped.map((f) => (f.id === toId ? { ...f, ships: [...f.ships, ship] } : f));
    });
  }

  /* ---- squadrons (the craft in a carrier's hangar: a count of one model) ---- */
  function updateSquadrons(fleetId, shipId, fn) {
    if (!canEdit) return;
    setFleets((fs) => withSquadrons(fs, fleetId, shipId, fn));
  }
  function addSquadron(fleetId, shipId) {
    updateSquadrons(fleetId, shipId, (qs) => [...qs, { id: uid("sqn"), count: DEFAULT_SQUADRON_SIZE, model: "" }]);
  }
  function patchSquadron(fleetId, shipId, sqId, p) {
    updateSquadrons(fleetId, shipId, (qs) => qs.map((q) => (q.id === sqId ? { ...q, ...p } : q)));
  }
  function removeSquadron(fleetId, shipId, sqId) {
    updateSquadrons(fleetId, shipId, (qs) => qs.filter((q) => q.id !== sqId));
  }

  /* ---- ship art (SVG drawings matched to carriers/squadrons by model name) ---- */
  function addArt(name, svg) {
    if (!canEdit) return;
    setArt((as) => [...as, { id: uid("art"), name, svg }]);
  }
  function patchArt(id, p) { if (canEdit) setArt((as) => as.map((a) => (a.id === id ? { ...a, ...p } : a))); }
  function removeArt(id) { if (!canEdit) return; setArt((as) => as.filter((a) => a.id !== id)); }
  function addFaction() {
    if (!canEdit) return;
    const palette = ["#a06840", "#5f9098", "#8a9a4a", "#b3763e", "#6b6a9e", "#9a7a2e"];
    const c = palette[factions.length % palette.length];
    setFactions((fx) => [...fx, { id: uid("fac"), name: "New Faction", color: c,
      px: Math.random() * 180 - 90, py: Math.random() * 180 - 90, wikiId: null, members: [] }]);
  }
  function patchFaction(id, p) { if (canEdit) setFactions((fx) => fx.map((f) => (f.id === id ? { ...f, ...p } : f))); }
  function deleteFaction(id) {
    if (!canEdit) return;
    if (factions.length <= 1) return;
    const fallback = factions.find((f) => f.id !== id).id;
    setSystems((ss) => ss.map((s) => (s.factionId === id ? { ...s, factionId: fallback } : s)));
    setFleets((fs) => fs.map((f) => (f.factionId === id ? { ...f, factionId: fallback } : f)));
    setRelations((rs) => rs.filter((r) => r.a !== id && r.b !== id));
    setFactions((fx) => fx.filter((f) => f.id !== id));
  }

  /* ---- faction members (the character/organization subnode cloud) ---- */
  function addMember(facId, kind = "character") {
    if (!canEdit) return;
    const m = { id: uid("mem"), name: kind === "org" ? "New Organization" : "New Character", kind, role: "", wikiId: null };
    setFactions((fx) => fx.map((f) => (f.id === facId ? { ...f, members: [...(f.members || []), m] } : f)));
  }
  function patchMember(facId, memId, p) {
    if (!canEdit) return;
    setFactions((fx) => fx.map((f) => f.id === facId
      ? { ...f, members: (f.members || []).map((m) => (m.id === memId ? { ...m, ...p } : m)) } : f));
  }
  function removeMember(facId, memId) {
    if (!canEdit) return;
    setFactions((fx) => fx.map((f) => f.id === facId
      ? { ...f, members: (f.members || []).filter((m) => m.id !== memId) } : f));
  }

  /* ---- faction relationship edges (upsert; "none" removes the edge) ---- */
  function setRelation(a, b, type) {
    if (!canEdit || a === b) return;
    setRelations((rs) => {
      const rest = rs.filter((r) => !((r.a === a && r.b === b) || (r.a === b && r.b === a)));
      if (!type || type === "none") return rest;
      return [...rest, { id: uid("rel"), a, b, type }];
    });
  }
  function addLayer() {
    if (!canEdit) return;
    setLayers((ls) => [...ls, { id: uid("lay"), name: "New Layer", color: "#8c8672", visible: true }]);
  }
  function patchLayer(id, p) { if (canEdit) setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l))); }
  const toggleLayer = (id) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));

  function addWikiEntry(category) {
    if (!canEdit) return;
    const entry = { id: uid("wk"), category, title: "New Entry", body: "" };
    setWiki((w) => [...w, entry]);
    setSelectedWikiId(entry.id);
  }
  // create an entry and return its id — used by codex links to spin up a page
  // pre-titled from the element (system, faction, character…) being linked.
  function createEntry(category, title) {
    if (!canEdit) return null;
    const entry = { id: uid("wk"), category, title: title || "New Entry", body: "" };
    setWiki((w) => [...w, entry]);
    return entry.id;
  }
  // jump from a fleet's map marker straight to its full roster in the Fleet tab.
  // One navigate() per jump, not one per field — the whole jump is a single Back.
  function goToFleet(fleetId) {
    navigate((r) => ({ tab: "fleet", fleetId, compareId: r.compareId === fleetId ? null : r.compareId }));
    setAccessOpen(false);
    setMobileMenuOpen(false);
  }
  // jump from any linked element straight to its codex page
  function goToCodex(wikiId) {
    const entry = wiki.find((e) => e.id === wikiId);
    navigate(entry ? { tab: "codex", cat: entry.category, wikiId: entry.id } : { tab: "codex" });
    setAccessOpen(false);
    setMobileMenuOpen(false);
  }
  function patchWikiEntry(id, p) {
    if (!canEdit) return;
    setWiki((w) => w.map((e) => (e.id === id ? { ...e, ...p } : e)));
  }
  function deleteWikiEntry(id) {
    if (!canEdit) return;
    setWiki((w) => w.filter((e) => e.id !== id));
    // replace, not push: Back should not offer to reopen an entry that's gone
    setSelectedWikiId((cur) => (cur === id ? null : cur), { replace: true });
  }

  /* ------------------------------------------------ map gesture handlers (mode-aware click/tap/drop routing) */
  function onSystemTap(id) {
    if (mode === "link") {
      if (!canEdit) { setLinkSource(null); return; }
      if (!linkSource) { setLinkSource(id); return; }
      if (linkSource === id) { setLinkSource(null); return; }
      setLinks((ls) => {
        const exists = ls.find((l) => (l.a === linkSource && l.b === id) || (l.a === id && l.b === linkSource));
        if (exists) return ls.filter((l) => l !== exists);
        return [...ls, { id: uid("ln"), a: linkSource, b: id }];
      });
      setLinkSource(null);
      return;
    }
    setSelFleet(null); setSelSystem(id);
  }
  function onFleetTap(id) {
    if (mode === "link") return;
    setSelSystem(null); setSelFleet(id);
  }
  function onFleetSnap(id, systemsSnapshot) {
    if (!canEdit) return;
    setFleets((fs) => fs.map((f) => {
      if (f.id !== id) return f;
      let best = null, bestD = 62; // world units
      for (const s of systemsSnapshot) {
        const dd = Math.hypot(s.x - f.x, s.y - f.y);
        if (dd < bestD) { bestD = dd; best = s; }
      }
      return best ? { ...f, systemId: best.id } : { ...f, systemId: null };
    }));
  }
  function onDeselectAll() { setSelSystem(null); setSelFleet(null); setLinkSource(null); }

  const mapInt = useMapInteractions({
    activeTab, mode, canEdit,
    view, setView,
    systems, setSystems,
    fleets, setFleets,
    strokes, setStrokes,
    drawColor: T.accent, drawWidth: 3,
    onSystemTap, onFleetTap,
    onFleetSnap,
    onShipDrop: moveShip,
    onDeselectAll,
    onLinkBackgroundClick: () => setLinkSource(null),
    onDoubleClickAddSystem: addSystemAt,
  });

  /* ------------------------------------------------ derived fleet positions */
  const fleetPos = useMemo(() => {
    const grouping = {};
    fleets.forEach((f) => { if (f.systemId) (grouping[f.systemId] = grouping[f.systemId] || []).push(f.id); });
    const out = {};
    fleets.forEach((f) => {
      if (f.systemId) {
        const sys = systems.find((s) => s.id === f.systemId);
        if (sys) {
          const arr = grouping[f.systemId]; const idx = arr.indexOf(f.id); const n = arr.length;
          const R = 46 + Math.floor(idx / 6) * 26;
          const ang = -Math.PI / 2 + (idx % 6) * (Math.PI * 2 / Math.min(6, Math.max(3, n)));
          out[f.id] = { x: sys.x + Math.cos(ang) * R, y: sys.y + Math.sin(ang) * R };
          return;
        }
      }
      out[f.id] = { x: f.x, y: f.y };
    });
    return out;
  }, [fleets, systems]);

  /* ------------------------------------------------ visibility-filtered views (what non-GM viewers render).
     The full arrays stay in state; only the GM/open mode writes, so a narrow player view never overwrites the master. */
  const displayWiki = useMemo(
    () => (viewer.seesAll ? wiki : wiki.filter((e) => canSee(e, viewer))),
    [wiki, viewer]
  );
  const displayFleets = useMemo(() => {
    if (viewer.seesAll) return fleets;
    const out = [];
    for (const f of fleets) {
      const ships = f.ships.filter((sh) => canSee(sh, viewer));
      // if a fleet had carriers but this viewer can see none of them, hide the whole fleet
      if (f.ships.length > 0 && ships.length === 0) continue;
      out.push({ ...f, ships });
    }
    return out;
  }, [fleets, viewer]);

  const accessProps = {
    viewer, roles, canEdit, lockCode, accessOpen, setAccessOpen, codeInput, setCodeInput, codeError, setCodeError,
    setNewLockCode, removeLockCode, tryUnlock, signOut, addRole, patchRole, removeRole,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: T.void,
      color: T.text, fontFamily: "'Oswald', ui-sans-serif, system-ui, sans-serif", overflow: "hidden" }}>

      {/* loading gate — avoids flashing an empty sector before the saved sector loads */}
      {!loaded && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: T.void,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ ...panelStyle, ...cut(10), padding: "18px 26px", display: "flex", alignItems: "center", gap: 12 }}>
            <Satellite size={20} color={T.accent} style={{ animation: "sweep 1.3s linear infinite" }} />
            <div>
              <div className="stencil" style={{ fontSize: 15, letterSpacing: ".06em", color: T.text }}>ACCESSING ARCHIVE</div>
              <div style={{ fontSize: 9.5, color: T.faint, letterSpacing: ".16em", marginTop: 2, fontFamily: "'Oswald', sans-serif" }}>
                RETRIEVING SECTOR RECORD
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ GLOBAL TAB BAR (map / codex) — always visible */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
        background: `linear-gradient(180deg, #0a0906, ${T.panel})`, borderBottom: `1px solid ${T.line}`, zIndex: 41 }}>
        {/* the tabs don't fit a phone with their labels, so below the breakpoint they go icon-only */}
        <div style={{ display: "flex", gap: 3, background: T.panel3, padding: 3, border: `1px solid ${T.line}` }}>
          <Btn active={activeTab === "map"} onClick={() => { setActiveTab("map"); setAccessOpen(false); }} title="Sector map"
            style={{ border: "none", borderRadius: 0, background: activeTab === "map" ? undefined : "transparent" }}>
            <MapIcon size={14} /> {!isMobile && "Map"}
          </Btn>
          <Btn active={activeTab === "fleet"} onClick={() => { setActiveTab("fleet"); setAccessOpen(false); setMobileMenuOpen(false); }} title="Fleet rosters"
            style={{ border: "none", borderRadius: 0, background: activeTab === "fleet" ? undefined : "transparent" }}>
            <Ship size={14} /> {!isMobile && "Fleets"}
          </Btn>
          <Btn active={activeTab === "politics"} onClick={() => { setActiveTab("politics"); setAccessOpen(false); setMobileMenuOpen(false); }} title="Faction politics"
            style={{ border: "none", borderRadius: 0, background: activeTab === "politics" ? undefined : "transparent" }}>
            <Network size={14} /> {!isMobile && "Politics"}
          </Btn>
          <Btn active={activeTab === "codex"} onClick={() => { setActiveTab("codex"); setAccessOpen(false); setMobileMenuOpen(false); }} title="Setting codex / wiki"
            style={{ border: "none", borderRadius: 0, background: activeTab === "codex" ? undefined : "transparent" }}>
            <Library size={14} /> {!isMobile && "Codex"}
          </Btn>
          <Btn active={activeTab === "odds"} onClick={() => { setActiveTab("odds"); setAccessOpen(false); setMobileMenuOpen(false); }} title="Mission odds table"
            style={{ border: "none", borderRadius: 0, background: activeTab === "odds" ? undefined : "transparent" }}>
            <Dices size={14} /> {!isMobile && "Odds"}
          </Btn>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {canEdit && <SaveStatus saveStatus={saveStatus} isMobile={isMobile} />}
          <AccessControl compact={isMobile} {...accessProps} />
        </div>
      </div>

      {activeTab === "map" && (
        <>
          {!isMobile && (
            <Toolbar
              mode={mode} setMode={setMode} setLinkSource={setLinkSource} canEdit={canEdit}
              addSystemCenter={addSystemCenter} addFleetCenter={addFleetCenter}
              drawColor={mapInt.drawColor} setDrawColor={mapInt.setDrawColor}
              drawWidth={mapInt.drawWidth} setDrawWidth={mapInt.setDrawWidth}
              strokes={strokes} undoStroke={mapInt.undoStroke} clearStrokes={mapInt.clearStrokes}
              view={view} setView={setView} panelOpen={panelOpen} setPanelOpen={setPanelOpen}
            />
          )}
          {isMobile && (
            <MobileToolbar
              mode={mode} setMode={setMode} setLinkSource={setLinkSource} canEdit={canEdit}
              addSystemCenter={addSystemCenter} addFleetCenter={addFleetCenter}
              drawColor={mapInt.drawColor} setDrawColor={mapInt.setDrawColor}
              drawWidth={mapInt.drawWidth} setDrawWidth={mapInt.setDrawWidth}
              strokes={strokes} undoStroke={mapInt.undoStroke} clearStrokes={mapInt.clearStrokes}
              view={view} setView={setView} panelOpen={panelOpen} setPanelOpen={setPanelOpen}
              saveStatus={saveStatus} mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen}
            />
          )}

          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            {panelOpen && (
              <SidePanel
                factions={factions} layers={layers} systems={systems} fleets={fleets} canEdit={canEdit}
                isMobile={isMobile} onClose={() => setPanelOpen(false)}
                addFaction={addFaction} patchFaction={patchFaction} deleteFaction={deleteFaction}
                addLayer={addLayer} patchLayer={patchLayer} toggleLayer={toggleLayer}
              />
            )}

            <MapCanvas
              mapRef={mapInt.mapRef} canvasRef={mapInt.canvasRef} containerSize={mapInt.containerSize}
              isMobile={isMobile} mode={mode} canEdit={canEdit} view={view} w2s={w2s}
              systems={systems} fleets={displayFleets} links={links} fleetPos={fleetPos}
              factions={factions} layers={layers} factionById={factionById} layerById={layerById}
              selSystem={selSystem} selFleet={selFleet} linkSource={linkSource} hoverFleet={mapInt.hoverFleet}
              onMapPointerDown={mapInt.onMapPointerDown} onMapDoubleClick={mapInt.onMapDoubleClick}
              startPieceDrag={mapInt.startPieceDrag} canvasDown={mapInt.canvasDown} canvasMove={mapInt.canvasMove} canvasUp={mapInt.canvasUp}
              setSelSystem={setSelSystem} setSelFleet={setSelFleet}
              patchSystem={patchSystem} addMarker={addMarker} patchMarker={patchMarker} removeMarker={removeMarker}
              deployFleetAt={deployFleetAt} deleteSystem={deleteSystem}
              patchFleet={patchFleet} addShip={addShip} patchShip={patchShip} removeShip={removeShip}
              moveShip={moveShip} deleteFleet={deleteFleet} beginShipDrag={mapInt.beginShipDrag}
              addSquadron={addSquadron} patchSquadron={patchSquadron} removeSquadron={removeSquadron}
              goToFleet={goToFleet} art={art}
              wiki={displayWiki} roles={roles} goToCodex={goToCodex} createEntry={createEntry}
            />
          </div>
        </>
      )}

      {activeTab === "fleet" && (
        <FleetView
          fleets={displayFleets} systems={systems} canEdit={canEdit} isMobile={isMobile}
          factionById={factionById}
          primaryId={fleetPrimaryId} setPrimaryId={setFleetPrimaryId}
          compareId={fleetCompareId} setCompareId={setFleetCompareId}
          addShip={addShip} patchShip={patchShip} removeShip={removeShip}
          addSquadron={addSquadron} patchSquadron={patchSquadron} removeSquadron={removeSquadron}
          art={art} addArt={addArt} patchArt={patchArt} removeArt={removeArt}
        />
      )}

      {activeTab === "politics" && (
        <PoliticsView
          factions={factions} relations={relations} canEdit={canEdit} isMobile={isMobile} wiki={displayWiki}
          patchFaction={patchFaction} addFaction={addFaction} deleteFaction={deleteFaction} setRelation={setRelation}
          addMember={addMember} patchMember={patchMember} removeMember={removeMember}
          goToCodex={goToCodex} createEntry={createEntry}
        />
      )}

      {activeTab === "codex" && (
        <WikiView
          wiki={displayWiki} roles={roles} canEdit={canEdit} isMobile={isMobile}
          activeCat={activeCat} setActiveCat={setActiveCat}
          selectedId={selectedWikiId} setSelectedId={setSelectedWikiId}
          addEntry={addWikiEntry} patchEntry={patchWikiEntry} deleteEntry={deleteWikiEntry}
        />
      )}

      {/* A dice-reference tool, not a view of the sector — it takes no props but
          the breakpoint, and deliberately reads nothing from the map. */}
      {activeTab === "odds" && <OddsView isMobile={isMobile} />}

      {/* ship drag ghost */}
      {mapInt.shipDrag && (
        <div style={{ position: "fixed", left: mapInt.shipDrag.x + 12, top: mapInt.shipDrag.y + 10, zIndex: 999, pointerEvents: "none",
          background: T.panel, border: `1px solid ${T.accent}`, borderRadius: 2, padding: "5px 9px",
          fontSize: 11, color: T.text, boxShadow: `0 8px 20px rgba(0,0,0,.6)` }} className="mono">
          {mapInt.shipDrag.ship.name} · {craftInCarrier(mapInt.shipDrag.ship)} craft
          {mapInt.hoverFleet && mapInt.hoverFleet !== mapInt.shipDrag.fromFleetId && (
            <span style={{ color: T.accent }}> → drop</span>
          )}
        </div>
      )}
    </div>
  );
}
