import { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react";
import { Map as MapIcon, Library, Satellite, Network, Ship, Dices, Package, Bell, Gavel, VenetianMask, Menu, ChevronDown, ChevronUp, Eye, EyeOff, History, Archive } from "lucide-react";
import { T, F, panelStyle, cut } from "./theme.js";
import { KNOWN_CODE_KEY, ROLE_COLORS, DEFAULT_SQUADRON_SIZE, GM_RECIPIENT, MAX_ZOOM } from "./constants.js";
import { storage } from "./lib/storage.js";
import { subscribeSector, saveSector, subscribeNotes, saveNotes, emptySector } from "./lib/sectorRepo.js";
import { buildSectorUpdates, buildCollectionUpdates } from "./lib/sectorSchema.js";
import { resolveViewer, canSee, canSeeSubmission, visibleFleets, friendlyFactionIds, visibleAgents, visibleOrders, visibleActions, visibleMissions } from "./lib/visibility.js";
import { craftInCarrier, withSquadrons, squadronsOf, commitDetachments, returnDetachments } from "./lib/carriers.js";
import { moveShips, moveSquadron, moveVessel, disbandEmptyFleets, spawnFleet } from "./lib/fleets.js";
import { effectiveMoveOrders } from "./lib/movement.js";
import { eligibleSystemFor, systemCap, systemStagedTotal, adjustLine, applyReplenishments, replenishmentSummary } from "./lib/replenish.js";
import { roll2d6, ossiteCheckPassed, OSSITE_RESOURCE_NAME } from "./lib/endTurnChecks.js";
import { uid } from "./utils/id.js";
import { useResponsive } from "./hooks/useResponsive.js";
import { useMapInteractions } from "./hooks/useMapInteractions.js";
import { useHashRoute } from "./hooks/useHashRoute.js";
import { ConfirmProvider } from "./hooks/useConfirm.jsx";
import Btn from "./components/ui/Btn.jsx";
import AccessControl from "./components/AccessControl.jsx";
import Toolbar, { SaveStatus } from "./components/Toolbar.jsx";
import MobileToolbar from "./components/MobileToolbar.jsx";
import SidePanel from "./components/SidePanel.jsx";
import MapCanvas from "./components/MapCanvas.jsx";
import FleetTransferModal from "./components/FleetTransferModal.jsx";
const FleetView = lazy(() => import("./components/FleetView.jsx"));
const WikiView = lazy(() => import("./components/WikiView.jsx"));
const PoliticsView = lazy(() => import("./components/PoliticsView.jsx"));
const AssetsView = lazy(() => import("./components/AssetsView.jsx"));
const OddsView = lazy(() => import("./components/OddsView.jsx"));
const UpdatesView = lazy(() => import("./components/UpdatesView.jsx"));
const AgentsView = lazy(() => import("./components/AgentsView.jsx"));
const GMToolsView = lazy(() => import("./components/GMToolsView.jsx"));
const TimelineView = lazy(() => import("./components/TimelineView.jsx"));
const ActionArchiveView = lazy(() => import("./components/ActionArchiveView.jsx"));

// Severity colors/labels for the tracker badges in the top bar — kept in sync
// with the LEVELS list AssetsView uses for the actual tracker cards.
const TRACKER_LEVEL_COLOR = { low: T.accent, moderate: T.amber, high: "#c2551f", critical: T.danger };
const TRACKER_LEVEL_ABBR = { low: "L", moderate: "M", high: "H", critical: "C" };
const TRACKER_LEVEL_LABEL = { low: "Low", moderate: "Moderate", high: "High", critical: "Critical" };

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
  const [wikiReads, setWikiReads] = useState([]); // shared per-faction article read receipts
  const [roles, setRoles] = useState([]); // player roles for asymmetric-info games
  const [art, setArt] = useState([]);     // ship-art library
  const [modifiers, setModifiers] = useState([]); // per-faction event snippets (Assets tab: Modifiers/Trackers subtabs)
  const [resources, setResources] = useState([]); // per-faction integer counters (Assets tab: Resources subtab)
  const [resourceTransactions, setResourceTransactions] = useState([]); // log of resource sends between factions (and to the GM) — GM Tools: Transactions tab
  const [projects, setProjects] = useState([]); // per-faction turn-timer counters (Assets tab: Projects subtab) — see nextTurn
  const [notes, setNotes] = useState([]); // GM Tools: freeform notes + tracked roll resolutions
  const [agents, setAgents] = useState([]); // covert operatives, one optional character each, own-faction only
  const [orders, setOrders] = useState([]); // fleet/agent move-order proposals the GM resolves by hand
  const [actions, setActions] = useState([]); // text action requests players raise through an agent for the GM to resolve
  const [archivedActions, setArchivedActions] = useState([]); // actions from turns already closed out — see nextTurn
  const [actionReads, setActionReads] = useState([]); // shared per-faction "seen this resolved action" receipts, same idea as wikiReads
  const [missions, setMissions] = useState([]); // squadron mission requests players raise from a fleet's hangar for the GM to resolve
  const [archivedMissions, setArchivedMissions] = useState([]); // missions from turns already closed out — see nextTurn
  const [missionReads, setMissionReads] = useState([]); // shared per-faction "seen this resolved mission" receipts, same idea as wikiReads
  const [replenishments, setReplenishments] = useState([]); // strike-craft top-ups the GM stages per fleet each turn — applied on nextTurn (GM Tools: Replenish tab)
  const [replenishmentReads, setReplenishmentReads] = useState([]); // shared per-faction "seen this replenishment" receipts, same idea as missionReads
  const [endTurnChecks, setEndTurnChecks] = useState([]); // per-turn end-of-turn checks the GM manages (GM Tools: End of Turn Checks tab) — the ossite surplus check today; applied on nextTurn

  const [mode, setMode] = useState("select"); // select | link | draw | orders
  const [showOrders, setShowOrders] = useState(true); // personal: show/hide the move-order overlay on the map
  const [showFleets, setShowFleets] = useState(true); // personal: show/hide fleet pieces on the map
  const [showAgents, setShowAgents] = useState(true); // personal: show/hide agent pieces on the map
  const [showAssetsBar, setShowAssetsBar] = useState(true); // personal: show/hide the resource/tracker rail below the tab bar
  const [view, setView] = useState({ scale: 1, ox: 60, oy: 40 });
  const [strokes, setStrokes] = useState([]);

  const [selSystem, setSelSystem] = useState(null);
  const [selFleet, setSelFleet] = useState(null);
  const [selAgent, setSelAgent] = useState(null); // agent whose popup is open on the map
  const [transferFleetId, setTransferFleetId] = useState(null); // fleet the fleet transfer modal is open for
  const [routing, setRouting] = useState(null);   // { type, id, factionId, suggestion, suggesterFactionId } — the piece being plotted in orders mode (suggestion: plotting a move for a friendly faction's fleet)
  const [focusMapFleetId, setFocusMapFleetId] = useState(null); // fleet to center the map on once the map tab is up (see orderFleetMove)
  const [linkSource, setLinkSource] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error

  const [lockCode, setLockCode] = useState("");   // shared: "" means editing is open to everyone; else the GM code
  const [fleetsPublic, setFleetsPublic] = useState(true); // shared: false hides fleet positions from anyone without a matching login
  const [turnNumber, setTurnNumber] = useState(0); // shared: bumped by nextTurn(), stamped onto actions as they're archived — the campaign starts at turn 0
  const [turns, setTurns] = useState([]); // shared: turn-boundary records { turn, startedAt, name } — when each turn began (stamped by nextTurn(), editable by the GM on the Timeline tab) and the GM's optional name for it
  const [knownCode, setKnownCode] = useState(""); // personal: the GM/player code this browser has entered
  const [accessOpen, setAccessOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");

  // Who is looking: GM (admin), a player role, an anonymous viewer, or legacy open mode.
  const viewer = useMemo(() => resolveViewer(knownCode, lockCode, roles), [knownCode, lockCode, roles]);
  const canEdit = viewer.seesAll; // GM and open mode edit; players & anon are view-only

  // Personal, unsaved safety catch — not part of the shared sector, so it resets
  // on reload same as panelOpen/showFleets. Freezes dragging, add/delete, links
  // and drawing on the Map and faction dragging/add/delete on Politics, so the
  // GM (or anyone in open mode) can browse the board at the table without
  // fat-fingering a piece out of place. Everything reached through a dedicated
  // tab instead (Fleet roster, Agents, Assets…) stays editable regardless.
  const [editLocked, setEditLocked] = useState(true);
  const editingEnabled = canEdit && !editLocked;

  const isMobile = useResponsive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false); // mobile: the global tab-bar dropdown

  /* ------------------------------------------------ which page we're on — lives in the URL, not in state.
     See lib/routing.js: the tab, the codex category + open entry, and the fleet
     being read (plus any fleet pinned beside it to compare) are all in the hash,
     so pages are shareable and Back works. */
  const [route, navigate] = useHashRoute();
  const { tab: activeTab, cat: activeCat, wikiId: selectedWikiId,
    fleetId: fleetPrimaryId, compareId: fleetCompareId, assetFactionId, assetSubtab, agentFactionId, agentId: initialAgentId } = route;

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
  const setAssetFactionId = (v) => navigate((r) => ({ assetFactionId: fromSetter(v, r.assetFactionId) }));
  const setAgentFactionId = (v) => navigate((r) => ({ agentFactionId: fromSetter(v, r.agentFactionId) }));

  useEffect(() => { if (isMobile) setPanelOpen(false); }, [isMobile]); // avoid opening full-screen on first mobile load

  // Everything in the shared sector, in one object: what gets saved, and what the
  // last save is diffed against. The lock code lives here too — it's shared state
  // like any other, and once, when it had its own write path, a migration left it
  // behind and silently unlocked the sector.
  // `notes` is deliberately not part of this — it lives at its own path and is
  // saved on its own schedule below, so it's never part of the root diff/save.
  const sector = useMemo(
    () => ({ factions, relations, layers, systems, links, fleets, strokes, wiki, wikiReads, roles, art, modifiers, resources, resourceTransactions, projects, agents, orders, actions, archivedActions, actionReads, missions, archivedMissions, missionReads, replenishments, replenishmentReads, turns, endTurnChecks, lockCode, fleetsPublic, turnNumber }),
    [factions, relations, layers, systems, links, fleets, strokes, wiki, wikiReads, roles, art, modifiers, resources, resourceTransactions, projects, agents, orders, actions, archivedActions, actionReads, missions, archivedMissions, missionReads, replenishments, replenishmentReads, turns, endTurnChecks, lockCode, fleetsPublic, turnNumber],
  );
  // The sector as the database currently has it. Null until the load below fills
  // it in, which is also what stops an autosave from firing against an empty
  // sector before the real one has arrived and wiping it.
  const savedRef = useRef(null);
  // The live local sector, mirrored into a ref so the subscription callback below
  // can read the latest edits without going stale inside its closure.
  const sectorRef = useRef(sector);
  sectorRef.current = sector;

  /* ------------------------------------------------ personal code this browser knows (local, one-time) */
  useEffect(() => {
    try {
      const res = storage.get(KNOWN_CODE_KEY); // personal: what this user knows
      if (res && typeof res.value === "string") setKnownCode(res.value);
    } catch (e) {
      // this browser/account has never entered a code
    }
  }, []);

  /* ------------------------------------------------ live sector subscription.
     Players (and a second GM) see edits as they land: onData fires once on open,
     then on every database change — another editor's save, or our own echoing back. */
  useEffect(() => {
    let opened = false;
    const applyData = (data) => {
      setFactions(data.factions); setRelations(data.relations); setLayers(data.layers);
      setSystems(data.systems); setLinks(data.links); setFleets(data.fleets);
      setStrokes(data.strokes); setWiki(data.wiki); setWikiReads(data.wikiReads); setRoles(data.roles); setArt(data.art);
      setModifiers(data.modifiers); setResources(data.resources); setResourceTransactions(data.resourceTransactions);
      setProjects(data.projects);
      setAgents(data.agents); setOrders(data.orders); setActions(data.actions);
      setArchivedActions(data.archivedActions); setActionReads(data.actionReads);
      setMissions(data.missions); setArchivedMissions(data.archivedMissions); setMissionReads(data.missionReads);
      setReplenishments(data.replenishments); setReplenishmentReads(data.replenishmentReads);
      setTurns(data.turns); setEndTurnChecks(data.endTurnChecks);
      setLockCode(data.lockCode); setFleetsPublic(data.fleetsPublic !== false);
      setTurnNumber(data.turnNumber || 0);
    };
    const unsub = subscribeSector(
      ({ data, schema }) => {
        // Diffing against what was loaded means opening a sector writes nothing —
        // except a sector below the current schema, where diffing against an
        // empty one makes the first edit rewrite the whole tree, migrating it in
        // place for anyone who never ran the matching scripts/migrate-*.mjs
        // (v1->v2, or v2->v3's ships split).
        const asSaved = (schema === 1 || schema === 2) ? emptySector() : data;
        if (!opened) {
          opened = true;
          applyData(data);
          savedRef.current = asSaved;
          setLoaded(true);
          return;
        }
        // A later push: our own save echoing back, or one that changes nothing we
        // don't already have — adopt nothing, skip the re-render.
        if (savedRef.current && !Object.keys(buildSectorUpdates(savedRef.current, data)).length) return;
        // A real remote change while this browser is mid-edit: its own debounced
        // autosave owns the write (last write wins), so don't yank the remote copy
        // in over what the GM is still typing. When idle, local state equals
        // savedRef, so adopting the remote copy wholesale is safe — and is what
        // surfaces other editors' changes.
        if (savedRef.current &&
            Object.keys(buildSectorUpdates(savedRef.current, sectorRef.current)).length) return;
        savedRef.current = asSaved;
        applyData(data);
      },
      (e) => {
        // Storage unavailable or Firebase not configured — keep the empty sector.
        // savedRef stays null so autosave holds off rather than overwriting the real
        // sector with this empty one, and we surface the error: unsaved edits must
        // look unsaved, not like an idle, saved map.
        console.warn("[sector] live subscription error", e);
        setSaveStatus("error");
        setLoaded(true);
      },
    );
    return unsub;
  }, []);

  /* ------------------------------------------------ debounced autosave (editors only).
     One save for the whole sector, but only the entities that actually changed get
     written (see lib/sectorSchema.js buildSectorUpdates) — so art's SVGs don't ride
     along on every keystroke the way the old one-blob-per-key layout forced. */
  useEffect(() => {
    // A signed-in player can also write now — see submitWikiEntry etc. below,
    // patchMemberTitle for their own faction's characters, and the agents/orders/
    // actions setters (each gated to the player's own faction) — but every other
    // setter in the app stays canEdit-gated, so a player session's diff can only
    // ever touch `wiki`, a member's `role`, or their own faction's
    // `agents`/`orders`/`actions`.
    // Anyone else (anon, or no GM code set yet) never writes.
    const canWrite = canEdit || viewer.kind === "player";
    if (!loaded || !canWrite || !savedRef.current) return;
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
  }, [sector, loaded, canEdit, viewer.kind]);

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
  // GM switch: false hides fleet positions from anyone without a matching login.
  function toggleFleetsPublic(next) {
    if (!canEdit) return;
    setFleetsPublic(next);
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
    if (!editingEnabled) return;
    const id = uid("sys");
    setSystems((ss) => [...ss, { id, name: "New System", x: wx, y: wy, factionId: "fac_none", markers: [] }]);
    setMode("select"); setSelFleet(null); setSelSystem(id);
  }
  function addSystemCenter() {
    if (!editingEnabled) return;
    const wx = (mapInt.containerSize.w / 2 - view.ox) / view.scale + (Math.random() * 40 - 20);
    const wy = (mapInt.containerSize.h / 2 - view.oy) / view.scale + (Math.random() * 40 - 20);
    addSystemAt(wx, wy);
  }
  function addFleetCenter() {
    if (!editingEnabled) return;
    const wx = (mapInt.containerSize.w / 2 - view.ox) / view.scale + (Math.random() * 40 - 20);
    const wy = (mapInt.containerSize.h / 2 - view.oy) / view.scale + (Math.random() * 40 - 20);
    const id = uid("flt");
    setFleets((fs) => [...fs, { id, name: "New Fleet", factionId: factions[0].id, systemId: null, x: wx, y: wy, ships: [] }]);
    setMode("select"); setSelSystem(null); setSelFleet(id);
  }
  function deployFleetAt(sysId) {
    if (!editingEnabled) return;
    const sys = systems.find((s) => s.id === sysId);
    const id = uid("flt");
    setFleets((fs) => [...fs, { id, name: "New Fleet", factionId: sys.factionId, systemId: sysId, x: sys.x, y: sys.y, ships: [] }]);
    setSelSystem(null); setSelFleet(id);
  }
  function deleteSystem(id) {
    if (!editingEnabled) return;
    const sys = systems.find((s) => s.id === id);
    setFleets((fs) => fs.map((f) => (f.systemId === id ? { ...f, systemId: null, x: sys.x + 40, y: sys.y + 40 } : f)));
    setLinks((ls) => ls.filter((l) => l.a !== id && l.b !== id));
    setSystems((ss) => ss.filter((s) => s.id !== id));
    // An agent parked at this system becomes unplaced; any order routing through
    // it drops that stop so no path points at a system that's gone.
    setAgents((as) => as.map((a) => (a.systemId === id ? { ...a, systemId: null } : a)));
    setOrders((os) => os.map((o) => (o.path.includes(id) ? { ...o, path: o.path.filter((s) => s !== id) } : o)));
    setSelSystem(null);
  }
  function deleteFleet(id) {
    if (!canEdit) return;
    setFleets((fs) => fs.filter((f) => f.id !== id));
    setOrders((os) => os.filter((o) => !(o.pieceType === "fleet" && o.pieceId === id)));
    setSelFleet(null);
  }
  const patchSystem = (id, p) => {
    if (!canEdit) return;
    setSystems((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s)));
    // A system's affiliation is also readable from its codex ("locations") entry
    // — keep that copy in sync so the map and the article never disagree.
    if ("factionId" in p) {
      const sys = systems.find((s) => s.id === id);
      if (sys && sys.wikiId) {
        setWiki((w) => w.map((e) => (e.id === sys.wikiId ? { ...e, factionId: p.factionId, updatedAt: Date.now() } : e)));
      }
    }
  };
  const patchFleet = (id, p) => { if (canEdit) setFleets((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f))); };
  // Renaming (unlike affiliation/other patchFleet fields, which stay GM-only)
  // is a player self-service action on their own faction's fleets — same
  // canOrderFor gate as squadron orders and fleet transfer.
  function renameFleet(id, name) {
    const f = fleets.find((x) => x.id === id);
    if (!f || !canOrderFor(f.factionId)) return;
    setFleets((fs) => fs.map((x) => (x.id === id ? { ...x, name } : x)));
  }

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

  /* ---- fleet transfer: move carriers or a single squadron between two
     friendly fleets in the same system, or spin off a brand-new fleet as the
     target. Gated on canOrderFor (covers the GM/open-mode and a player acting
     on their own faction's fleets), not the plain canEdit moveShip above uses
     — this is meant to be a player self-service tool, not GM-only. Target
     fleet must always share the source's factionId: a player may shuffle
     carriers between two of their own fleets, never donate one to another
     faction's, even a friendly one. */
  function afterFleetTransfer(fromFleetId, emptied) {
    if (!emptied) return;
    setOrders((os) => os.filter((o) => !(o.pieceType === "fleet" && o.pieceId === fromFleetId)));
    setSelFleet((cur) => (cur === fromFleetId ? null : cur));
    setTransferFleetId((cur) => (cur === fromFleetId ? null : cur));
  }
  function transferShips(fromFleetId, toFleetId, shipIds) {
    const from = fleets.find((f) => f.id === fromFleetId);
    const to = fleets.find((f) => f.id === toFleetId);
    if (!from || !to || from.factionId !== to.factionId || !canOrderFor(from.factionId)) return;
    const emptied = from.ships.length > 0 && from.ships.every((s) => shipIds.includes(s.id));
    setFleets((fs) => disbandEmptyFleets(moveShips(fs, fromFleetId, toFleetId, shipIds), [fromFleetId]));
    afterFleetTransfer(fromFleetId, emptied);
  }
  function transferSquadron(fromFleetId, fromShipId, toFleetId, toShipId, squadronId) {
    const from = fleets.find((f) => f.id === fromFleetId);
    const to = fleets.find((f) => f.id === toFleetId);
    if (!from || !to || from.factionId !== to.factionId || !canOrderFor(from.factionId)) return;
    setFleets((fs) => moveSquadron(fs, fromFleetId, fromShipId, toFleetId, toShipId, squadronId));
  }
  // A squadron is just a count of one model on a carrier, not a command unit —
  // this moves a single vessel out of it onto a different carrier, merging
  // into a same-model squadron there or starting a new one-vessel squadron.
  function transferVessel(fromFleetId, fromShipId, toFleetId, toShipId, squadronId) {
    const from = fleets.find((f) => f.id === fromFleetId);
    const to = fleets.find((f) => f.id === toFleetId);
    if (!from || !to || from.factionId !== to.factionId || !canOrderFor(from.factionId)) return;
    setFleets((fs) => moveVessel(fs, fromFleetId, fromShipId, toFleetId, toShipId, squadronId));
  }
  function splitToNewFleet(fromFleetId, shipIds, name) {
    const from = fleets.find((f) => f.id === fromFleetId);
    if (!from || !canOrderFor(from.factionId)) return null;
    const created = spawnFleet(from, name);
    const emptied = from.ships.length > 0 && from.ships.every((s) => shipIds.includes(s.id));
    setFleets((fs) => disbandEmptyFleets(moveShips([...fs, created], fromFleetId, created.id, shipIds), [fromFleetId]));
    afterFleetTransfer(fromFleetId, emptied);
    return created.id;
  }
  function openFleetTransfer(fleetId) { setTransferFleetId(fleetId); }
  // Close the fleet transfer modal on its own if its source fleet disappears
  // mid-session (auto-disbanded by the transfer it just made, or deleted by
  // someone else entirely).
  useEffect(() => {
    if (transferFleetId && !fleets.some((f) => f.id === transferFleetId)) setTransferFleetId(null);
  }, [fleets, transferFleetId]);

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

  /* ---- strike-craft replenishment (GM Tools: Replenish tab) ----
     The GM stages top-ups onto a fleet's carriers while it sits in friendly space;
     nextTurn() applies them to the hangars and notifies the fleet's faction. Each
     call bumps one carrier+model line up or down by `delta`, enforcing the shared
     per-system budget (12, or 25 with a shipyard) so staging can never overdraw a
     system's pool. Only eligible fleets (own/ally/vassal-owned system) can stage. */
  function stageReplenishment(fleetId, shipId, model, delta) {
    if (!isGM) return;
    const fleet = fleets.find((f) => f.id === fleetId);
    if (!fleet) return;
    const system = eligibleSystemFor(fleet, systems, relations);
    if (!system) return;
    const cap = systemCap(system);
    setReplenishments((rs) => adjustLine(rs, {
      turn: turnNumber, fleetId, systemId: system.id, factionId: fleet.factionId,
      shipId, model: model || "", delta,
      cap, systemTotal: systemStagedTotal(rs, turnNumber, system.id),
    }));
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
  function patchFaction(id, p) {
    if (!canEdit) return;
    setFactions((fx) => fx.map((f) => (f.id === id ? { ...f, ...p } : f)));
    // A faction's article is the other end of `wikiId` — keep the entry's own
    // factionId copy in sync so it colors/filters in the codex the same way a
    // character's or system's entry does, instead of a reverse lookup at render time.
    if ("wikiId" in p) {
      const prevWikiId = (factions.find((f) => f.id === id) || {}).wikiId;
      setWiki((w) => w.map((e) => {
        if (e.id === prevWikiId && e.id !== p.wikiId) return { ...e, factionId: undefined, updatedAt: Date.now() };
        if (e.id === p.wikiId) return { ...e, factionId: id, updatedAt: Date.now() };
        return e;
      }));
    }
  }
  function deleteFaction(id) {
    if (!canEdit) return;
    if (factions.length <= 1) return;
    const fallback = factions.find((f) => f.id !== id).id;
    const gone = factions.find((f) => f.id === id);
    setSystems((ss) => ss.map((s) => (s.factionId === id ? { ...s, factionId: fallback } : s)));
    setFleets((fs) => fs.map((f) => (f.factionId === id ? { ...f, factionId: fallback } : f)));
    setRelations((rs) => rs.filter((r) => r.a !== id && r.b !== id));
    // Drop the deleted faction from any player login tied to it, so its fleet
    // gate doesn't silently dangle on a faction that no longer exists.
    setRoles((rs) => rs.map((r) => (r.factionId === id ? { ...r, factionId: undefined } : r)));
    setModifiers((ms) => ms.filter((m) => m.factionId !== id));
    setResources((rs) => rs.filter((r) => r.factionId !== id));
    setProjects((ps) => ps.filter((p) => p.factionId !== id));
    // A faction's agents, move orders, and action requests go with it.
    setAgents((as) => as.filter((a) => a.factionId !== id));
    setOrders((os) => os.filter((o) => o.factionId !== id));
    setActions((acts) => acts.filter((a) => a.factionId !== id));
    // Its own article outlives it, but shouldn't keep pointing at a faction gone.
    if (gone && gone.wikiId) {
      setWiki((w) => w.map((e) => (e.id === gone.wikiId ? { ...e, factionId: undefined, updatedAt: Date.now() } : e)));
    }
    setFactions((fx) => fx.filter((f) => f.id !== id));
  }

  /* ---- faction members (the character subnode cloud) ---- */
  function addMember(facId) {
    if (!canEdit) return;
    const m = { id: uid("mem"), name: "New Character", kind: "character", role: "", wikiId: null, star: false };
    setFactions((fx) => fx.map((f) => (f.id === facId ? { ...f, members: [...(f.members || []), m] } : f)));
  }
  function patchMember(facId, memId, p) {
    if (!canEdit) return;
    setFactions((fx) => fx.map((f) => f.id === facId
      ? { ...f, members: (f.members || []).map((m) => (m.id === memId ? { ...m, ...p } : m)) } : f));
  }
  // A signed-in player's one write onto the roster: their own faction's
  // characters, title only — name, portrait status, and codex links stay GM-only.
  function patchMemberTitle(facId, memId, role) {
    if (!canEdit && !(viewer.kind === "player" && viewer.roleFactionId === facId)) return;
    setFactions((fx) => fx.map((f) => f.id === facId
      ? { ...f, members: (f.members || []).map((m) => (m.id === memId ? { ...m, role } : m)) } : f));
  }
  function removeMember(facId, memId) {
    if (!canEdit) return;
    setFactions((fx) => fx.map((f) => f.id === facId
      ? { ...f, members: (f.members || []).filter((m) => m.id !== memId) } : f));
  }

  /* ---- modifiers: freeform event snippets attached to a faction.
     GM-only, even in open mode — unlike everything else canEdit covers,
     these are called out by name so only an authenticated GM (viewer.kind
     === "admin") may touch them. */
  const isGM = viewer.kind === "admin";
  function addModifier(factionId, kind = "text") {
    if (!isGM) return;
    const entry = { id: uid("mod"), factionId, kind, name: "", text: "", createdAt: Date.now() };
    if (kind === "slider") entry.level = "low";
    setModifiers((ms) => [...ms, entry]);
  }
  function patchModifier(id, p) {
    if (!isGM) return;
    setModifiers((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));
  }
  function removeModifier(id) {
    if (!isGM) return;
    setModifiers((ms) => ms.filter((m) => m.id !== id));
    // A player may have flagged this modifier on an open action request; drop the
    // dangling id so the GM's request card doesn't point at a modifier that's gone.
    setActions((acts) => acts.map((a) => (a.modifierIds.includes(id)
      ? { ...a, modifierIds: a.modifierIds.filter((mid) => mid !== id) } : a)));
  }
  // Drag-reorder within a faction's kind group: `orderedIds` is the full,
  // reordered list of ids for that faction+kind slice. Splice that slice
  // back into the master array in its new order, leaving everything else
  // (other factions, other kinds) at its original position.
  function reorderModifiers(orderedIds) {
    if (!isGM) return;
    setModifiers((ms) => {
      const idSet = new Set(orderedIds);
      const byId = new Map(ms.map((m) => [m.id, m]));
      let cursor = 0;
      return ms.map((m) => (idSet.has(m.id) ? byId.get(orderedIds[cursor++]) : m));
    });
  }

  /* ---- resources: integer counters attached to a faction (Assets tab,
     Resources subtab) — GM-only, same gate as modifiers. `text` is what the
     resource is spent on/used for, shown to players so a counter isn't just
     a bare number. The first resource added for a faction defaults its name
     to "Ossite Surplus" so a fresh faction starts with a recognizable
     counter instead of a blank one. */
  function addResource(factionId) {
    if (!isGM) return;
    const already = resources.some((r) => r.factionId === factionId);
    const entry = { id: uid("res"), factionId, name: already ? "" : "Ossite Surplus", value: 0, text: "", createdAt: Date.now() };
    setResources((rs) => [...rs, entry]);
  }
  function patchResource(id, p) {
    if (!isGM) return;
    setResources((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }
  function removeResource(id) {
    if (!isGM) return;
    setResources((rs) => rs.filter((r) => r.id !== id));
  }
  // A player may send some of their own faction's resource holdings to any
  // other faction (not just an ally — any player) or to the GM (the
  // GM_RECIPIENT sentinel, for a tribute/cost with nowhere else to go) —
  // unlike name/value/description edits above, this isn't GM-only, just
  // gated on actually owning the resource being sent. The GM can send on any
  // faction's behalf, same as every other edit. Merges into a same-named
  // resource the recipient already holds, or opens a new one for them if
  // they don't; sending to the GM just removes it, since the GM doesn't
  // hold a resource pool. Every send — whoever it's to — is logged to
  // `resourceTransactions` so the GM has a full ledger (see GM Tools' Transactions tab).
  function sendResource(id, toFactionId, amount, message) {
    const r = resources.find((x) => x.id === id);
    if (!r || !toFactionId || toFactionId === r.factionId) return;
    if (!isGM && viewer.roleFactionId !== r.factionId) return;
    const send = Math.max(0, Math.min(Math.trunc(Number(amount)) || 0, r.value || 0));
    if (send <= 0) return;
    const toGM = toFactionId === GM_RECIPIENT;
    setResources((rs) => {
      const afterSend = rs.map((x) => (x.id === id ? { ...x, value: (x.value || 0) - send } : x));
      if (toGM) return afterSend;
      const target = afterSend.find((x) => x.factionId === toFactionId && x.name === r.name);
      return target
        ? afterSend.map((x) => (x.id === target.id ? { ...x, value: (x.value || 0) + send } : x))
        : [...afterSend, { id: uid("res"), factionId: toFactionId, name: r.name, value: send, text: r.text || "", createdAt: Date.now() }];
    });
    setResourceTransactions((ts) => [...ts, {
      id: uid("txn"), resourceName: r.name, fromFactionId: r.factionId, toFactionId,
      amount: send, message: (message || "").trim(), createdAt: Date.now(),
    }]);
  }
  function removeResourceTransaction(id) {
    if (!isGM) return;
    setResourceTransactions((ts) => ts.filter((t) => t.id !== id));
  }

  /* ---- end-of-turn checks (GM Tools: End of Turn Checks) — GM-only, same gate
     as resources. The only kind today is the Ossite Surplus check: one per
     system carrying the ossite trait, pre-rolled 2d6 (pass on 8+) so the GM can
     review or override it before Next Turn hands each successful check's
     controlling faction +1 Ossite Surplus (see nextTurn). Only the current
     turn's checks are live; past turns' are stamped `appliedAt` and kept as a
     record. `ensureOssiteChecks` is idempotent — it rolls a check for any
     ossite system that doesn't have one for this turn yet and no-ops otherwise,
     so the panel can call it on mount to have the rolls "predone". */
  function ensureOssiteChecks() {
    if (!isGM) return;
    setEndTurnChecks((cs) => {
      const have = new Set(cs.filter((c) => c.type === "ossite" && c.turn === turnNumber).map((c) => c.systemId));
      const missing = systems.filter((s) => s.hasOssite && !have.has(s.id));
      if (missing.length === 0) return cs;
      const added = missing.map((s) => ({
        id: uid("etc"), type: "ossite", turn: turnNumber, systemId: s.id,
        dice: roll2d6(), override: null, appliedAt: null, createdAt: Date.now(),
      }));
      return [...cs, ...added];
    });
  }
  // Re-roll one check's 2d6, dropping any manual override so it reads the fresh roll.
  function rerollOssiteCheck(id) {
    if (!isGM) return;
    setEndTurnChecks((cs) => cs.map((c) => (c.id === id && !c.appliedAt
      ? { ...c, dice: roll2d6(), override: null } : c)));
  }
  // Force a check's outcome by hand: "success" | "failure" to override, or null
  // to fall back to the roll. Toggling the active override off returns to auto.
  function setOssiteCheckOverride(id, override) {
    if (!isGM) return;
    setEndTurnChecks((cs) => cs.map((c) => (c.id === id && !c.appliedAt ? { ...c, override } : c)));
  }
  // Re-roll every live (unapplied) check for the current turn at once, clearing
  // overrides — the "shuffle the whole board" affordance.
  function rerollAllOssiteChecks() {
    if (!isGM) return;
    setEndTurnChecks((cs) => cs.map((c) => (c.type === "ossite" && c.turn === turnNumber && !c.appliedAt
      ? { ...c, dice: roll2d6(), override: null } : c)));
  }

  /* ---- projects: per-faction turn-timer counters (Assets tab, Projects
     subtab) — GM-only, same gate as modifiers/resources. `turnsRemaining`
     ticks down by one on every nextTurn() call, but only while `autoDecrement`
     is on; the GM can flip that off per-project to pause one (e.g. blocked on
     something) without losing its progress. `turnsTotal` is kept alongside
     `turnsRemaining` purely so the UI can draw a progress bar — it's never
     touched by the countdown itself. */
  function addProject(factionId) {
    if (!isGM) return;
    const entry = { id: uid("proj"), factionId, name: "", text: "", turnsTotal: 3, turnsRemaining: 3, autoDecrement: true, createdAt: Date.now() };
    setProjects((ps) => [...ps, entry]);
  }
  function patchProject(id, p) {
    if (!isGM) return;
    setProjects((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }
  function removeProject(id) {
    if (!isGM) return;
    setProjects((ps) => ps.filter((x) => x.id !== id));
  }

  /* ---- GM Tools notes: freeform log entries, plus roll resolutions the GM
     chose to keep. GM-only, same as modifiers — a player never reaches this
     tab (see the tab bar below), but the write paths are gated regardless.
     Notes live at their own database path (see sectorRepo.js) and are only
     ever subscribed to once this browser actually opens GM Tools as the GM —
     every player and anonymous viewer never fetches them at all. */
  const notesLoadedRef = useRef(false);
  const savedNotesRef = useRef(null);
  useEffect(() => {
    if (!isGM || activeTab !== "gmtools" || notesLoadedRef.current) return;
    notesLoadedRef.current = true;
    const unsub = subscribeNotes(
      (ns) => {
        if (savedNotesRef.current === null) savedNotesRef.current = ns;
        setNotes(ns);
      },
      (e) => console.warn("[sector] notes subscription error", e),
    );
    return unsub;
  }, [isGM, activeTab]);
  useEffect(() => {
    if (!isGM || savedNotesRef.current === null) return;
    if (!Object.keys(buildCollectionUpdates("notes", savedNotesRef.current, notes)).length) return;
    const t = setTimeout(async () => {
      const prev = savedNotesRef.current;
      try {
        const ok = await saveNotes(prev, notes);
        if (ok) savedNotesRef.current = notes;
      } catch (e) {
        console.warn("[sector] notes save error", e);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [notes, isGM]);
  function addNote(text, kind = "note", extra = {}) {
    if (!isGM || !text) return null;
    const entry = { id: uid("note"), kind, text, createdAt: Date.now(), ...extra };
    setNotes((ns) => [...ns, entry]);
    return entry.id;
  }
  function removeNote(id) {
    if (!isGM) return;
    setNotes((ns) => ns.filter((n) => n.id !== id));
  }

  /* ---- agents: covert operatives, capped per faction by the GM (faction.agentCap).
     Adding and removing an agent is GM-only (open mode too) — the GM owns each
     faction's roster. A player of the owning faction may still manage an existing
     agent's details (name/character/icon/notes) and raise its action requests;
     canManageAgents gates that — like patchMemberTitle, one of the few write
     paths a signed-in player has, gated to their own faction so a player can't
     touch anyone else's. Add/remove (addAgent/removeAgent) gate on canEdit instead. */
  function canManageAgents(factionId) {
    return canEdit || (viewer.kind === "player" && viewer.roleFactionId === factionId);
  }
  // Location is normally GM-only — a player requests a move instead — unless the
  // GM has flipped that player's role-level `canMoveAgents` toggle in Access, in
  // which case they may place their own faction's agents directly, same as the map.
  function canPlaceAgents(factionId) {
    return canEdit || (viewer.kind === "player" && viewer.roleFactionId === factionId && !!viewer.canMoveAgents);
  }
  // Creating a roster slot is GM-only — players fill in and use the agents the
  // GM adds, but can't grow (or shrink) the roster themselves.
  function addAgent(factionId) {
    if (!canEdit) return;
    const fac = factions.find((f) => f.id === factionId);
    const cap = Number(fac && fac.agentCap) || 0;
    const count = agents.filter((a) => a.factionId === factionId).length;
    if (count >= cap) return; // at or over the GM's cap — no new slot
    setAgents((as) => [...as, { id: uid("agt"), factionId, name: "", memberId: null, notes: "", systemId: null }]);
  }
  function patchAgent(id, p) {
    const a = agents.find((x) => x.id === id);
    if (!a || !canManageAgents(a.factionId)) return;
    // Location is a stricter permission than the rest of the card (see
    // canPlaceAgents) — a player who can manage their faction's agents but
    // hasn't been granted canMoveAgents can still edit name/notes/icon, just
    // not systemId. Belt-and-braces alongside the dropdowns only rendering
    // for players who already have this, same reasoning as onAgentSnap.
    if ("systemId" in p && !canPlaceAgents(a.factionId)) return;
    setAgents((as) => as.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }
  function removeAgent(id) {
    const a = agents.find((x) => x.id === id);
    if (!a || !canEdit) return; // GM-only, same as addAgent — players can't drop a roster slot

    setAgents((as) => as.filter((x) => x.id !== id));
    setOrders((os) => os.filter((o) => !(o.pieceType === "agent" && o.pieceId === id)));
    // An agent's outstanding action requests go with it — a resolved or pending
    // request pointing at an agent that no longer exists has nothing to resolve.
    setActions((acts) => acts.filter((a) => a.agentId !== id));
  }

  /* ---- move orders: a player plots a fleet's or agent's route through systems
     and commits it. Committing is a *proposal* — the piece doesn't move; it locks
     the path and the GM (who sees every faction's orders) resolves movement by
     hand. A piece has one order from its owning faction, plus — for a fleet — any
     number of *suggestions* filed by allied/vassal factions (one per suggester);
     the GM picks at resolution whether a suggestion overrides the owner's order.
     Editing replaces the author's own uncommitted order/suggestion for the piece. */
  function canOrderFor(factionId) {
    return viewer.seesAll || (viewer.kind === "player" && viewer.roleFactionId === factionId);
  }
  // A player may *suggest* a move for a fleet they don't own, as long as it belongs
  // to a friendly faction (an ally or a vassal — the same set friendlyFactionIds
  // grants fleet-position visibility to). Never for their own faction (that's a
  // plain order, canOrderFor above) and never the GM (who orders directly). The
  // GM decides at turn resolution whether a suggestion overrides the owner's move.
  function canSuggestFor(factionId) {
    if (viewer.seesAll) return false;
    if (viewer.kind !== "player" || !viewer.roleFactionId) return false;
    if (factionId === viewer.roleFactionId) return false;
    return friendlyFactionIds(viewer.roleFactionId, relations).has(factionId);
  }
  // The order the current routing selection is authoring: a faction's own order
  // for the piece, or — when suggesting — this viewer's own suggestion for it.
  // Distinct from another faction's order/suggestion for the same piece, which is
  // why the finder keys on suggestion + suggesterFactionId, not just the piece.
  function orderForRouting() {
    if (!routing) return null;
    const { type, id, suggestion, suggesterFactionId } = routing;
    return orders.find((o) => o.pieceType === type && o.pieceId === id
      && (suggestion ? (o.suggestion && o.suggesterFactionId === suggesterFactionId) : !o.suggestion)) || null;
  }
  // Whether this viewer is allowed to author the current routing selection —
  // canOrderFor for an own-faction order, canSuggestFor for a suggestion.
  function canAuthorRouting() {
    if (!routing) return false;
    return routing.suggestion ? canSuggestFor(routing.factionId) : canOrderFor(routing.factionId);
  }
  // Reopen an order as a draft: any edit un-marks it as ready (the GM's "ready"
  // signal should reflect the route as it stands now) and, for a suggestion,
  // clears the GM's acceptance so a changed proposal isn't silently still applied.
  const reopenDraft = (o) => ({ ...o, committed: false, committedAt: null, updatedAt: Date.now(),
    ...(o.suggestion ? { accepted: false } : {}) });
  // Ensure an uncommitted order exists for the routing selection and return it
  // through `mutate`. Creates it lazily (own order or suggestion, per routing).
  function upsertRoutingOrder(mutate) {
    if (!routing || !canAuthorRouting()) return;
    const { type, id, factionId, suggestion, suggesterFactionId } = routing;
    setOrders((os) => {
      const idx = os.findIndex((o) => o.pieceType === type && o.pieceId === id
        && (suggestion ? (o.suggestion && o.suggesterFactionId === suggesterFactionId) : !o.suggestion));
      if (idx === -1) {
        const base = { id: uid("ord"), factionId, pieceType: type, pieceId: id, path: [], committed: false, notes: "",
          ...(suggestion ? { suggestion: true, suggesterFactionId, accepted: false } : {}),
          createdBy: viewer.roleId ? { roleId: viewer.roleId, roleName: viewer.roleName } : null,
          updatedAt: Date.now(), committedAt: null };
        return [...os, mutate(base)];
      }
      return os.map((o, i) => (i === idx ? mutate(o) : o));
    });
  }
  // Select a piece for plotting. Owning it (or being the GM) plots a plain order;
  // otherwise, for a friendly fleet, plots a suggestion. The order itself is
  // created lazily on the first stop (addOrderStop), so merely selecting a piece
  // and changing your mind never leaves an empty order behind.
  function beginOrder(type, id, factionId) {
    if (canOrderFor(factionId)) {
      setRouting({ type, id, factionId, suggestion: false, suggesterFactionId: null });
    } else if (type === "fleet" && canSuggestFor(factionId)) {
      // Suggestions are for fleets only — agents are covert and never visible to
      // an ally, so there is nothing to suggest a route for.
      setRouting({ type, id, factionId, suggestion: true, suggesterFactionId: viewer.roleFactionId });
    }
  }
  // Append the next system stop to the routing piece's order, creating that order
  // on the first stop. No-op on an immediate repeat of the same stop.
  function addOrderStop(systemId) {
    if (!routing) return;
    upsertRoutingOrder((o) => {
      if (o.path[o.path.length - 1] === systemId) return o;
      return { ...reopenDraft(o), path: [...o.path, systemId] };
    });
  }
  // Free-text notes accompanying the routing piece's order (e.g. what it should
  // do once it arrives). Same "editing reopens it as a draft" rule as a stop.
  function setRoutingNotes(text) {
    if (!routing) return;
    upsertRoutingOrder((o) => ({ ...reopenDraft(o), notes: text }));
  }
  function undoOrderStop() {
    if (!routing || !canAuthorRouting()) return;
    const o = orderForRouting();
    if (!o || o.path.length === 0) return;
    setOrders((os) => os.map((x) => (x.id === o.id ? { ...reopenDraft(x), path: x.path.slice(0, -1) } : x)));
  }
  // Discard the routing piece's draft order entirely and drop the selection.
  function clearRoutingOrder() {
    if (!routing) return;
    const gone = orderForRouting();
    if (gone && canAuthorRouting()) setOrders((os) => os.filter((o) => o.id !== gone.id));
    setRouting(null);
  }
  // Mark the routing piece's order as ready (needs at least one stop). This only
  // signals the GM the player is done — it does NOT lock the order; the piece
  // stays selected and every stop remains editable, which flips it back to draft.
  function commitRoutingOrder() {
    if (!routing || !canAuthorRouting()) return;
    const o = orderForRouting();
    if (!o || o.path.length === 0) return;
    setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, committed: true, committedAt: Date.now(), updatedAt: Date.now() } : x)));
  }
  // GM: accept a suggested move for a fleet, so the turn advance applies it in
  // place of the owning faction's own order. Radio semantics per piece — accepting
  // one suggestion clears any sibling suggestion previously accepted for it.
  function acceptSuggestion(orderId) {
    if (!isGM) return;
    const target = orders.find((o) => o.id === orderId && o.suggestion);
    if (!target) return;
    setOrders((os) => os.map((o) => (
      (o.suggestion && o.pieceType === target.pieceType && o.pieceId === target.pieceId)
        ? { ...o, accepted: o.id === orderId } : o)));
  }
  // GM: revert to the owning faction's own order (or no move) for a piece, by
  // clearing whichever suggestion was accepted for it.
  function clearSuggestionAcceptance(pieceType, pieceId) {
    if (!isGM) return;
    setOrders((os) => os.map((o) => (
      (o.suggestion && o.pieceType === pieceType && o.pieceId === pieceId && o.accepted)
        ? { ...o, accepted: false } : o)));
  }

  /* ---- agent action requests: free-text things a player asks their agent to
     attempt, for the GM to adjudicate by hand. Each agent carries its own GM-set
     quota (agent.actionCap) counting every request it's ever raised, resolved or
     not; the player composes the text and flags whichever of their faction's
     modifiers they think bear on the outcome. Same own-faction gate as agents
     themselves — a player may raise/withdraw their own faction's, GM resolves any. */
  const actionsForAgent = (agentId) => actions.filter((a) => a.agentId === agentId);
  // Submit a completed request against an agent. Cap is counted per agent across
  // every request it holds (a resolved one still counts as spent), so this no-ops
  // once the agent is at its own actionCap.
  function submitAction(agentId, text, modifierIds) {
    const agent = agents.find((x) => x.id === agentId);
    if (!agent || !canManageAgents(agent.factionId)) return;
    const body = (text || "").trim();
    if (!body) return;
    const cap = Number(agent.actionCap) || 0;
    if (actionsForAgent(agentId).length >= cap) return; // agent has spent its quota
    setActions((acts) => [...acts, {
      id: uid("act"), factionId: agent.factionId, agentId, text: body,
      modifierIds: Array.isArray(modifierIds) ? modifierIds : [],
      status: "pending", resolution: "",
      createdBy: viewer.roleId ? { roleId: viewer.roleId, roleName: viewer.roleName } : null,
      createdAt: Date.now(), resolvedAt: null,
    }]);
  }
  // Pull a request back. A player may withdraw their own faction's while it's
  // still pending (freeing the slot); the GM may delete any, resolved or not.
  function removeAction(id) {
    const a = actions.find((x) => x.id === id);
    if (!a) return;
    const mayWithdraw = canManageAgents(a.factionId) && a.status === "pending";
    if (!isGM && !mayWithdraw) return;
    setActions((acts) => acts.filter((x) => x.id !== id));
  }
  // GM: record an adjudication and close the request. `resolution` is the
  // structured object the resolution tool builds — the roll, the modifiers it
  // applied, the success/failure outcome, and the GM's free-text ruling — so the
  // request itself preserves the full result, not just a sentence.
  //
  // `delayed`: the GM has ruled, but doesn't want the player to see it yet
  // (e.g. a covert action whose outcome shouldn't leak before the round ends).
  // Status goes to "delayed" instead of "resolved" — every player-facing check
  // keys off status === "resolved", so a delayed request still reads as pending
  // to its owner. It clears out of the GM's own unresolved queue immediately
  // (see the unresolved/resolved split in GMToolsView), and nextTurn() is what
  // finally flips it to "resolved" and reveals it, same moment it archives.
  function resolveAction(id, resolution, delayed) {
    if (!isGM) return;
    setActions((acts) => acts.map((a) => (a.id === id
      ? { ...a, status: delayed ? "delayed" : "resolved", resolution: resolution || null, resolvedAt: Date.now() } : a)));
  }
  // GM: send a resolved request back to the pending queue to re-adjudicate.
  function reopenAction(id) {
    if (!isGM) return;
    setActions((acts) => acts.map((a) => (a.id === id
      ? { ...a, status: "pending", resolvedAt: null } : a)));
  }
  // GM: fix a typo or reword the free-text ruling on an already-resolved
  // request without reopening it (which would drop it back to pending and
  // clear the roll/mods it was resolved with). Only meaningful for the
  // structured resolution shape; older plain-string resolutions aren't touched.
  function editActionResolution(id, text) {
    if (!isGM) return;
    setActions((acts) => acts.map((a) => (a.id === id && a.resolution && typeof a.resolution === "object"
      ? { ...a, resolution: { ...a.resolution, text } } : a)));
  }
  function editArchivedActionResolution(id, text) {
    if (!isGM) return;
    setArchivedActions((arch) => arch.map((a) => (a.id === id && a.resolution && typeof a.resolution === "object"
      ? { ...a, resolution: { ...a.resolution, text } } : a)));
  }
  // GM-only: flag a resolved request as narratively important — a private note
  // to self that never reaches a player's view (AgentsView never reads this
  // field) for future turn-summary tooling to pull from instead of re-reading
  // every ruling. Works on either pile: still in the live queue (resolved but
  // not yet archived) or already moved to Previous Actions.
  function setActionImportant(id, important) {
    if (!isGM) return;
    setActions((acts) => acts.map((a) => (a.id === id ? { ...a, important: !!important } : a)));
  }
  function setArchivedActionImportant(id, important) {
    if (!isGM) return;
    setArchivedActions((arch) => arch.map((a) => (a.id === id ? { ...a, important: !!important } : a)));
  }
  // GM: permanently delete an entry from a closed-out turn's Previous Actions
  // log (contrast removeAction, which acts on the live queue).
  function removeArchivedAction(id) {
    if (!isGM) return;
    setArchivedActions((arch) => arch.filter((x) => x.id !== id));
  }

  /* ---- turn advance: the GM's one bulk "resolve the round" button (GM Tools).
     Every *committed* move order — fleet or agent — lands its piece on the last
     stop in its path and is cleared; anything still a draft (uncommitted, or no
     stops) is left alone for next time. Every agent's *resolved* action requests
     move into archivedActions (GM Tools' per-faction "Previous Actions" tab) so
     the roll history isn't lost — same close-the-round idea as movement, just
     for the other queue. Requests still pending when the turn closes did NOT get
     a ruling, so they aren't archived — they stay in the live queue, stamped
     carriedOver so the UI can flag them as held over from an earlier turn. They
     still count against the agent's actionCap (nothing frees the slot until the
     GM rules on it or the player withdraws it) and remain withdrawable/resolvable
     exactly like a fresh request. */
  function nextTurn() {
    if (!isGM) return;
    // Every committed order is cleared at the end of the turn (a fresh turn starts
    // with a clean board), but only one order per piece actually *moves* it — the
    // owning faction's own, unless the GM has accepted an ally/vassal's suggestion
    // to override it (see effectiveMoveOrders).
    const ready = orders.filter((o) => o.committed && o.path.length > 0);
    const effective = effectiveMoveOrders(orders);
    const destFor = (type, id) => {
      const o = effective.find((x) => x.pieceType === type && x.pieceId === id);
      if (!o) return null;
      const dest = o.path[o.path.length - 1];
      return systems.some((s) => s.id === dest) ? dest : null;
    };
    const fleetMoves = fleets
      .map((f) => ({ f, dest: destFor("fleet", f.id) }))
      .filter((x) => x.dest);
    const agentMoves = agents
      .map((a) => ({ a, dest: destFor("agent", a.id) }))
      .filter((x) => x.dest);
    // Missions the GM resolved with "delay resolution" checked (see
    // resolveMission): the ruling exists but their survivors are still off the
    // fleet's books. Next Turn is what actually hands them back, in the same
    // fleets update as movement so neither clobbers the other.
    const delayedMissions = missions.filter((m) => m.status === "delayed");

    if (fleetMoves.length > 0 || delayedMissions.length > 0) {
      setFleets((fs) => {
        let next = fleetMoves.length > 0 ? fs.map((f) => {
          const m = fleetMoves.find((x) => x.f.id === f.id);
          return m ? { ...f, systemId: m.dest } : f;
        }) : fs;
        delayedMissions.forEach((m) => { next = returnDetachments(next, survivingDetachments(m)); });
        return next;
      });
    }
    if (agentMoves.length > 0) {
      setAgents((as) => as.map((a) => {
        const m = agentMoves.find((x) => x.a.id === a.id);
        return m ? { ...a, systemId: m.dest } : a;
      }));
    }
    if (ready.length > 0) setOrders((os) => os.filter((o) => !ready.includes(o)));

    // Strike-craft replenishment staged this turn (GM Tools: Replenish): apply the
    // top-ups to the carriers now and stamp the records revealed, which is what
    // surfaces the notice to each fleet's faction in Updates. A separate functional
    // setFleets composes cleanly with the movement one above.
    const stagedReplen = replenishments.filter(
      (r) => (r.turn || 0) === turnNumber && !r.revealedAt && (r.lines || []).length > 0);
    if (stagedReplen.length > 0) {
      setFleets((fs) => applyReplenishments(fs, stagedReplen));
      const revealedAt = Date.now();
      const revealedIds = new Set(stagedReplen.map((r) => r.id));
      setReplenishments((rs) => rs.map((r) => (revealedIds.has(r.id) ? { ...r, revealedAt } : r)));
    }

    const systemName = (id) => (systems.find((s) => s.id === id) || {}).name || "?";
    const lines = [];
    if (fleetMoves.length > 0 || agentMoves.length > 0) {
      lines.push("MOVEMENT");
      fleetMoves.forEach(({ f, dest }) => lines.push(`  Fleet ${f.name} → ${systemName(dest)}`));
      agentMoves.forEach(({ a, dest }) => {
        const fac = factions.find((x) => x.id === a.factionId);
        const member = fac && (fac.members || []).find((m) => m.id === a.memberId);
        lines.push(`  Agent ${member ? member.name : "Unassigned"} → ${systemName(dest)}`);
      });
    }
    if (actions.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("ACTIONS CLOSED OUT");
      agents.forEach((a) => {
        const own = actions.filter((x) => x.agentId === a.id);
        if (own.length === 0) return;
        const fac = factions.find((f) => f.id === a.factionId);
        const member = fac && (fac.members || []).find((m) => m.id === a.memberId);
        const label = member ? member.name : "Agent";
        own.forEach((x) => lines.push(`  ${label}: "${x.text}" — ${x.status === "resolved" || x.status === "delayed" ? "resolved" : "carried over, still pending"}`));
      });
    }
    // Delayed actions/missions (see resolveAction/resolveMission's `delayed`
    // flag) are ruled on but hidden from the player until this exact moment —
    // folding their status into "resolved" here is what reveals them, one turn
    // after the GM actually made the call.
    const resolvedMissionsNow = missions.filter((m) => m.status === "resolved" || m.status === "delayed");
    if (resolvedMissionsNow.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("SQUADRON MISSIONS RESOLVED");
      resolvedMissionsNow.forEach((m) => {
        const fleet = fleets.find((f) => f.id === m.fleetId);
        lines.push(`  ${fleet ? fleet.name : "Fleet"}: "${m.text}"`);
      });
    }
    if (stagedReplen.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("STRIKE CRAFT REPLENISHED");
      stagedReplen.forEach((r) => {
        const fleet = fleets.find((f) => f.id === r.fleetId);
        lines.push(`  ${fleet ? fleet.name : "Fleet"} @ ${systemName(r.systemId)}: ${replenishmentSummary(r)}`);
      });
    }
    // Project timers: only those the GM hasn't paused (autoDecrement) and that
    // still have turns left actually tick — a project already at 0 stays there
    // until the GM removes or resets it, rather than going negative.
    const tickingProjects = projects.filter((p) => p.autoDecrement !== false && (p.turnsRemaining || 0) > 0);
    if (tickingProjects.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("PROJECTS ADVANCED");
      tickingProjects.forEach((p) => {
        const fac = factions.find((f) => f.id === p.factionId);
        const remaining = Math.max(0, (p.turnsRemaining || 0) - 1);
        lines.push(`  ${fac ? fac.name : "?"}: "${p.name || "Untitled project"}" — ${remaining > 0 ? `${remaining} turn(s) left` : "complete"}`);
      });
      const tickingIds = new Set(tickingProjects.map((p) => p.id));
      setProjects((ps) => ps.map((p) => (tickingIds.has(p.id) ? { ...p, turnsRemaining: Math.max(0, (p.turnsRemaining || 0) - 1) } : p)));
    }
    // End-of-turn checks: the Ossite Surplus check runs at every system carrying
    // the ossite trait. Each system uses the check the GM reviewed this turn (or
    // one rolled here on the spot if the GM never opened the tab), and a passing
    // check hands its *current* controlling faction +1 Ossite Surplus. The award
    // follows whoever holds the system right now, so a mid-turn capture credits
    // the new owner. Uncontrolled (fac_none) systems roll but award nothing.
    const ossiteSystems = systems.filter((s) => s.hasOssite);
    if (ossiteSystems.length > 0) {
      const liveChecks = endTurnChecks.filter((c) => c.type === "ossite" && c.turn === turnNumber && !c.appliedAt);
      const bySystem = new Map(liveChecks.map((c) => [c.systemId, c]));
      const rolledHere = []; // checks for ossite systems the GM never had rolled
      const gains = new Map(); // factionId -> +Ossite Surplus this turn
      ossiteSystems.forEach((s) => {
        let check = bySystem.get(s.id);
        if (!check) {
          check = { id: uid("etc"), type: "ossite", turn: turnNumber, systemId: s.id,
            dice: roll2d6(), override: null, appliedAt: null, createdAt: Date.now() };
          rolledHere.push(check);
        }
        if (ossiteCheckPassed(check) && s.factionId && s.factionId !== "fac_none"
          && factions.some((f) => f.id === s.factionId)) {
          gains.set(s.factionId, (gains.get(s.factionId) || 0) + 1);
        }
      });
      if (gains.size > 0) {
        setResources((rs) => {
          let next = rs;
          for (const [factionId, amt] of gains) {
            const idx = next.findIndex((r) => r.factionId === factionId
              && (r.name || "").trim().toLowerCase() === OSSITE_RESOURCE_NAME.toLowerCase());
            next = idx >= 0
              ? next.map((r, i) => (i === idx ? { ...r, value: (r.value || 0) + amt } : r))
              : [...next, { id: uid("res"), factionId, name: OSSITE_RESOURCE_NAME, value: amt, text: "", createdAt: Date.now() }];
          }
          return next;
        });
        if (lines.length > 0) lines.push("");
        lines.push("END OF TURN CHECKS — OSSITE SURPLUS");
        for (const [factionId, amt] of gains) {
          const fac = factions.find((f) => f.id === factionId);
          lines.push(`  ${fac ? fac.name : "?"} +${amt} Ossite Surplus`);
        }
      }
      // Stamp the checks that just resolved (and any rolled here) as applied, so
      // they drop out of the live board and the fresh turn starts clean.
      const appliedAt = Date.now();
      const appliedIds = new Set(liveChecks.map((c) => c.id));
      setEndTurnChecks((cs) => [
        ...cs.map((c) => (appliedIds.has(c.id) ? { ...c, appliedAt } : c)),
        ...rolledHere.map((c) => ({ ...c, appliedAt })),
      ]);
    }
    if (lines.length > 0) addNote(`Turn advanced — ${new Date().toLocaleString()}\n${lines.join("\n")}`, "turn");
    if (actions.length > 0) {
      // A delayed action is folded into "resolved" here too — revealed to its
      // player and archived in the same step, same as a delayed mission below.
      const resolvedActions = actions.filter((a) => a.status === "resolved" || a.status === "delayed")
        .map((a) => (a.status === "delayed" ? { ...a, status: "resolved" } : a));
      const pendingActions = actions.filter((a) => a.status !== "resolved" && a.status !== "delayed");
      if (resolvedActions.length > 0) {
        const turnEndedAt = Date.now();
        // `turn` is the turn number that's closing out right now — the one the
        // GM's ruling actually happened on — not the one about to start.
        setArchivedActions((arch) => [...resolvedActions.map((a) => ({ ...a, turnEndedAt, turn: turnNumber })), ...arch]);
      }
      setActions(pendingActions.map((a) => (a.carriedOver ? a : { ...a, carriedOver: true })));
    }
    // Same close-the-round move as actions above: a resolved mission moves into
    // archivedMissions stamped with the turn that closed, so the Fleet tab only
    // ever shows the current turn's missions live; a still-pending one stays in
    // `missions` untouched (nothing to archive until the GM rules on it).
    if (resolvedMissionsNow.length > 0) {
      const turnEndedAt = Date.now();
      const revealed = resolvedMissionsNow.map((m) => (m.status === "delayed" ? { ...m, status: "resolved" } : m));
      setArchivedMissions((arch) => [...revealed.map((m) => ({ ...m, turnEndedAt, turn: turnNumber })), ...arch]);
      setMissions((ms) => ms.filter((m) => m.status !== "resolved" && m.status !== "delayed"));
    }
    // Stamp when the incoming turn began, so the Timeline tab can sort each wiki
    // article into the turn its date falls within. Upsert on the turn number
    // (replace any existing record) rather than append, so nothing can leave two
    // stamps for one turn; the GM can adjust these afterwards on the Timeline.
    const startingTurn = (Number(turnNumber) || 0) + 1;
    const startedAt = Date.now();
    setTurns((ts) => {
      const existing = ts.find((t) => t.turn === startingTurn); // keep a name the GM set ahead of time
      return [...ts.filter((t) => t.turn !== startingTurn), { id: existing?.id || uid("turn"), ...existing, turn: startingTurn, startedAt }];
    });
    setTurnNumber((n) => (Number(n) || 0) + 1);
  }

  /* ---- turn boundaries: the GM sets or adjusts when a past turn began, and can
     give the turn a name — both from the Timeline tab. The start time resorts
     articles into the right turn; the name is just a label the Timeline shows.
     Both upsert on the turn number (same as nextTurn's stamp above) through
     upsertTurn, which merges the patch onto any existing record so setting one
     field never drops the other. A record left with neither a start time nor a
     name is removed entirely — that's how clearing the last of the two works. */
  function upsertTurn(turn, patch) {
    if (!isGM) return;
    const n = Number(turn);
    if (!Number.isFinite(n)) return;
    setTurns((ts) => {
      const existing = ts.find((t) => t.turn === n);
      const rest = ts.filter((t) => t.turn !== n);
      const merged = { id: existing?.id || uid("turn"), ...existing, ...patch, turn: n };
      const name = (merged.name || "").trim();
      const hasStart = Number.isFinite(merged.startedAt) && merged.startedAt > 0;
      if (!hasStart && !name) return rest; // nothing left worth keeping
      return [...rest, { ...merged, name }];
    });
  }
  const setTurnStart = (turn, startedAt) => upsertTurn(turn, { startedAt });
  const setTurnName = (turn, name) => upsertTurn(turn, { name });

  /* ---- squadron missions: a player commits some of a fleet's fighters/bombers
     (whole or partial squadrons) to a free-text mission, for the GM to adjudicate
     against the mission odds table. Committing pulls the craft straight out of
     their squadrons' counts — that's what makes them unavailable for another
     mission. Submitting locks it in: unlike a move order, a player cannot pull a
     squadron mission back once it's sent, only the GM can (see removeMission). */
  function submitMission(fleetId, detachments, text) {
    const fleet = fleets.find((f) => f.id === fleetId);
    if (!fleet || !canOrderFor(fleet.factionId)) return;
    const body = (text || "").trim();
    if (!body) return;
    // Re-derive each detachment against the fleet as it stands right now and clamp
    // to what's actually available, rather than trusting counts the composer UI
    // computed from a possibly-stale render.
    const clean = (detachments || []).map((d) => {
      const ship = fleet.ships.find((s) => s.id === d.shipId);
      const sq = ship && squadronsOf(ship).find((q) => q.id === d.squadronId);
      if (!sq) return null;
      const avail = Number(sq.count) || 0;
      const count = Math.min(avail, Math.max(0, Math.floor(Number(d.count) || 0)));
      return count > 0 ? { shipId: ship.id, squadronId: sq.id, model: sq.model || "", count } : null;
    }).filter(Boolean);
    if (clean.length === 0) return;
    setFleets((fs) => commitDetachments(fs, fleetId, clean));
    setMissions((ms) => [...ms, {
      id: uid("msn"), factionId: fleet.factionId, fleetId, text: body,
      detachments: clean, status: "pending", resolution: null,
      createdBy: viewer.roleId ? { roleId: viewer.roleId, roleName: viewer.roleName } : null,
      createdAt: Date.now(), resolvedAt: null,
    }]);
  }
  // GM only — a submitted mission is locked in, so there is no player-side
  // withdraw (contrast removeAction, which a player can pull back while pending).
  // Deleting a still-pending one returns its committed craft, since nothing
  // happened to them yet; a resolved one's craft already came home at
  // resolution, so deleting it returns nothing.
  function removeMission(id) {
    if (!isGM) return;
    const m = missions.find((x) => x.id === id);
    if (!m) return;
    if (m.status === "pending") setFleets((fs) => returnDetachments(fs, m.detachments || []));
    // A delayed mission already has a ruling (see resolveMission), but its
    // survivors haven't been handed back yet — deleting it before Next Turn
    // reveals it is the only way to return them early, so do that here rather
    // than stranding those craft off the fleet's books forever.
    else if (m.status === "delayed") setFleets((fs) => returnDetachments(fs, survivingDetachments(m)));
    setMissions((ms) => ms.filter((x) => x.id !== id));
  }
  // GM: permanently delete an entry from a closed-out turn's archive (contrast
  // removeMission, which acts on the live queue). Always resolved by the time it
  // gets here, so there are no craft left to return.
  function removeArchivedMission(id) {
    if (!isGM) return;
    setArchivedMissions((arch) => arch.filter((x) => x.id !== id));
  }
  // Recomputes a resolved (or delayed) mission's surviving detachments from its
  // stored resolution — the same per-squadron split resolveMission applies at
  // resolve time, factored out so nextTurn (revealing a delayed mission) and
  // removeMission (cancelling one early) can redo it without re-deriving it.
  function survivingDetachments(m) {
    const resolution = m.resolution;
    const cas = Number(resolution && resolution.casualtyPct) || 0;
    const lossMap = new Map((resolution && resolution.detachmentLosses || []).map((d) => [d.squadronId, d.loss]));
    return (m.detachments || []).map((d) => {
      const loss = lossMap.has(d.squadronId)
        ? Math.max(0, Math.min(d.count, Math.floor(Number(lossMap.get(d.squadronId)) || 0)))
        : Math.round(d.count * (cas / 100));
      return { ...d, count: d.count - loss };
    });
  }
  // GM: adjudicate a pending mission against the odds table (see missionOdds.js)
  // and return the survivors in the same step. The panel's resolution tool spreads
  // `casualtyPct` evenly across detachments by default but lets the GM tweak exact
  // per-squadron losses (resolution.detachmentLosses) against a percentage tracker
  // before committing — that exact split, not a recomputed uniform one, is what's
  // applied here, so ships the GM marked destroyed never come back to their carrier.
  //
  // `delayed`: same idea as resolveAction's — the GM has rolled it, but the craft
  // stay off the fleet's books and the mission keeps reading as unresolved to its
  // owner until nextTurn() reveals it and actually returns the survivors.
  function resolveMission(id, resolution, delayed) {
    if (!isGM) return;
    const m = missions.find((x) => x.id === id);
    if (!m || m.status !== "pending") return;
    const next = { ...m, status: delayed ? "delayed" : "resolved", resolution: resolution || null, resolvedAt: Date.now() };
    if (!delayed) setFleets((fs) => returnDetachments(fs, survivingDetachments(next)));
    setMissions((ms) => ms.map((x) => (x.id === id ? next : x)));
  }
  // GM: fix up a resolved/delayed mission's outcome text after the fact (typo,
  // added detail) without touching the roll, grade, or casualty split — those
  // drive survivingDetachments, so leaving them alone means this never
  // re-triggers a craft hand-back. `archived` picks which pile to patch, since
  // a resolved mission may already have moved from `missions` into
  // `archivedMissions` by nextTurn.
  function editMissionResolutionText(id, archived, text) {
    if (!isGM) return;
    const patch = (m) => (m.id === id && m.resolution ? { ...m, resolution: { ...m.resolution, text: text || "" } } : m);
    if (archived) setArchivedMissions((arch) => arch.map(patch));
    else setMissions((ms) => ms.map(patch));
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

  // A codex "characters"/"locations" entry's `factionId` is the source of truth
  // for that character's/system's faction once the entry is live — this is what
  // makes the politics-view member or map system for it exist and follow along,
  // rather than the two being maintained by hand in two places. Only called for
  // published entries (approve/publish, or an edit to one already live), so a
  // draft or pending submission never spawns a visible node.
  function syncFactionNode(entry) {
    if (!entry || !entry.factionId) return;
    if (entry.category === "characters") {
      setFactions((fx) => {
        let from = null, member = null;
        for (const f of fx) {
          const m = (f.members || []).find((m) => m.wikiId === entry.id);
          if (m) { from = f; member = m; break; }
        }
        if (from && from.id === entry.factionId) return fx; // already the right faction
        if (!fx.some((f) => f.id === entry.factionId)) return fx; // target faction doesn't exist
        if (member) {
          // Move the existing node to its new faction rather than orphaning it.
          return fx.map((f) => {
            if (f.id === from.id) return { ...f, members: f.members.filter((m) => m.id !== member.id) };
            if (f.id === entry.factionId) return { ...f, members: [...(f.members || []), member] };
            return f;
          });
        }
        const m = { id: uid("mem"), name: entry.title || "New Character", kind: "character", role: "", wikiId: entry.id, star: false };
        return fx.map((f) => (f.id === entry.factionId ? { ...f, members: [...(f.members || []), m] } : f));
      });
    } else if (entry.category === "locations") {
      setSystems((ss) => {
        const linked = ss.find((s) => s.wikiId === entry.id);
        if (linked) return linked.factionId === entry.factionId
          ? ss : ss.map((s) => (s.id === linked.id ? { ...s, factionId: entry.factionId } : s));
        // No system linked yet — create one near the map origin; the GM drags it
        // into place, same as any freshly-added system.
        const jitter = () => Math.random() * 160 - 80;
        return [...ss, { id: uid("sys"), name: entry.title || "New System", x: jitter(), y: jitter(),
          factionId: entry.factionId, wikiId: entry.id, markers: [] }];
      });
    }
  }

  // A GM entry starts life as a draft: `status: "draft"` keeps it out of every
  // non-GM view (see canSeeSubmission) and out of Updates until the GM hits
  // Publish, so a half-written page never leaks to players. No publishedAt yet —
  // that gets stamped at publish time, which is also the Updates baseline.
  function addWikiEntry(category) {
    if (!canEdit) return;
    const now = Date.now();
    const entry = { id: uid("wk"), category, title: "New Entry", body: "", createdAt: now, updatedAt: now, status: "draft" };
    setWiki((w) => [...w, entry]);
    setSelectedWikiId(entry.id);
  }
  // create an entry and return its id — used by codex links to spin up a page
  // pre-titled from the element (system, faction, character…) being linked. Also
  // a draft until published, so linking an element never publishes a stub page.
  function createEntry(category, title) {
    if (!canEdit) return null;
    const now = Date.now();
    const entry = { id: uid("wk"), category, title: title || "New Entry", body: "", createdAt: now, updatedAt: now, status: "draft" };
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
  // jump the other way: from a fleet's roster straight to the map, switched to
  // Orders mode with that fleet already selected for routing and the view
  // centered on it. The actual centering happens in the effect below, once the
  // map tab is actually up and its canvas has a real size to center within.
  function orderFleetMove(fleetId) {
    const f = fleets.find((x) => x.id === fleetId);
    // Own it (or GM) → plot a plain order; friendly → plot a suggestion. beginOrder
    // sorts out which; bail only if the viewer can do neither.
    if (!f || !(canOrderFor(f.factionId) || canSuggestFor(f.factionId))) return;
    navigate(() => ({ tab: "map" }));
    setMode("orders");
    setLinkSource(null);
    beginOrder("fleet", fleetId, f.factionId);
    setFocusMapFleetId(fleetId);
    setAccessOpen(false);
    setMobileMenuOpen(false);
  }
  // jump from a top-bar resource/tracker badge straight to the Assets tab,
  // that entry's faction, and the subtab it actually lives on.
  function goToAssets(factionId, subtab) {
    navigate(() => ({ tab: "assets", assetFactionId: factionId, assetSubtab: subtab }));
    setAccessOpen(false);
    setMobileMenuOpen(false);
  }
  // jump from an agent's map popup, or its character's politics popup, straight
  // to the Agents tab with that agent open and ready to raise a request.
  function goToAgentAction(agentId, factionId) {
    navigate(() => ({ tab: "agents", agentFactionId: factionId, agentId }));
    setSelAgent(null);
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
    setWiki((w) => w.map((e) => (e.id === id ? { ...e, ...p, updatedAt: Date.now() } : e)));
    // Reassigning the faction on an already-live entry should move its politics
    // node / map system too, not just leave the codex saying something new.
    if ("factionId" in p) {
      const e = wiki.find((x) => x.id === id);
      if (e && e.status !== "draft" && e.status !== "pending") syncFactionNode({ ...e, ...p });
    }
  }
  function deleteWikiEntry(id) {
    if (!canEdit) return;
    setWiki((w) => w.filter((e) => e.id !== id));
    // replace, not push: Back should not offer to reopen an entry that's gone
    setSelectedWikiId((cur) => (cur === id ? null : cur), { replace: true });
  }
  // A signed-in player starts a submission — same shape as addWikiEntry, but
  // marked pending and stamped with who sent it, so the GM can review it
  // before it's a real codex page.
  function submitWikiEntry(category) {
    if (viewer.kind !== "player") return null;
    const now = Date.now();
    const entry = { id: uid("wk"), category, title: "New Entry", body: "", createdAt: now, updatedAt: now,
      status: "pending", submittedBy: { roleId: viewer.roleId, roleName: viewer.roleName }, submittedAt: now };
    setWiki((w) => [...w, entry]);
    setSelectedWikiId(entry.id);
    return entry.id;
  }
  // The one write path a non-GM viewer has onto shared data: editing their
  // own submission, and only while the GM hasn't acted on it yet.
  function patchOwnWikiEntry(id, p) {
    if (viewer.kind !== "player") return;
    setWiki((w) => w.map((e) => {
      if (e.id !== id || e.status !== "pending" || !e.submittedBy || e.submittedBy.roleId !== viewer.roleId) return e;
      return { ...e, ...p, updatedAt: Date.now() };
    }));
  }
  // A player proposes a change to an existing, already-live entry. Rather than
  // touch the live page (which everyone still reads), this stages a separate
  // pending copy carrying the player's editable fields and an `editOf` pointer
  // back to the original. The live entry is untouched until the GM approves.
  // Reopens an existing proposal instead of stacking a second one.
  function proposeWikiEdit(id) {
    if (viewer.kind !== "player") return null;
    const orig = wiki.find((e) => e.id === id);
    // Only real, visible, non-pending entries can be proposed against.
    if (!orig || orig.status === "pending" || !canSee(orig, viewer)) return null;
    const existing = wiki.find((e) => e.status === "pending" && e.editOf === id
      && e.submittedBy && e.submittedBy.roleId === viewer.roleId);
    if (existing) { setSelectedWikiId(existing.id); return existing.id; }
    const entry = { id: uid("wk"), category: orig.category, title: orig.title || "", body: orig.body || "", createdAt: Date.now(), updatedAt: Date.now(),
      ...(orig.image ? { image: orig.image } : {}),
      ...(orig.factionId ? { factionId: orig.factionId } : {}),
      status: "pending", editOf: id,
      submittedBy: { roleId: viewer.roleId, roleName: viewer.roleName }, submittedAt: Date.now() };
    setWiki((w) => [...w, entry]);
    setSelectedWikiId(entry.id);
    return entry.id;
  }
  // Pull a submission (new entry or change proposal) back before the GM has
  // reviewed it. Same ownership gate as patchOwnWikiEntry.
  function withdrawWikiEntry(id) {
    if (viewer.kind !== "player") return;
    const e = wiki.find((x) => x.id === id);
    if (!e || e.status !== "pending" || !e.submittedBy || e.submittedBy.roleId !== viewer.roleId) return;
    setWiki((w) => w.filter((x) => x.id !== id));
    setSelectedWikiId((cur) => (cur === id ? null : cur), { replace: true });
  }
  // GM: publish a pending submission (after any edits made via patchWikiEntry)
  // as a normal live entry. Rejecting one needs no function of its own — it's
  // just deleteWikiEntry, same as removing any other entry.
  function approveWikiEntry(id) {
    if (!canEdit) return;
    const e = wiki.find((x) => x.id === id);
    if (!e) return;
    // A change proposal (editOf set): fold its edited fields into the live entry
    // it targets, then drop the proposal — so approving a change never spawns a
    // duplicate page. If the original was deleted meanwhile, keep the content by
    // publishing the proposal as a standalone entry rather than losing it.
    if (e.editOf) {
      const target = wiki.find((x) => x.id === e.editOf);
      if (!target) {
        const now = Date.now();
        setWiki((w) => w.map((x) => (x.id === id ? { ...x, status: "approved", editOf: undefined, publishedAt: now, updatedAt: now } : x)));
        syncFactionNode({ ...e, status: "approved" });
        return;
      }
      const patch = { title: e.title, body: e.body, category: e.category, image: e.image, updatedAt: Date.now(),
        factionId: e.factionId !== undefined ? e.factionId : target.factionId };
      setWiki((w) => w
        .map((x) => (x.id === e.editOf ? { ...x, ...patch } : x))
        .filter((x) => x.id !== id));
      // The proposal is gone; land the GM on the entry they just updated.
      setSelectedWikiId((cur) => (cur === id ? e.editOf : cur), { replace: true });
      syncFactionNode({ ...target, ...patch });
      return;
    }
    const now = Date.now();
    setWiki((w) => w.map((x) => (x.id === id ? { ...x, status: "approved", publishedAt: now, updatedAt: now } : x)));
    syncFactionNode({ ...e, status: "approved" });
  }

  // GM: publish a draft entry. Clearing `status` makes it a plain live page, and
  // stamping publishedAt/updatedAt to now makes it surface fresh in every
  // faction's Updates from this moment — not from whenever it was first drafted.
  function publishWikiEntry(id) {
    if (!canEdit) return;
    const now = Date.now();
    const e = wiki.find((x) => x.id === id);
    setWiki((w) => w.map((e) => (e.id === id ? { ...e, status: undefined, publishedAt: now, updatedAt: now } : e)));
    if (e) syncFactionNode({ ...e, status: undefined });
  }
  // GM: pull a live entry back to a draft, hiding it from players again while it
  // gets reworked. Publishing it afterwards re-stamps and re-announces it.
  function unpublishWikiEntry(id) {
    if (!canEdit) return;
    setWiki((w) => w.map((e) => (e.id === id ? { ...e, status: "draft" } : e)));
  }
  // GM: publish a draft (or settle edits just made to an already-live entry)
  // without pinging players' Updates feed. Rather than fight the "new until
  // seen" rule in unseenArticles, this seeds every faction's read receipt for
  // the entry at "now" — so the seenAt-vs-updatedAt check finds nothing unread,
  // exactly as if every faction had already opened the page themselves.
  function publishWikiEntryQuietly(id) {
    if (!canEdit) return;
    const now = Date.now();
    const e = wiki.find((x) => x.id === id);
    if (!e) return;
    if (e.status === "draft") {
      setWiki((w) => w.map((x) => (x.id === id ? { ...x, status: undefined, publishedAt: x.publishedAt || now } : x)));
      syncFactionNode({ ...e, status: undefined });
    }
    setWikiReads((reads) => {
      let next = reads;
      factions.forEach((f) => {
        const rid = `read_${f.id}_${id}`;
        const receipt = { id: rid, factionId: f.id, wikiId: id, seenAt: now };
        next = next.some((r) => r.id === rid) ? next.map((r) => (r.id === rid ? receipt : r)) : [...next, receipt];
      });
      return next;
    });
  }

  // A receipt belongs to a faction rather than a person: once one member reads
  // an article, it is no longer new for that faction's shared briefing view.
  function markWikiSeen(entry) {
    const factionId = viewer.roleFactionId;
    if (!factionId || !entry || entry.status === "pending") return;
    const latest = entry.updatedAt || entry.createdAt || entry.publishedAt || 0;
    setWikiReads((reads) => {
      const id = `read_${factionId}_${entry.id}`;
      const existing = reads.find((r) => r.id === id);
      if (existing && existing.seenAt >= latest) return reads;
      const receipt = { id, factionId, wikiId: entry.id, seenAt: Date.now() };
      return existing ? reads.map((r) => r.id === id ? receipt : r) : [...reads, receipt];
    });
  }

  // Same receipt idea as markWikiSeen, but keyed off when the GM resolved the
  // request rather than an edit timestamp — a receipt only counts once it's at
  // least as fresh as the resolution it's acknowledging.
  function markActionSeen(action) {
    const factionId = viewer.roleFactionId;
    if (!factionId || !action || action.status !== "resolved") return;
    const latest = action.resolvedAt || 0;
    setActionReads((reads) => {
      const id = `read_${factionId}_${action.id}`;
      const existing = reads.find((r) => r.id === id);
      if (existing && existing.seenAt >= latest) return reads;
      const receipt = { id, factionId, actionId: action.id, seenAt: Date.now() };
      return existing ? reads.map((r) => r.id === id ? receipt : r) : [...reads, receipt];
    });
  }
  function acknowledgeAllActionUpdates() {
    const factionId = viewer.roleFactionId;
    if (!factionId) return;
    const now = Date.now();
    setActionReads((reads) => {
      let next = reads;
      unseenResolvedActions.forEach((action) => {
        const latest = action.resolvedAt || 0;
        const id = `read_${factionId}_${action.id}`;
        const existing = next.find((r) => r.id === id);
        if (existing && existing.seenAt >= latest) return;
        const receipt = { id, factionId, actionId: action.id, seenAt: now };
        next = existing ? next.map((r) => (r.id === id ? receipt : r)) : [...next, receipt];
      });
      return next;
    });
  }
  function markMissionSeen(mission) {
    const factionId = viewer.roleFactionId;
    if (!factionId || !mission || mission.status !== "resolved") return;
    const latest = mission.resolvedAt || 0;
    setMissionReads((reads) => {
      const id = `read_${factionId}_${mission.id}`;
      const existing = reads.find((r) => r.id === id);
      if (existing && existing.seenAt >= latest) return reads;
      const receipt = { id, factionId, missionId: mission.id, seenAt: Date.now() };
      return existing ? reads.map((r) => r.id === id ? receipt : r) : [...reads, receipt];
    });
  }
  function acknowledgeAllMissionUpdates() {
    const factionId = viewer.roleFactionId;
    if (!factionId) return;
    const now = Date.now();
    setMissionReads((reads) => {
      let next = reads;
      unseenResolvedMissions.forEach((mission) => {
        const latest = mission.resolvedAt || 0;
        const id = `read_${factionId}_${mission.id}`;
        const existing = next.find((r) => r.id === id);
        if (existing && existing.seenAt >= latest) return;
        const receipt = { id, factionId, missionId: mission.id, seenAt: now };
        next = existing ? next.map((r) => (r.id === id ? receipt : r)) : [...next, receipt];
      });
      return next;
    });
  }
  // Same acknowledge model as missions above, against replenishmentReads — a
  // record's revealedAt (set by nextTurn) is the "resolved at" the receipt races.
  function markReplenishmentSeen(record) {
    const factionId = viewer.roleFactionId;
    if (!factionId || !record || !record.revealedAt) return;
    const latest = record.revealedAt || 0;
    setReplenishmentReads((reads) => {
      const id = `read_${factionId}_${record.id}`;
      const existing = reads.find((r) => r.id === id);
      if (existing && existing.seenAt >= latest) return reads;
      const receipt = { id, factionId, replenishmentId: record.id, seenAt: Date.now() };
      return existing ? reads.map((r) => r.id === id ? receipt : r) : [...reads, receipt];
    });
  }
  function acknowledgeAllReplenishmentUpdates() {
    const factionId = viewer.roleFactionId;
    if (!factionId) return;
    const now = Date.now();
    setReplenishmentReads((reads) => {
      let next = reads;
      unseenReplenishments.forEach((record) => {
        const latest = record.revealedAt || 0;
        const id = `read_${factionId}_${record.id}`;
        const existing = next.find((r) => r.id === id);
        if (existing && existing.seenAt >= latest) return;
        const receipt = { id, factionId, replenishmentId: record.id, seenAt: now };
        next = existing ? next.map((r) => (r.id === id ? receipt : r)) : [...next, receipt];
      });
      return next;
    });
  }

  /* ------------------------------------------------ map gesture handlers (mode-aware click/tap/drop routing) */
  function onSystemTap(id) {
    if (mode === "orders") { addOrderStop(id); return; } // plotting a route — a system is the next stop
    if (mode === "link") {
      if (!editingEnabled) { setLinkSource(null); return; }
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
    if (mode === "orders") { // select this fleet to plot its route
      const f = fleets.find((x) => x.id === id);
      if (f) beginOrder("fleet", id, f.factionId);
      return;
    }
    if (mode === "link") return;
    setSelSystem(null); setSelFleet(id); setSelAgent(null);
  }
  function onAgentTap(id) {
    const a = agents.find((x) => x.id === id);
    if (!a) return;
    if (mode === "orders") { beginOrder("agent", id, a.factionId); return; }
    if (mode === "link") return;
    setSelSystem(null); setSelFleet(null); setSelAgent(id);
  }
  // Fleets are hard-locked to systems — dropped within range of a system it
  // snaps there, otherwise it reverts to whichever system it was dragged from
  // (never left floating at an arbitrary point).
  function onFleetSnap(id, systemsSnapshot, origSystemId) {
    if (!editingEnabled) return;
    setFleets((fs) => fs.map((f) => {
      if (f.id !== id) return f;
      let best = null, bestD = 62; // world units
      for (const s of systemsSnapshot) {
        const dd = Math.hypot(s.x - f.x, s.y - f.y);
        if (dd < bestD) { bestD = dd; best = s; }
      }
      return { ...f, systemId: best ? best.id : origSystemId };
    }));
  }
  // Same idea as onFleetSnap, but permission is per-agent (own faction, or the
  // GM), not the single global canEdit flag a fleet drag checks — see
  // canPlaceAgents. Also hard-locked to systems: no system in range reverts
  // the agent to the system it was dragged from rather than leaving it
  // floating at that world position.
  function onAgentSnap(id, systemsSnapshot, origSystemId) {
    const agent = agents.find((a) => a.id === id);
    if (!agent || !canPlaceAgents(agent.factionId)) return;
    setAgents((as) => as.map((a) => {
      if (a.id !== id) return a;
      let best = null, bestD = 62; // world units
      for (const s of systemsSnapshot) {
        const dd = Math.hypot(s.x - a.x, s.y - a.y);
        if (dd < bestD) { bestD = dd; best = s; }
      }
      return { ...a, systemId: best ? best.id : origSystemId };
    }));
  }
  function onDeselectAll() { setSelSystem(null); setSelFleet(null); setSelAgent(null); setLinkSource(null); }

  const mapInt = useMapInteractions({
    activeTab, mode, canEdit: editingEnabled,
    view, setView,
    systems, setSystems,
    fleets, setFleets,
    setAgents,
    strokes, setStrokes,
    drawColor: T.accent, drawWidth: 3,
    onSystemTap, onFleetTap,
    onFleetSnap,
    onAgentTap, onAgentSnap,
    onShipDrop: moveShip,
    onDeselectAll,
    onLinkBackgroundClick: () => setLinkSource(null),
    onDoubleClickAddSystem: addSystemAt,
  });

  /* ------------------------------------------------ visibility-filtered views (what non-GM viewers render).
     The full arrays stay in state; only the GM/open mode writes, so a narrow player view never overwrites the master. */
  const displayWiki = useMemo(
    () => (viewer.seesAll ? wiki : wiki.filter((e) => canSee(e, viewer) && canSeeSubmission(e, viewer))),
    [wiki, viewer]
  );
  useEffect(() => {
    if (activeTab !== "codex" || !selectedWikiId) return;
    markWikiSeen(displayWiki.find((e) => e.id === selectedWikiId));
  }, [activeTab, selectedWikiId, displayWiki, viewer.roleFactionId]);
  // GM asks: batch version of markWikiSeen so "Acknowledge all" doesn't fire
  // one setState per article — same receipt shape, single state update.
  function acknowledgeAllUpdates() {
    const factionId = viewer.roleFactionId;
    if (!factionId) return;
    const now = Date.now();
    setWikiReads((reads) => {
      let next = reads;
      unseenArticles.forEach((entry) => {
        const latest = entry.updatedAt || entry.createdAt || entry.publishedAt || 0;
        const id = `read_${factionId}_${entry.id}`;
        const existing = next.find((r) => r.id === id);
        if (existing && existing.seenAt >= latest) return;
        const receipt = { id, factionId, wikiId: entry.id, seenAt: now };
        next = existing ? next.map((r) => (r.id === id ? receipt : r)) : [...next, receipt];
      });
      return next;
    });
  }
  const unseenArticles = useMemo(() => {
    const factionId = viewer.roleFactionId;
    if (!factionId) return [];
    // displayWiki already drops drafts for non-GM viewers; the extra guard keeps
    // an unpublished draft out of Updates regardless of how this list is derived.
    return displayWiki.filter((e) => e.status !== "pending" && e.status !== "draft" && (e.updatedAt || e.createdAt)).filter((e) => {
      const seen = wikiReads.find((r) => r.factionId === factionId && r.wikiId === e.id);
      return !seen || seen.seenAt < (e.updatedAt || e.createdAt || e.publishedAt || 0);
    }).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  }, [displayWiki, wikiReads, viewer.roleFactionId]);
  const currentFaction = factions.find((f) => f.id === viewer.roleFactionId) || null;
  // GM-only: how many submissions are waiting on them, for the Codex tab badge.
  // Only entries the player has flagged "ready" count — drafts still being written don't.
  const pendingWikiCount = useMemo(() => wiki.filter((e) => e.status === "pending" && e.ready).length, [wiki]);
  // GM-only: how many agent action requests are waiting to be resolved, for the
  // GM Tools tab badge.
  // Delayed requests already have a GM ruling (see resolveAction) — they're not
  // waiting on anything, just holding it back from the player, so they don't
  // count toward "needs the GM's attention" here.
  const pendingActionCount = useMemo(
    () => actions.filter((a) => a.status !== "resolved" && a.status !== "delayed").length, [actions]);
  // GM-only: how many squadron mission requests are waiting to be resolved,
  // folded into the same GM Tools tab badge as agent action requests.
  const pendingMissionCount = useMemo(
    () => missions.filter((m) => m.status !== "resolved" && m.status !== "delayed").length, [missions]);
  // Fleet positions are gated both by faction (a player sees their own faction's
  // fleets plus allies'/vassals') and by the GM's public switch — see visibleFleets.
  const displayFleets = useMemo(
    () => visibleFleets(fleets, viewer, { relations, fleetsPublic }),
    [fleets, viewer, relations, fleetsPublic]
  );

  /* ------------------------------------------------ derived fleet positions.
     Grouped over displayFleets — the fleets THIS viewer can actually see — not
     the full fleet list. A fleet hidden from the viewer must not occupy a slot
     in a system's fan-out: if it did, the gap it left between the visible fleets
     would let the viewer infer a hidden fleet is parked there. */
  const fleetPos = useMemo(() => {
    const grouping = {};
    displayFleets.forEach((f) => { if (f.systemId) (grouping[f.systemId] = grouping[f.systemId] || []).push(f.id); });
    const out = {};
    displayFleets.forEach((f) => {
      if (f.systemId) {
        const sys = systems.find((s) => s.id === f.systemId);
        if (sys) {
          const arr = grouping[f.systemId]; const idx = arr.indexOf(f.id); const n = arr.length;
          const ring = Math.floor(idx / 6); const idxInRing = idx % 6;
          const countInRing = Math.min(6, n - ring * 6);
          const R = 46 + ring * 26;
          // Right-hand semicircle: top (-90°) through east (0°) to bottom (+90°),
          // so fleets never overlap the agent column that hugs the system's left side.
          const ang = countInRing <= 1 ? 0 : -Math.PI / 2 + idxInRing * (Math.PI / (countInRing - 1));
          out[f.id] = { x: sys.x + Math.cos(ang) * R, y: sys.y + Math.sin(ang) * R };
          return;
        }
      }
      out[f.id] = { x: f.x, y: f.y };
    });
    return out;
  }, [displayFleets, systems]);

  // Consumes focusMapFleetId (set by orderFleetMove above) once the map tab is
  // actually mounted: reads the canvas's real DOM size directly rather than
  // mapInt.containerSize, since that state update from the map's own mount/resize
  // effect hasn't necessarily landed yet in this same pass.
  useEffect(() => {
    if (!focusMapFleetId || activeTab !== "map") return;
    const pos = fleetPos[focusMapFleetId];
    const el = mapInt.mapRef.current;
    if (!pos || !el) return;
    const scale = Math.min(MAX_ZOOM, Math.max(view.scale, 1.6));
    setView({ scale, ox: el.clientWidth / 2 - pos.x * scale, oy: el.clientHeight / 2 - pos.y * scale });
    setFocusMapFleetId(null);
  }, [focusMapFleetId, activeTab, fleetPos]);

  // Agents and move orders are strictly own-faction (the GM sees all) — see
  // visibleAgents/visibleOrders. Unlike fleets, allies never see them.
  const displayAgents = useMemo(() => visibleAgents(agents, viewer), [agents, viewer]);

  /* ------------------------------------------------ derived agent positions.
     Agents sit at a system, stacked in a column just to its left so they never
     cover the system name (which hangs below the plate) or the fleets that fan
     out around it — wrapping to a further-left column after MAX_PER_COL so a
     busy system doesn't run a column of agents off past its neighbors. Both
     agents and fleets are hard-locked to systems: dragging one off any system
     (see onAgentSnap/onFleetSnap below) reverts it to the system it was
     dragged from rather than leaving it floating. Only an agent that has never
     been placed (no systemId) has no map position at all.
     Grouped over displayAgents — the agents THIS viewer can see (own faction
     only) — not the full list, for the same reason as fleetPos above: an agent
     hidden from the viewer must not occupy a slot in a system's column, or the
     gap it left would betray that a covert agent is parked there. */
  const agentPos = useMemo(() => {
    const grouping = {};
    displayAgents.forEach((a) => { if (a.systemId) (grouping[a.systemId] = grouping[a.systemId] || []).push(a.id); });
    const out = {};
    // world units: how far left the first column sits, the row pitch, the column
    // pitch, and how many agents stack in a column before wrapping to a new one
    // (further left again) instead of running off past the system's name.
    const COL_X = 36, ROW_GAP = 24, COL_GAP = 30, MAX_PER_COL = 4;
    displayAgents.forEach((a) => {
      if (a.systemId) {
        const sys = systems.find((s) => s.id === a.systemId);
        if (sys) {
          const arr = grouping[a.systemId]; const idx = arr.indexOf(a.id); const n = arr.length;
          const col = Math.floor(idx / MAX_PER_COL);
          const row = idx % MAX_PER_COL;
          const rowsInCol = Math.min(MAX_PER_COL, n - col * MAX_PER_COL);
          out[a.id] = { x: sys.x - COL_X - col * COL_GAP, y: sys.y + (row - (rowsInCol - 1) / 2) * ROW_GAP };
          return;
        }
      }
      if (a.x != null && a.y != null) out[a.id] = { x: a.x, y: a.y };
    });
    return out;
  }, [displayAgents, systems]);

  const displayOrders = useMemo(() => visibleOrders(orders, viewer), [orders, viewer]);
  const displayActions = useMemo(() => visibleActions(actions, viewer), [actions, viewer]);
  // Same own-faction filter as displayActions — a resolved request can be swept
  // into archivedActions by nextTurn before its faction ever sees the ruling
  // (see nextTurn's comment), so Updates has to watch both piles, not just the
  // live one, or a resolution can silently vanish off the list unacknowledged.
  const displayArchivedActions = useMemo(() => visibleActions(archivedActions, viewer), [archivedActions, viewer]);
  const displayMissions = useMemo(() => visibleMissions(missions, viewer), [missions, viewer]);
  // Same own-faction filter as displayMissions — a resolved mission can be swept
  // into archivedMissions by nextTurn before its faction ever sees the ruling,
  // same "resolution can vanish off the live pile" wrinkle as displayArchivedActions.
  const displayArchivedMissions = useMemo(() => visibleMissions(archivedMissions, viewer), [archivedMissions, viewer]);
  // This faction's resolved action requests it hasn't acknowledged yet — same
  // "receipt older than the thing it's for" comparison as unseenArticles, but
  // against resolvedAt rather than updatedAt, and pulled from both the live and
  // archived piles (see displayArchivedActions above).
  const unseenResolvedActions = useMemo(() => {
    const factionId = viewer.roleFactionId;
    if (!factionId) return [];
    return [...displayActions, ...displayArchivedActions]
      .filter((a) => a.status === "resolved")
      .filter((a) => {
        const seen = actionReads.find((r) => r.factionId === factionId && r.actionId === a.id);
        return !seen || seen.seenAt < (a.resolvedAt || 0);
      })
      .map((a) => {
        const agent = agents.find((x) => x.id === a.agentId);
        const fac = agent && factions.find((f) => f.id === agent.factionId);
        const member = fac && (fac.members || []).find((m) => m.id === agent.memberId);
        return { ...a, agentName: member ? member.name : "Agent" };
      })
      .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0));
  }, [displayActions, displayArchivedActions, actionReads, agents, factions, viewer.roleFactionId]);
  // Same idea for resolved squadron missions, pulled from both the live and
  // archived piles (see displayArchivedMissions above) — same reasoning as
  // unseenResolvedActions.
  const unseenResolvedMissions = useMemo(() => {
    const factionId = viewer.roleFactionId;
    if (!factionId) return [];
    return [...displayMissions, ...displayArchivedMissions]
      .filter((m) => m.status === "resolved")
      .filter((m) => {
        const seen = missionReads.find((r) => r.factionId === factionId && r.missionId === m.id);
        return !seen || seen.seenAt < (m.resolvedAt || 0);
      }).map((m) => {
        const fleet = fleets.find((f) => f.id === m.fleetId);
        return { ...m, fleetName: fleet ? fleet.name : "Fleet" };
      }).sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0));
  }, [displayMissions, displayArchivedMissions, missionReads, fleets, viewer.roleFactionId]);
  // Replenishment notices for this faction's own fleets: records revealed by
  // nextTurn (revealedAt set) that this faction hasn't acknowledged since. Own-
  // faction only, routed by the record's factionId — unlike a fleet's position,
  // an ally isn't told when your carriers get resupplied. Same unseen/receipt
  // race as unseenResolvedMissions above.
  const unseenReplenishments = useMemo(() => {
    const factionId = viewer.roleFactionId;
    if (!factionId) return [];
    return (replenishments || [])
      .filter((r) => r.revealedAt && r.factionId === factionId && (r.lines || []).length > 0)
      .filter((r) => {
        const seen = replenishmentReads.find((x) => x.factionId === factionId && x.replenishmentId === r.id);
        return !seen || seen.seenAt < (r.revealedAt || 0);
      }).map((r) => {
        const fleet = fleets.find((f) => f.id === r.fleetId);
        const system = systems.find((s) => s.id === r.systemId);
        return { ...r, fleetName: fleet ? fleet.name : "Fleet",
          systemName: system ? system.name : "", summary: replenishmentSummary(r) };
      }).sort((a, b) => (b.revealedAt || 0) - (a.revealedAt || 0));
  }, [replenishments, replenishmentReads, fleets, systems, viewer.roleFactionId]);
  // The Agents page's faction subtabs: every faction for the GM, only their own
  // for a player, none for an anonymous viewer.
  const displayAgentFactions = useMemo(() => {
    if (viewer.seesAll) return factions;
    return viewer.roleFactionId ? factions.filter((f) => f.id === viewer.roleFactionId) : [];
  }, [factions, viewer]);
  // Whether this viewer can plot move orders at all — a player with a faction, or
  // the GM. Gates the map's Orders toggle.
  const canOrder = viewer.seesAll || !!viewer.roleFactionId;
  // The order currently being plotted, resolved from the routing selection.
  const routingOrder = routing ? orderForRouting() : null;
  // Assets tab: GM sees every faction's subtab; a player sees their own
  // faction's plus any allied/vassal to it; anyone with no faction tied to
  // their login (anon, or a role the GM hasn't assigned a faction) sees none.
  const modifierFactionIds = useMemo(() => {
    if (viewer.seesAll) return null; // null = no filter, every faction
    return viewer.roleFactionId ? friendlyFactionIds(viewer.roleFactionId, relations) : new Set();
  }, [viewer, relations]);
  // A `public` modifier or project is visible to every player, not just
  // allies/vassals — so a faction with no friendly tie to the viewer can
  // still show up in the rail, as long as it has at least one public entry
  // (of either kind) to justify the tab.
  const publicAssetFactionIds = useMemo(
    () => new Set([...modifiers, ...projects].filter((x) => x.public).map((x) => x.factionId)),
    [modifiers, projects]
  );
  const displayModifierFactions = useMemo(
    () => (modifierFactionIds
      ? factions.filter((f) => modifierFactionIds.has(f.id) || publicAssetFactionIds.has(f.id))
      : factions),
    [factions, modifierFactionIds, publicAssetFactionIds]
  );
  // Three visibility states, checked in order: `public` overrides everything
  // (any player, ally or enemy); otherwise a `private` one drops the
  // ally/vassal grant, visible only to the faction it's attached to (and the
  // GM, handled by the null filter above); otherwise the default — this
  // faction and its allies/vassals. Shared by modifiers and projects — the
  // only two collections with a visibility toggle of their own.
  const displayModifiers = useMemo(() => {
    if (!modifierFactionIds) return modifiers; // GM: no filter
    return modifiers.filter((m) =>
      m.public ||
      (modifierFactionIds.has(m.factionId) && (!m.private || m.factionId === viewer.roleFactionId)));
  }, [modifiers, modifierFactionIds, viewer.roleFactionId]);
  // Resources have no private/public flag — just the same per-faction
  // (allies/vassals-only) visibility as a default-visibility modifier.
  const displayResources = useMemo(() => {
    if (!modifierFactionIds) return resources; // GM: no filter
    return resources.filter((r) => modifierFactionIds.has(r.factionId));
  }, [resources, modifierFactionIds]);
  // Projects: same three-state visibility as displayModifiers above.
  const displayProjects = useMemo(() => {
    if (!modifierFactionIds) return projects; // GM: no filter
    return projects.filter((p) =>
      p.public ||
      (modifierFactionIds.has(p.factionId) && (!p.private || p.factionId === viewer.roleFactionId)));
  }, [projects, modifierFactionIds, viewer.roleFactionId]);
  // The always-visible resource strip at the top of the page: a signed-in
  // player's own faction's counters, so they're visible from any tab instead
  // of only inside Assets > Resources. Nothing to show for the GM (no single
  // "own faction") or an anonymous viewer.
  const myResources = useMemo(
    () => (viewer.roleFactionId ? resources.filter((r) => r.factionId === viewer.roleFactionId) : []),
    [resources, viewer.roleFactionId]
  );
  // Badges next to the resource strip: the trackers a signed-in player can
  // currently see, restricted to their own faction's plus any allied/vassal's
  // (including those factions' `public` ones). A `public` tracker from a
  // faction with no friendly tie is deliberately kept out of the always-on top
  // strip — it stays on the Assets page. Nothing for the GM (no single "own
  // faction" to badge against) or an anonymous viewer.
  const visibleTrackers = useMemo(
    () => (viewer.roleFactionId && modifierFactionIds
      ? modifiers.filter((m) =>
          (m.kind || "text") === "slider" &&
          modifierFactionIds.has(m.factionId) &&
          (!m.private || m.factionId === viewer.roleFactionId))
      : []),
    [modifiers, modifierFactionIds, viewer.roleFactionId]
  );

  const accessProps = {
    viewer, roles, factions, canEdit, lockCode, fleetsPublic, toggleFleetsPublic,
    accessOpen, setAccessOpen, codeInput, setCodeInput, codeError, setCodeError,
    setNewLockCode, removeLockCode, tryUnlock, signOut, addRole, patchRole, removeRole,
  };

  // The global tab bar, one entry per page — driven from a single list so the
  // desktop strip and the mobile dropdown (see navTabs.map below) never drift
  // apart. `show` hides a tab the current viewer has no business seeing at all
  // (Agents/GM Tools); `badge` is the little count chip, 0/undefined for none.
  const navTabs = [
    { id: "map", label: "Map", icon: MapIcon, title: "Sector map", show: true },
    { id: "fleet", label: "Fleets", icon: Ship, title: "Fleet rosters", show: true },
    { id: "agents", label: "Agents", icon: VenetianMask, title: "Agents & operatives", show: canOrder },
    { id: "politics", label: "Politics", icon: Network, title: "Faction politics", show: true },
    { id: "codex", label: "Codex", icon: Library, title: "Setting codex / wiki", show: true,
      badge: canEdit ? pendingWikiCount : 0 },
    { id: "timeline", label: "Timeline", icon: History, title: "Campaign timeline — codex articles laid out by turn", show: true },
    { id: "updates", label: "Updates", icon: Bell, title: "Articles, action resolutions & mission resolutions your faction has not seen", show: true,
      badge: unseenArticles.length + unseenResolvedActions.length + unseenResolvedMissions.length },
    { id: "archive", label: "Archive", icon: Archive, title: "Your submitted actions & squadron orders, by turn", show: canOrder },
    { id: "assets", label: "Assets", icon: Package, title: "Faction assets: modifiers, trackers, resources & projects", show: true },
    { id: "odds", label: "Odds", icon: Dices, title: "Mission odds table", show: true },
    { id: "gmtools", label: "GM Tools", icon: Gavel, title: "GM tools: action & mission requests, roll resolution & notes",
      show: isGM, badge: isGM ? pendingActionCount + pendingMissionCount : 0 },
  ].filter((t) => t.show);
  const activeNavTab = navTabs.find((t) => t.id === activeTab) || navTabs[0];
  function selectNavTab(id) {
    setActiveTab(id); setAccessOpen(false); setMobileMenuOpen(false); setNavMenuOpen(false);
  }

  return (
    <ConfirmProvider>
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: T.void,
      color: T.text, fontFamily: F.body, overflow: "hidden" }}>

      {/* loading gate — avoids flashing an empty sector before the saved sector loads */}
      {!loaded && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: T.void,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ ...panelStyle, ...cut(10), padding: "18px 26px", display: "flex", alignItems: "center", gap: 12 }}>
            <Satellite size={20} color={T.accent} style={{ animation: "sweep 1.3s linear infinite" }} />
            <div>
              <div className="stencil" style={{ fontSize: 15, letterSpacing: ".06em", color: T.text }}>ACCESSING ARCHIVE</div>
              <div style={{ fontSize: 9.5, color: T.faint, letterSpacing: ".16em", marginTop: 2, fontFamily: F.body }}>
                RETRIEVING SECTOR RECORD
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ GLOBAL TAB BAR (map / codex) — always visible.
          Desktop scrolls sideways if it ever has to (rare — there's usually room);
          mobile swaps the row of chips for a single trigger + dropdown, since a
          sideways-scrolling strip on a phone hides tabs off-screen with no sign
          there's more, and up to 9 of them just doesn't fit even icon-only. */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
        background: `linear-gradient(180deg, #0a0906, ${T.panel})`, borderBottom: `1px solid ${T.line}`, zIndex: 41 }}>
        {isMobile ? (
          <button onClick={() => { setNavMenuOpen((o) => !o); setMobileMenuOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: "1 1 auto", minWidth: 0,
              background: T.panel3, border: `1px solid ${T.line}`, borderRadius: 2, padding: "7px 10px", color: T.text,
              fontFamily: F.body, fontSize: 12.5, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase" }}>
            {navMenuOpen ? <Menu size={15} color={T.accent} /> : <activeNavTab.icon size={15} color={T.accent} />}
            <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeNavTab.label}
            </span>
            {navMenuOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        ) : (
          <div className="scroll" style={{ display: "flex", gap: 3, background: T.panel3, padding: 3,
            border: `1px solid ${T.line}`, overflowX: "auto", flex: "1 1 auto", minWidth: 0 }}>
            {navTabs.map((t) => (
              <Btn key={t.id} active={activeTab === t.id} onClick={() => selectNavTab(t.id)} title={t.title}
                style={{ border: "none", borderRadius: 0, background: activeTab === t.id ? undefined : "transparent" }}>
                <t.icon size={14} /> {t.label}
                {t.badge > 0 && (
                  <span className="mono" style={{ background: T.amber, color: T.onAccent, borderRadius: 8,
                    minWidth: 15, height: 15, padding: "0 4px", display: "inline-flex", alignItems: "center",
                    justifyContent: "center", fontSize: 9.5, fontWeight: 700, lineHeight: 1 }}>
                    {t.badge}
                  </span>
                )}
              </Btn>
            ))}
          </div>
        )}

        {isMobile && navMenuOpen && (
          <div className="scroll" onClick={() => setNavMenuOpen(false)}
            style={{ position: "absolute", top: "100%", left: 10, right: 10, zIndex: 46, maxHeight: "70vh", overflowY: "auto",
              background: T.panel, border: `1px solid ${T.line}`, borderTop: "none", boxShadow: "0 14px 30px rgba(0,0,0,.6)",
              padding: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            {navTabs.map((t) => {
              const on = t.id === activeTab;
              return (
                <button key={t.id} onClick={() => selectNavTab(t.id)} title={t.title}
                  style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", width: "100%",
                    border: `1px solid ${on ? T.accent : T.line}`, borderRadius: 2, padding: "9px 11px",
                    background: on ? "rgba(159,194,58,.14)" : T.panel2, color: on ? T.accent : T.text,
                    fontFamily: F.body, fontSize: 13, fontWeight: 600, letterSpacing: ".03em",
                    textTransform: "uppercase" }}>
                  <t.icon size={15} />
                  <span style={{ flex: 1, textAlign: "left" }}>{t.label}</span>
                  {t.badge > 0 && (
                    <span className="mono" style={{ background: T.amber, color: T.onAccent, borderRadius: 8,
                      minWidth: 16, height: 16, padding: "0 5px", display: "inline-flex", alignItems: "center",
                      justifyContent: "center", fontSize: 10, fontWeight: 700 }}>
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
          {/* Personal show/hide for the resource + tracker rail below the tab bar
              — a player who finds it noisy (or wants to screenshot without it) can
              collapse it without losing the underlying data. Kept up here in the
              tab row so it stays reachable even once the rail is collapsed. */}
          {!isMobile && (myResources.length > 0 || visibleTrackers.length > 0) && (
            <button onClick={() => setShowAssetsBar((v) => !v)}
              title={showAssetsBar ? "Hide resource/tracker rail" : "Show resource/tracker rail"}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
                width: 26, height: 26, border: `1px solid ${T.line}`, borderRadius: 2,
                background: T.panel3, color: showAssetsBar ? T.text : T.faint }}>
              {showAssetsBar ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          )}
          {(canEdit || viewer.kind === "player") && <SaveStatus saveStatus={saveStatus} isMobile={isMobile} />}
          <AccessControl compact={isMobile} {...accessProps} />
        </div>
      </div>

      {/* ------------------------------------------------ ASSET RAIL — the signed-in
          player's own faction's resource counters plus the trackers they can see,
          on its own row directly under the tab bar rather than crammed inline with
          the tabs. Collapsible via the eye toggle up in the tab row. Desktop only
          — on mobile the tab dropdown trigger owns the top row. */}
      {!isMobile && showAssetsBar && (myResources.length > 0 || visibleTrackers.length > 0) && (
        <div className="scroll" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px",
          background: T.panel, borderBottom: `1px solid ${T.line}`, overflowX: "auto", zIndex: 40 }}>
          {/* A signed-in player's own faction's resource counters — a glance at the
              top of the page shows where they stand regardless of what tab they're
              on. Neutral chrome (no faction color — this rail is always the
              viewer's own faction, so tinting it adds nothing). Jumps to
              Assets > Resources on click. */}
          {currentFaction && myResources.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {myResources.map((r) => (
                <button key={r.id} onClick={() => goToAssets(currentFaction.id, "resources")} title={r.text || undefined}
                  style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0,
                    border: `1px solid ${T.line}`, borderRadius: 2, padding: "4px 8px", background: T.panel3 }}>
                  <span className="stencil" style={{ fontSize: 9.5, letterSpacing: ".06em", color: T.faint }}>
                    {r.name || "RESOURCE"}
                  </span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
                    {r.value || 0}
                  </span>
                </button>
              ))}
            </div>
          )}
          {/* Tracker badges: one per tracker visible to this player (own +
              allied/vassal factions), a one-letter severity abbreviation plus its
              name. Jumps to Assets > Trackers, on that tracker's own faction, on click. */}
          {visibleTrackers.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {visibleTrackers.map((t) => {
                const color = TRACKER_LEVEL_COLOR[t.level] || TRACKER_LEVEL_COLOR.low;
                const abbr = TRACKER_LEVEL_ABBR[t.level] || TRACKER_LEVEL_ABBR.low;
                const levelLabel = TRACKER_LEVEL_LABEL[t.level] || TRACKER_LEVEL_LABEL.low;
                // Which faction this tracker belongs to — a thin bar of their
                // color runs along the bottom edge so a glance tells you the
                // source (own vs. an ally/vassal) without opening Assets.
                const srcFaction = factionById(t.factionId);
                return (
                  <button key={t.id} onClick={() => goToAssets(t.factionId, "trackers")}
                    title={`${t.name || "Untitled tracker"} — ${levelLabel}${srcFaction ? ` · ${srcFaction.name}` : ""}`}
                    style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0,
                      border: `1px solid ${color}55`, borderRadius: 2, padding: "4px 8px 5px 4px", background: `${color}14`,
                      color, fontFamily: F.body, overflow: "hidden" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16,
                      borderRadius: 2, background: color, color: T.onAccent, fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                      {abbr}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>
                      {t.name || "Untitled tracker"}
                    </span>
                    {srcFaction && (
                      <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2,
                        background: srcFaction.color }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "map" && (
        <>
          {!isMobile && (
            <Toolbar
              mode={mode} setMode={setMode} setLinkSource={setLinkSource} canEdit={editingEnabled} canOrder={canOrder}
              addSystemCenter={addSystemCenter} addFleetCenter={addFleetCenter}
              drawColor={mapInt.drawColor} setDrawColor={mapInt.setDrawColor}
              drawWidth={mapInt.drawWidth} setDrawWidth={mapInt.setDrawWidth}
              strokes={strokes} undoStroke={mapInt.undoStroke} clearStrokes={mapInt.clearStrokes}
              view={view} setView={setView} panelOpen={panelOpen} setPanelOpen={setPanelOpen}
              editLocked={editLocked} setEditLocked={setEditLocked} showLock={canEdit}
            />
          )}
          {isMobile && (
            <MobileToolbar
              mode={mode} setMode={setMode} setLinkSource={setLinkSource} canEdit={editingEnabled} canOrder={canOrder}
              addSystemCenter={addSystemCenter} addFleetCenter={addFleetCenter}
              drawColor={mapInt.drawColor} setDrawColor={mapInt.setDrawColor}
              drawWidth={mapInt.drawWidth} setDrawWidth={mapInt.setDrawWidth}
              strokes={strokes} undoStroke={mapInt.undoStroke} clearStrokes={mapInt.clearStrokes}
              view={view} setView={setView} panelOpen={panelOpen} setPanelOpen={setPanelOpen}
              saveStatus={saveStatus} mobileMenuOpen={mobileMenuOpen}
              setMobileMenuOpen={(v) => { setNavMenuOpen(false); setMobileMenuOpen(v); }}
              editLocked={editLocked} setEditLocked={setEditLocked} showLock={canEdit}
            />
          )}

          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            {panelOpen && (
              <SidePanel
                factions={factions} layers={layers} systems={systems} fleets={fleets} canEdit={editingEnabled}
                isMobile={isMobile} onClose={() => setPanelOpen(false)}
                addFaction={addFaction} patchFaction={patchFaction} deleteFaction={deleteFaction}
                addLayer={addLayer} patchLayer={patchLayer} toggleLayer={toggleLayer}
                showFleets={showFleets} setShowFleets={setShowFleets}
                showAgents={showAgents} setShowAgents={setShowAgents}
                showOrders={showOrders} setShowOrders={setShowOrders} canOrder={canOrder}
              />
            )}

            <MapCanvas
              mapRef={mapInt.mapRef} canvasRef={mapInt.canvasRef} containerSize={mapInt.containerSize}
              isMobile={isMobile} mode={mode} canEdit={editingEnabled} isGM={canEdit} editLocked={editLocked} view={view} w2s={w2s}
              systems={systems} fleets={displayFleets} links={links} fleetPos={fleetPos}
              agents={displayAgents} agentPos={agentPos} orders={displayOrders} showOrders={showOrders}
              actions={displayActions}
              showFleets={showFleets} showAgents={showAgents}
              factions={factions} layers={layers} factionById={factionById} layerById={layerById}
              selSystem={selSystem} selFleet={selFleet} selAgent={selAgent} linkSource={linkSource} hoverFleet={mapInt.hoverFleet}
              routing={routing} routingOrder={routingOrder}
              onMapPointerDown={mapInt.onMapPointerDown} onMapDoubleClick={mapInt.onMapDoubleClick}
              startPieceDrag={mapInt.startPieceDrag} canvasDown={mapInt.canvasDown} canvasMove={mapInt.canvasMove} canvasUp={mapInt.canvasUp}
              onAgentTap={onAgentTap}
              undoOrderStop={undoOrderStop} clearRoutingOrder={clearRoutingOrder} commitRoutingOrder={commitRoutingOrder}
              setRoutingNotes={setRoutingNotes}
              setSelSystem={setSelSystem} setSelFleet={setSelFleet} setSelAgent={setSelAgent}
              patchSystem={patchSystem} addMarker={addMarker} patchMarker={patchMarker} removeMarker={removeMarker}
              deployFleetAt={deployFleetAt} deleteSystem={deleteSystem}
              patchFleet={patchFleet} renameFleet={renameFleet} addShip={addShip} patchShip={patchShip} removeShip={removeShip}
              moveShip={moveShip} deleteFleet={deleteFleet} beginShipDrag={mapInt.beginShipDrag}
              addSquadron={addSquadron} patchSquadron={patchSquadron} removeSquadron={removeSquadron}
              patchAgent={patchAgent} removeAgent={removeAgent} canManageAgents={canManageAgents}
              canPlaceAgents={canPlaceAgents}
              canOrderFor={canOrderFor} submitMission={submitMission}
              goToFleet={goToFleet} goToAgentAction={goToAgentAction} art={art}
              wiki={displayWiki} roles={roles} goToCodex={goToCodex} createEntry={createEntry}
              openFleetTransfer={openFleetTransfer}
            />
          </div>
        </>
      )}

      <Suspense fallback={null}>
        {activeTab === "fleet" && (
          <FleetView
            fleets={displayFleets} systems={systems} canEdit={canEdit} isMobile={isMobile}
            factionById={factionById} factions={factions} patchFleet={patchFleet}
            primaryId={fleetPrimaryId} setPrimaryId={setFleetPrimaryId}
            compareId={fleetCompareId} setCompareId={setFleetCompareId}
            addShip={addShip} patchShip={patchShip} removeShip={removeShip} renameFleet={renameFleet}
            addSquadron={addSquadron} patchSquadron={patchSquadron} removeSquadron={removeSquadron}
            art={art} addArt={addArt} patchArt={patchArt} removeArt={removeArt}
            missions={displayMissions} archivedMissions={displayArchivedMissions}
            canOrderFor={canOrderFor} canSuggestFor={canSuggestFor} submitMission={submitMission}
            onOpenFleetTransfer={openFleetTransfer} onOrderFleetMove={orderFleetMove}
          />
        )}

        {activeTab === "politics" && (
          <PoliticsView
            factions={factions} relations={relations} canEdit={editingEnabled} isMobile={isMobile} wiki={displayWiki} viewer={viewer}
            editLocked={editLocked} setEditLocked={setEditLocked} showLock={canEdit}
            patchFaction={patchFaction} addFaction={addFaction} deleteFaction={deleteFaction} setRelation={setRelation}
            addMember={addMember} patchMember={patchMember} patchMemberTitle={patchMemberTitle} removeMember={removeMember}
            goToCodex={goToCodex} createEntry={createEntry}
            agents={displayAgents} canManageAgents={canManageAgents} goToAgentAction={goToAgentAction}
          />
        )}

        {activeTab === "codex" && (
          <WikiView
            wiki={displayWiki} roles={roles} factions={factions} canEdit={canEdit} isMobile={isMobile} viewer={viewer}
            activeCat={activeCat} setActiveCat={setActiveCat}
            selectedId={selectedWikiId} setSelectedId={setSelectedWikiId}
            addEntry={addWikiEntry} patchEntry={patchWikiEntry} deleteEntry={deleteWikiEntry}
            submitEntry={submitWikiEntry} patchOwnEntry={patchOwnWikiEntry}
            withdrawEntry={withdrawWikiEntry} approveEntry={approveWikiEntry}
            publishEntry={publishWikiEntry} unpublishEntry={unpublishWikiEntry}
            publishEntryQuietly={publishWikiEntryQuietly}
            proposeEdit={proposeWikiEdit}
          />
        )}

        {activeTab === "timeline" && (
          <TimelineView
            wiki={displayWiki} factions={factions} turns={turns} turnNumber={turnNumber}
            isGM={isGM} isMobile={isMobile} goToCodex={goToCodex} setTurnStart={setTurnStart} setTurnName={setTurnName}
          />
        )}

        {activeTab === "updates" && (
          <UpdatesView articles={unseenArticles} factionName={currentFaction && currentFaction.name} isMobile={isMobile}
            openArticle={goToCodex} acknowledgeArticle={markWikiSeen} acknowledgeAll={acknowledgeAllUpdates}
            resolvedActions={unseenResolvedActions} openAction={goToAgentAction}
            acknowledgeAction={markActionSeen} acknowledgeAllActions={acknowledgeAllActionUpdates}
            resolvedMissions={unseenResolvedMissions} openMission={goToFleet}
            acknowledgeMission={markMissionSeen} acknowledgeAllMissions={acknowledgeAllMissionUpdates}
            replenishments={unseenReplenishments} openReplenishment={goToFleet}
            acknowledgeReplenishment={markReplenishmentSeen} acknowledgeAllReplenishments={acknowledgeAllReplenishmentUpdates} />
        )}

        {/* A player's own record of everything they've submitted to the GM. Fed
            only the faction-filtered display* copies (visibleActions/visibleMissions),
            so it can never surface another faction's actions — see the file header. */}
        {activeTab === "archive" && (
          <ActionArchiveView
            actions={displayActions} archivedActions={displayArchivedActions}
            missions={displayMissions} archivedMissions={displayArchivedMissions}
            agents={displayAgents} fleets={displayFleets} factions={factions} modifiers={modifiers}
            turnNumber={turnNumber} isMobile={isMobile} viewer={viewer}
            goToAgentAction={goToAgentAction} goToFleet={goToFleet}
          />
        )}

        {activeTab === "assets" && (
          <AssetsView
            factions={displayModifierFactions} allFactions={factions} modifiers={displayModifiers} resources={displayResources} projects={displayProjects} canEdit={isGM} isMobile={isMobile}
            viewerFactionId={viewer.roleFactionId}
            activeFactionId={assetFactionId} setActiveFactionId={setAssetFactionId}
            subtab={assetSubtab}
            addModifier={addModifier} patchModifier={patchModifier} removeModifier={removeModifier}
            reorderModifiers={reorderModifiers}
            addResource={addResource} patchResource={patchResource} removeResource={removeResource}
            sendResource={sendResource}
            addProject={addProject} patchProject={patchProject} removeProject={removeProject}
          />
        )}

        {activeTab === "agents" && (
          <AgentsView
            factions={displayAgentFactions} agents={agents} systems={systems}
            canEdit={canEdit} isMobile={isMobile} viewer={viewer}
            activeFactionId={agentFactionId} setActiveFactionId={setAgentFactionId}
            addAgent={addAgent} patchAgent={patchAgent} removeAgent={removeAgent}
            patchFaction={patchFaction}
            actions={displayActions} archivedActions={displayArchivedActions} modifiers={modifiers}
            submitAction={submitAction} removeAction={removeAction}
            initialAgentId={initialAgentId}
          />
        )}

        {/* A dice-reference tool, not a view of the sector — it takes no props but
            the breakpoint, and deliberately reads nothing from the map. */}
        {activeTab === "odds" && <OddsView isMobile={isMobile} />}

        {/* GM-only: no tab button reaches this for anyone else, and the render is
            gated again here in case a player types the hash in by hand. */}
        {activeTab === "gmtools" && isGM && (
          <GMToolsView
            roles={roles} factions={factions} modifiers={modifiers} notes={notes} isMobile={isMobile}
            resourceTransactions={resourceTransactions} removeResourceTransaction={removeResourceTransaction}
            addNote={addNote} removeNote={removeNote}
            actions={actions} archivedActions={archivedActions} agents={agents} systems={systems} links={links}
            resolveAction={resolveAction} reopenAction={reopenAction} removeAction={removeAction}
            removeArchivedAction={removeArchivedAction}
            editActionResolution={editActionResolution} editArchivedActionResolution={editArchivedActionResolution}
            setActionImportant={setActionImportant} setArchivedActionImportant={setArchivedActionImportant}
            fleets={fleets} missions={missions} archivedMissions={archivedMissions}
            resolveMission={resolveMission} removeMission={removeMission}
            removeArchivedMission={removeArchivedMission} editMissionResolutionText={editMissionResolutionText}
            orders={orders} nextTurn={nextTurn} turnNumber={turnNumber}
            acceptSuggestion={acceptSuggestion} clearSuggestionAcceptance={clearSuggestionAcceptance}
            relations={relations} replenishments={replenishments} stageReplenishment={stageReplenishment}
            endTurnChecks={endTurnChecks} ensureOssiteChecks={ensureOssiteChecks}
            rerollOssiteCheck={rerollOssiteCheck} setOssiteCheckOverride={setOssiteCheckOverride}
            rerollAllOssiteChecks={rerollAllOssiteChecks}
          />
        )}
      </Suspense>

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

      {transferFleetId && fleets.some((f) => f.id === transferFleetId) && (
        <FleetTransferModal
          fleetId={transferFleetId} fleets={displayFleets} systems={systems}
          factionById={factionById} art={art} isMobile={isMobile}
          onClose={() => setTransferFleetId(null)}
          transferShips={transferShips} transferSquadron={transferSquadron} transferVessel={transferVessel}
          splitToNewFleet={splitToNewFleet} renameFleet={renameFleet}
        />
      )}
    </div>
    </ConfirmProvider>
  );
}
