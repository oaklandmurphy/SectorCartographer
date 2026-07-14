import { uid } from "../utils/id.js";

export function seed() {
  /* -------------------------------------------------- codex entries first, so
     factions / systems / members can link to them by id (like the map's pieces). */
  const wiki = [];
  const W = (category, title, body) => {
    const e = { id: uid("wk"), category, title, body };
    wiki.push(e);
    return e; // return the entry so callers can grab its id for a codex link
  };

  // factions
  const wkTerran = W("factions", "Terran Concord",
    "The dominant human polity of the core worlds, governed from Sol Prime by an elected Senate. Fields a professional standing navy and prizes order, trade, and hard-won stability after the Secession Wars.\n\nStrengths: industrial capacity, disciplined fleets.\nWeaknesses: slow bureaucracy, overextended borders.\n\n[Replace this with your own faction notes.]");
  const wkKrell = W("factions", "Krell Hegemony",
    "A militarized rival power holding the rimward systems around Krellhome. Organized into warrior clans bound by oaths to the Hegemon. Expansionist, honor-bound, and quick to raid contested frontier worlds.\n\nRelations: at war with the Terran Concord; a wary trade pact with the Void Syndicate.\n\n[Add leaders, goals, and history here.]");
  const wkVerdant = W("factions", "Verdant Compact",
    "A loose federation of agrarian and terraforming worlds centered on Eden IV. Neutral traders who supply biomass and foodstuffs to all sides. Small navy, but courted by everyone for their supply lines.");
  const wkAurel = W("factions", "Aurelian Dominion",
    "A gilded monarchy of inner-belt worlds, rich on solar industry and old money. Allied to the Terran Concord by treaty and marriage, but forever maneuvering for advantage.");
  const wkVoid = W("factions", "Void Syndicate",
    "Less a nation than a cartel of salvage crews, smugglers, and information brokers operating out of the sensor-fogged Nyx Reach. Owes loyalty to profit alone.");

  // organizations
  const wkNavCmd = W("factions", "Concord Naval Command",
    "The unified military command of the Terran Concord, headquartered above Sol Prime. Oversees the numbered battle fleets and the sector's largest shipyards.");
  const wkTalon = W("factions", "Red Talon Clan",
    "The most feared war-host of the Krell Hegemony, sworn raiders who crew the dreadnought Ravager. Their banner falling on a system is usually the last warning it gets.");
  const wkGuild = W("misc", "Nyx Salvage Guild",
    "A fractious collective of scrappers and wreck-divers that controls who gets to pick over the derelicts drifting in Nyx Reach. Nominally answers to the Void Syndicate.");

  // characters
  const wkVenn = W("characters", "Chancellor Elaro Venn",
    "Elected head of the Terran Senate and the Concord's chief executive. A cautious institutionalist who won power promising an end to frontier overreach — a promise the Krell wars keep testing.\n\nGoals: consolidate the core, avoid a two-front conflict.\n[Add secrets, allies, and leverage here.]");
  const wkKoss = W("characters", "Hegemon Var Koss",
    "Warlord of the Krell Hegemony, who holds the clans together by force of will and an unbroken record of victories. Believes the Concord is soft and ripe for the taking.\n\nGoals: seize the Ashfall corridor, name an heir before the clans fracture.");
  const wkThorne = W("characters", "Speaker Lila Thorne",
    "Trade envoy and de-facto voice of the Verdant Compact. Keeps the Compact neutral and fed by playing every larger power against the others.\n\nGoals: keep the lanes open, keep Eden IV out of the war.");
  const wkBroker = W("characters", "The Broker",
    "The unseen hand behind the Void Syndicate. Nobody agrees on whether the Broker is one person, a title, or an AI. Sells the same secret to three buyers and lets them fight over which was true.");
  const wkDoyle = W("characters", "Admiral Sera Doyle",
    "Commander of the Terran 3rd Battle Fleet and the Concord's most decorated line officer. Loyal to the service, privately contemptuous of the Senate's hesitation.");

  /* -------------------------------------------------- factions
     px/py place each faction node on the politics map; members are the subnode
     cloud (characters & organizations) revealed when you zoom in. */
  const M = (name, kind, role, wk) => ({ id: uid("mem"), name, kind, role, wikiId: wk ? wk.id : null });
  const factions = [
    { id: "fac_terran", name: "Terran Concord", color: "#5f83a0", px: 0, py: -260, wikiId: wkTerran.id,
      members: [
        M("Chancellor Elaro Venn", "character", "Head of Senate", wkVenn),
        M("Adm. Sera Doyle", "character", "Fleet Admiral", wkDoyle),
        M("Concord Naval Command", "org", "Military", wkNavCmd),
      ] },
    { id: "fac_krell", name: "Krell Hegemony", color: "#a83d31", px: 225, py: -130, wikiId: wkKrell.id,
      members: [
        M("Hegemon Var Koss", "character", "Warlord", wkKoss),
        M("Red Talon Clan", "org", "War host", wkTalon),
        M("Blade-Captain Ruk", "character", "Raid leader", null),
      ] },
    { id: "fac_aurel", name: "Aurelian Dominion", color: "#c99a3e", px: 225, py: 130, wikiId: wkAurel.id,
      members: [
        M("Sun-Queen Aurelia III", "character", "Monarch", null),
        M("Solar Exchequer", "org", "Treasury", null),
      ] },
    { id: "fac_verdant", name: "Verdant Compact", color: "#6f8f3f", px: 0, py: 260, wikiId: wkVerdant.id,
      members: [
        M("Speaker Lila Thorne", "character", "Trade envoy", wkThorne),
        M("Wardens of Eden", "org", "Defense force", null),
      ] },
    { id: "fac_void", name: "Void Syndicate", color: "#7c6a9e", px: -225, py: 130, wikiId: wkVoid.id,
      members: [
        M("The Broker", "character", "Shadow leader", wkBroker),
        M("Nyx Salvage Guild", "org", "Salvagers", wkGuild),
      ] },
    { id: "fac_none", name: "Unaligned", color: "#8c8672", px: -225, py: -130, wikiId: null,
      members: [
        M("Frontier-9 Free Port", "org", "Neutral hub", null),
      ] },
  ];

  // relationship edges between factions on the politics map
  const R = (a, b, type) => ({ id: uid("rel"), a, b, type });
  const relations = [
    R("fac_terran", "fac_krell", "war"),
    R("fac_terran", "fac_aurel", "alliance"),
    R("fac_terran", "fac_verdant", "pact"),
    R("fac_terran", "fac_void", "rivalry"),
    R("fac_krell", "fac_void", "pact"),
    R("fac_krell", "fac_aurel", "rivalry"),
    R("fac_aurel", "fac_verdant", "pact"),
    R("fac_verdant", "fac_void", "neutral"),
    R("fac_krell", "fac_verdant", "neutral"),
  ];

  const layers = [
    { id: "lay_res", name: "Resources", color: "#c99a3e", visible: true },
    { id: "lay_str", name: "Megastructures", color: "#5f83a0", visible: true },
    { id: "lay_haz", name: "Hazards", color: "#a83d31", visible: true },
    { id: "lay_ano", name: "Anomalies", color: "#7c6a9e", visible: true },
    { id: "lay_pol", name: "Politics", color: "#6f8f3f", visible: true },
  ];
  const MK = (layerId, iconKey, label) => ({ id: uid("mk"), layerId, iconKey, label });

  // location codex entries (captured so their systems can link to them)
  const wkSolLoc = W("locations", "Sol Prime",
    "Capital system of the Terran Concord. Home to the Senate, the primary naval shipyards, and the oldest orbital habitats in the sector. Heavily fortified and densely populated.\n\nNotable sites: the Senate Spire, Dock Ring Seven, the Ore Belt refineries.");
  const wkAshLoc = W("locations", "The Ashfall Blockade",
    "A contested chokepoint in the Ashfall system where the Krell maintain a permanent picket fleet. Any vessel transiting without clearance is boarded or fired upon. Wreckage from past engagements litters the approach lanes.");
  const wkNyxLoc = W("locations", "Nyx Reach",
    "A dim nebula system on the sector's edge, prized for a derelict alien relic drifting in the outer dark. Sensor-fogged and lawless — a haven for the Void Syndicate and salvage crews.\n\n[Describe what your players might find here.]");

  const systems = [
    { id: "sys_sol", name: "Sol Prime", x: 210, y: 180, factionId: "fac_terran", wikiId: wkSolLoc.id,
      markers: [MK("lay_res", "Gem", "Ore"), MK("lay_str", "Factory", "Shipyard"), MK("lay_pol", "Crown", "Capital")] },
    { id: "sys_vega", name: "Vega Gate", x: 420, y: 120, factionId: "fac_terran", wikiId: null,
      markers: [MK("lay_str", "Satellite", "Relay"), MK("lay_ano", "Atom", "Rift")] },
    { id: "sys_eden", name: "Eden IV", x: 560, y: 300, factionId: "fac_verdant", wikiId: null,
      markers: [MK("lay_res", "Gem", "Biomass"), MK("lay_pol", "Flag", "Senate")] },
    { id: "sys_helios", name: "Helios", x: 300, y: 380, factionId: "fac_aurel", wikiId: null,
      markers: [MK("lay_res", "Fuel", "Fuel"), MK("lay_str", "Orbit", "Dyson Swarm")] },
    { id: "sys_krell", name: "Krellhome", x: 760, y: 150, factionId: "fac_krell", wikiId: null,
      markers: [MK("lay_res", "Fuel", "Gas Giant"), MK("lay_haz", "Radiation", "War Zone")] },
    { id: "sys_ash", name: "Ashfall", x: 830, y: 340, factionId: "fac_krell", wikiId: wkAshLoc.id,
      markers: [MK("lay_haz", "Skull", "Blockade")] },
    { id: "sys_nyx", name: "Nyx Reach", x: 620, y: 470, factionId: "fac_void", wikiId: wkNyxLoc.id,
      markers: [MK("lay_ano", "Sparkles", "Nebula"), MK("lay_str", "Landmark", "Relic")] },
    { id: "sys_front", name: "Frontier-9", x: 130, y: 470, factionId: "fac_none", wikiId: null,
      markers: [MK("lay_haz", "ShieldAlert", "Pirates"), MK("lay_res", "Hammer", "Salvage")] },
  ];
  const links = [
    { id: uid("ln"), a: "sys_sol", b: "sys_vega" },
    { id: uid("ln"), a: "sys_vega", b: "sys_eden" },
    { id: uid("ln"), a: "sys_sol", b: "sys_helios" },
    { id: uid("ln"), a: "sys_helios", b: "sys_front" },
    { id: uid("ln"), a: "sys_eden", b: "sys_nyx" },
    { id: uid("ln"), a: "sys_krell", b: "sys_ash" },
    { id: uid("ln"), a: "sys_ash", b: "sys_eden" },
    { id: uid("ln"), a: "sys_nyx", b: "sys_helios" },
  ];
  const S = (name, cls) => ({ id: uid("shp"), name, cls });
  const fleets = [
    { id: "flt_3rd", name: "3rd Battle Fleet", factionId: "fac_terran", systemId: "sys_sol", x: 0, y: 0, wikiId: null,
      ships: [S("TNS Vanguard", "Battleship"), S("TNS Arrow", "Frigate"), S("TNS Aegis", "Cruiser")] },
    { id: "flt_res", name: "Home Reserve", factionId: "fac_terran", systemId: "sys_vega", x: 0, y: 0, wikiId: null,
      ships: [S("TNS Bastion", "Carrier")] },
    { id: "flt_talon", name: "Red Talon", factionId: "fac_krell", systemId: "sys_krell", x: 0, y: 0, wikiId: wkTalon.id,
      ships: [S("Ravager", "Dreadnought"), S("Cinder", "Destroyer")] },
    { id: "flt_green", name: "Wardens", factionId: "fac_verdant", systemId: "sys_eden", x: 0, y: 0, wikiId: null,
      ships: [S("Thornwood", "Cruiser")] },
  ];

  // remaining lore / rules / misc codex entries
  W("lore", "The Secession Wars",
    "Two generations ago, a bloc of frontier colonies broke from the old Terran government, triggering a decade of war that reshaped the sector. The modern Concord rose from the peace that followed, while the defeated hardliners scattered rimward and seeded what became the Krell Hegemony.\n\n[Expand your timeline here.]");
  W("lore", "Jump Lanes & Hyperlanes",
    "Faster-than-light travel follows fixed hyperlanes between systems — the dashed lines on the sector map. Fleets cannot cross open space between unlinked systems without a lengthy sublight crawl, making lane control strategically vital.");
  W("lore", "The Relic of Nyx",
    "An artifact of unknown origin, older than human spaceflight, drifting in Nyx Reach. Every faction wants it; none fully understands it. A convenient hook for a campaign's central mystery.\n\n[Decide what it actually is.]");
  W("rules", "Fleet Movement",
    "On each turn, a fleet may move along one hyperlane to an adjacent system. Fleets in transit (dropped in open space) are considered vulnerable and may be intercepted.\n\n[Adjust to match your tabletop ruleset.]");
  W("rules", "Combat Resolution",
    "When two opposing fleets occupy the same system, resolve combat. Suggested baseline: total the combat value of all ships in each fleet, roll, and apply the difference as casualties.\n\n[Replace with your preferred combat system.]");
  W("rules", "Controlling a System",
    "A system's affiliation (its highlight color) changes when a faction holds it uncontested at the end of a turn. Systems with megastructures or resource markers may grant bonuses — define those here.");
  W("misc", "Ship Classes",
    "Frigate — fast, cheap, expendable escorts.\nDestroyer — anti-fighter screen and patrol.\nCruiser — the versatile backbone of most fleets.\nBattleship — heavy line combatant.\nCarrier — projects strike craft across a system.\nDreadnought — rare, sector-shaking capital ship.\n\n[Add stats or costs as needed.]");
  W("misc", "Campaign Notes",
    "Use this space for session logs, open plot threads, NPC contacts, or anything that doesn't fit elsewhere.\n\n- Session 1: \n- Open threads: \n- Player goals: ");

  // Player roles for asymmetric-info games start empty — the GM creates them.
  const roles = [];

  return { factions, relations, layers, systems, links, fleets, wiki, roles };
}
