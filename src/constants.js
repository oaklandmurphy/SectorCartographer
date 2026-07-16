import {
  Gem, Fuel, Hammer, Factory, Landmark, Satellite, Radiation, Skull,
  ShieldAlert, Atom, Sparkles, Orbit, Crown, Flag, Star,
  Users, MapPin, ScrollText, Scale, Boxes,
  User, Building2, Handshake, Swords, Coins, Minus, Flame,
} from "lucide-react";

export const STORAGE_KEY = "galaxy-sector-state:v1";   // shared game data (factions, systems, fleets, drawings...)
export const ACCESS_KEY = "galaxy-sector-access:v1";   // shared: the current edit-lock code (empty = open to everyone)
export const KNOWN_CODE_KEY = "galaxy-sector-known-code:v1"; // personal: the code this browser/account has entered
// Ship art gets its own key rather than riding in STORAGE_KEY: that blob is
// rewritten on every keystroke, and re-uploading artwork on each edit would be
// slow and needlessly expensive. Art changes rarely, so it saves independently.
export const ART_KEY = "galaxy-sector-art:v1";         // shared: the SVG ship-art library

export const MIN_ZOOM = 0.1;   // 10% — far enough out to see a whole large sector at once
export const MAX_ZOOM = 3;     // 300%
export const OVERVIEW_ZOOM = 0.25; // at or below this scale, systems simplify to plain markers (names/status icons hidden)

export const WIKI_CATS = [
  { id: "factions", label: "Factions", icon: Users },
  { id: "characters", label: "Characters", icon: User },
  { id: "locations", label: "Locations", icon: MapPin },
  { id: "lore", label: "Lore", icon: ScrollText },
  { id: "rules", label: "Rules", icon: Scale },
  { id: "misc", label: "Misc", icon: Boxes },
];

// SUBNODE_ZOOM: at or above this politics-view scale, each faction node expands
// to reveal the cloud of member subnodes (characters & organizations) inside it.
export const SUBNODE_ZOOM = 0.85;

// The kinds of subnode that can live inside a faction on the politics map.
export const MEMBER_KINDS = [
  { id: "character", label: "Character", icon: User, defaultCat: "characters" },
  { id: "org", label: "Organization", icon: Building2, defaultCat: "factions" },
];

// Relationship types drawn as the edges between faction nodes. `dash` is an
// SVG stroke-dasharray ("" = solid); `width` scales the edge thickness.
export const RELATION_TYPES = [
  { id: "alliance", label: "Alliance", color: "#6f9f3f", dash: "", width: 2.4, icon: Handshake },
  { id: "pact", label: "Trade Pact", color: "#5f9098", dash: "7 5", width: 1.8, icon: Coins },
  { id: "neutral", label: "Neutral", color: "#8c8672", dash: "3 6", width: 1.5, icon: Minus },
  { id: "rivalry", label: "Rivalry", color: "#d98f2b", dash: "8 6", width: 1.8, icon: Flame },
  { id: "war", label: "At War", color: "#b23a2e", dash: "", width: 2.8, icon: Swords },
];
export const relationType = (id) => RELATION_TYPES.find((r) => r.id === id) || RELATION_TYPES[2];

export const ICONS = {
  Gem, Fuel, Hammer, Factory, Landmark, Satellite, Radiation, Skull,
  ShieldAlert, Atom, Sparkles, Orbit, Crown, Flag, Star,
};
export const ICON_KEYS = Object.keys(ICONS);

// Default size of a freshly added squadron — a placeholder to type over, not a rule.
export const DEFAULT_SQUADRON_SIZE = 12;

// Chip colors cycled through when the GM creates player roles.
export const ROLE_COLORS = ["#5f9098", "#a06840", "#8a9a4a", "#6b6a9e", "#b3763e", "#4f8f6f", "#9a7a2e", "#a0517a"];
