import {
  Gem, Fuel, Hammer, Factory, Landmark, Satellite, Radiation, Skull,
  ShieldAlert, Atom, Sparkles, Orbit, Crown, Flag, Star,
  Users, MapPin, ScrollText, Scale, Boxes,
  User, Handshake, Swords, Minus, Flame,
} from "lucide-react";

// The only key still kept per-device: the code this browser/account has entered.
// Everything shared lives in the Realtime Database under sectors/{id}/ — see
// lib/sectorSchema.js for the layout and lib/sectorRepo.js for reads and writes.
export const KNOWN_CODE_KEY = "galaxy-sector-known-code:v1"; // personal: the code this browser/account has entered

export const MIN_ZOOM = 0.1;   // 10% — far enough out to see a whole large sector at once
export const MAX_ZOOM = 3;     // 300%
export const OVERVIEW_ZOOM = 0.45; // at or below this scale, systems simplify to plain markers (names/status icons hidden)

export const WIKI_CATS = [
  { id: "factions", label: "Factions", icon: Users },
  { id: "characters", label: "Characters", icon: User },
  { id: "locations", label: "Locations", icon: MapPin },
  { id: "lore", label: "Lore", icon: ScrollText },
  { id: "rules", label: "Rules", icon: Scale },
  { id: "misc", label: "Misc", icon: Boxes },
];

// SUBNODE_ZOOM: at or above this politics-view scale, each faction node expands
// from its compact badge into the full roster card (portrait grid + list).
export const SUBNODE_ZOOM = 1.0

// The kinds of subnode that can live inside a faction on the politics map.
// Organizations were retired — every member is a character now. Any legacy
// member still stored with kind "org" falls back to this entry when rendered.
export const MEMBER_KINDS = [
  { id: "character", label: "Character", icon: User, defaultCat: "characters" },
];

// Relationship types drawn as the edges between faction nodes. `dash` is an
// SVG stroke-dasharray ("" = solid); `width` scales the edge thickness.
export const RELATION_TYPES = [
  { id: "alliance", label: "Alliance", color: "#6f9f3f", dash: "", width: 2.4, icon: Handshake },
  { id: "vassal", label: "Vassal", color: "#7d6bb0", dash: "2 5", width: 2.0, icon: Crown },
  { id: "neutral", label: "Neutral", color: "#8c8672", dash: "3 6", width: 1.5, icon: Minus },
  { id: "rivalry", label: "Rivalry", color: "#d98f2b", dash: "8 6", width: 1.8, icon: Flame },
  { id: "war", label: "At War", color: "#b23a2e", dash: "", width: 2.8, icon: Swords },
];
// Neutral stays at index 2 so it remains the fallback — any legacy "pact"
// (Trade Pact) relations still on record render as Neutral until re-set.
export const relationType = (id) => RELATION_TYPES.find((r) => r.id === id) || RELATION_TYPES[2];

export const ICONS = {
  Gem, Fuel, Hammer, Factory, Landmark, Satellite, Radiation, Skull,
  ShieldAlert, Atom, Sparkles, Orbit, Crown, Flag, Star,
};
export const ICON_KEYS = Object.keys(ICONS);

// Default size of a freshly added squadron — a placeholder to type over, not a rule.
export const DEFAULT_SQUADRON_SIZE = 12;

// Freehand pen colors offered on both the desktop and mobile map toolbars.
export const DRAW_COLORS = ["#9fc23a", "#d98f2b", "#a83d31", "#5f83a0", "#d8d0b8", "#7c6a9e"];

// Chip colors cycled through when the GM creates player roles.
export const ROLE_COLORS = ["#5f9098", "#a06840", "#8a9a4a", "#6b6a9e", "#b3763e", "#4f8f6f", "#9a7a2e", "#a0517a"];
