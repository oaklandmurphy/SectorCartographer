import { useMemo, useState } from "react";
import { Archive, VenetianMask, Ship, Check, Clock, History, Flag, Filter, ExternalLink, Inbox } from "lucide-react";
import { T, F, lbl, selStyle } from "../theme.js";
import Btn from "./ui/Btn.jsx";
import ActionResolution from "./ui/ActionResolution.jsx";
import MissionResolution from "./ui/MissionResolution.jsx";

// A player's own record of everything they've put in front of the GM: agent
// action requests and squadron missions, in one place, split by the turn they
// belong to and filterable to a single agent or fleet.
//
// SECURITY: this view never touches the raw `actions`/`missions` collections. It
// is fed only the already-faction-filtered display copies App builds with
// visibleActions/visibleMissions (own faction only for a player). It performs no
// writes. So a player can only ever see their own faction's submissions here —
// the same guarantee the Agents and Fleet tabs already rely on.

const fmtDateTime = (ms) => (ms ? new Date(ms).toLocaleString() : "");
const detachmentSummary = (m) => (m.detachments || [])
  .map((d) => `${d.count}×${d.model || "unnamed"}`).join(", ");

export default function ActionArchiveView({
  actions, archivedActions, missions, archivedMissions,
  agents, fleets, factions, modifiers, turnNumber, isMobile, viewer,
  goToAgentAction, goToFleet,
}) {
  const [issuerFilter, setIssuerFilter] = useState("all"); // "all" | `${type}:${id}`

  const factionOf = (id) => factions.find((f) => f.id === id) || null;
  const factionColor = (id) => (factionOf(id) || {}).color || T.accent;

  // Mirrors AgentsView.agentLabel: explicit name, else the linked character's
  // name, else a generic fallback. An archived action can point at an agent the
  // GM has since removed (removeAgent scrubs the live queue, not the archive), so
  // a missing agent degrades to a label rather than throwing.
  const agentLabel = (agentId) => {
    const a = (agents || []).find((x) => x.id === agentId);
    if (!a) return "Agent (removed)";
    if (a.name && a.name.trim()) return a.name.trim();
    const fac = factionOf(a.factionId);
    const member = fac && (fac.members || []).find((m) => m.id === a.memberId);
    if (member) return member.name;
    return "Agent";
  };
  const fleetLabel = (fleetId) => {
    const f = (fleets || []).find((x) => x.id === fleetId);
    return f ? (f.name || "Fleet") : "Fleet (removed)";
  };
  const modName = (id) => ((modifiers || []).find((m) => m.id === id) || {}).name || "";
  const agentExists = (id) => (agents || []).some((a) => a.id === id);
  const fleetExists = (id) => (fleets || []).some((f) => f.id === id);

  // Fold both queues into one list of normalized entries, each tagged with the
  // turn it belongs to and the piece (agent/fleet) that issued it. Live entries
  // (still in actions/missions) belong to the current turn; archived ones carry
  // the turn they were closed out in (stamped by nextTurn).
  const items = useMemo(() => {
    const out = [];
    const curTurn = Number(turnNumber) || 0;
    const pushAction = (a, turn) => out.push({
      kind: "action", id: a.id, turn, factionId: a.factionId,
      issuerType: "agent", issuerId: a.agentId, issuerLabel: agentLabel(a.agentId),
      status: a.status, resolution: a.resolution, text: a.text,
      modifierIds: a.modifierIds || [], carriedOver: !!a.carriedOver,
      createdAt: a.createdAt || 0, resolvedAt: a.resolvedAt || 0,
    });
    const pushMission = (m, turn) => out.push({
      kind: "mission", id: m.id, turn, factionId: m.factionId,
      issuerType: "fleet", issuerId: m.fleetId, issuerLabel: fleetLabel(m.fleetId),
      status: m.status, resolution: m.resolution, text: m.text,
      detachments: m.detachments || [],
      createdAt: m.createdAt || 0, resolvedAt: m.resolvedAt || 0,
    });
    (actions || []).forEach((a) => pushAction(a, curTurn));
    (archivedActions || []).forEach((a) => pushAction(a, a.turn || 0));
    (missions || []).forEach((m) => pushMission(m, curTurn));
    (archivedMissions || []).forEach((m) => pushMission(m, m.turn || 0));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, archivedActions, missions, archivedMissions, agents, fleets, factions, turnNumber]);

  // The distinct issuers present across the player's submissions — the options
  // the dropdown offers, split into an Agents group and a Fleets group.
  const { agentIssuers, fleetIssuers } = useMemo(() => {
    const map = new Map(); // `${type}:${id}` -> { key, type, id, label }
    for (const it of items) {
      const key = `${it.issuerType}:${it.issuerId}`;
      if (!map.has(key)) map.set(key, { key, type: it.issuerType, id: it.issuerId, label: it.issuerLabel });
    }
    const all = [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    return { agentIssuers: all.filter((x) => x.type === "agent"), fleetIssuers: all.filter((x) => x.type === "fleet") };
  }, [items]);

  // A stale filter (its agent/fleet no longer appears in any submission) reads as
  // "All" rather than silently showing nothing.
  const filterValid = issuerFilter === "all"
    || [...agentIssuers, ...fleetIssuers].some((x) => x.key === issuerFilter);
  const effFilter = filterValid ? issuerFilter : "all";

  const filtered = effFilter === "all"
    ? items
    : items.filter((it) => `${it.issuerType}:${it.issuerId}` === effFilter);

  // Split by turn, newest turn first; newest submission first within each turn.
  const turnGroups = useMemo(() => {
    const byTurn = new Map();
    for (const it of filtered) {
      if (!byTurn.has(it.turn)) byTurn.set(it.turn, []);
      byTurn.get(it.turn).push(it);
    }
    return [...byTurn.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([turn, list]) => ({
        turn,
        items: list.sort((a, b) => (b.resolvedAt || b.createdAt || 0) - (a.resolvedAt || a.createdAt || 0)),
      }));
  }, [filtered]);

  const currentTurn = Number(turnNumber) || 0;
  const currentFaction = viewer && viewer.roleFactionId ? factionOf(viewer.roleFactionId) : null;

  /* ------------------------------------------------ one submission card */
  const card = (it) => {
    const color = factionColor(it.factionId);
    const fac = factionOf(it.factionId);
    const isAction = it.kind === "action";
    // Only a genuinely "resolved" entry reveals its ruling. A "delayed" one has
    // been ruled on but held back — it must read as still-open to the player and
    // never show its resolution (matches AgentsView / FleetView).
    const settled = it.status === "resolved";
    const IssuerIcon = isAction ? VenetianMask : Ship;
    const canOpen = isAction ? agentExists(it.issuerId) : fleetExists(it.issuerId);
    return (
      <div key={it.id} style={{ border: `1px solid ${settled ? T.line : color}`, borderRadius: 2,
        background: T.panel2, display: "flex", flexDirection: "column", gap: 7, padding: isMobile ? 9 : 11 }}>
        {/* header: issuer + kind, faction dot, status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5,
            color: T.text, fontWeight: 600, minWidth: 0 }}>
            <IssuerIcon size={13} style={{ color, flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.issuerLabel}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, ...lbl, color: T.faint }}>
            {isAction ? "Action" : "Squadron Order"}
          </span>
          {fac && (
            <span title={fac.name} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: T.mut }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              {fac.name}
            </span>
          )}
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5,
            fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: settled ? T.accent : T.amber }}>
            {settled ? <Check size={11} /> : <Clock size={11} />}
            {settled ? "Resolved" : (isAction ? "Pending" : "On mission")}
          </span>
        </div>

        {/* meta: carried-over flag, detachment summary / modifier flags, time */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {it.carriedOver && !settled && (
            <span title="Held over from a previous turn — not yet resolved"
              style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9,
                fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.faint }}>
              <History size={10} /> Carried over
            </span>
          )}
          {!isAction && it.detachments.length > 0 && (
            <span className="mono" style={{ fontSize: 10.5, color: T.mut }}>{detachmentSummary(it)}</span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 9.5, color: T.faint }}>
            {fmtDateTime(it.createdAt)}
          </span>
        </div>

        {/* the request text itself */}
        <div style={{ fontFamily: F.mono, fontSize: 14, lineHeight: 1.65, color: T.text, whiteSpace: "pre-wrap",
          borderLeft: `2px solid ${color}`, paddingLeft: 12 }}>
          {it.text}
        </div>

        {/* modifiers the player flagged on an action */}
        {isAction && it.modifierIds.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {it.modifierIds.map((id) => {
              const name = modName(id);
              if (!name) return null;
              return (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 3,
                  border: `1px solid ${color}`, borderRadius: 2, padding: "1px 5px",
                  fontSize: 10, color, background: `${color}1f` }}>
                  <Flag size={9} /> {name}
                </span>
              );
            })}
          </div>
        )}

        {/* the GM's ruling, once (and only once) it's genuinely resolved */}
        {settled && (
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>
            {it.resolution
              ? (isAction
                ? <ActionResolution resolution={it.resolution} />
                : <MissionResolution resolution={it.resolution} />)
              : <div style={{ fontSize: 11.5, color: T.mut }}>Resolved (no ruling recorded).</div>}
          </div>
        )}

        {/* jump to where this submission lives */}
        {canOpen && (goToAgentAction || goToFleet) && (
          <div style={{ display: "flex" }}>
            <Btn style={{ marginLeft: "auto" }}
              onClick={() => (isAction
                ? goToAgentAction && goToAgentAction(it.issuerId, it.factionId)
                : goToFleet && goToFleet(it.issuerId))}
              title={isAction ? "Open this agent in the Agents tab" : "Open this fleet in the Fleets tab"}>
              <ExternalLink size={12} /> {isAction ? "Agent" : "Fleet"}
            </Btn>
          </div>
        )}
      </div>
    );
  };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      padding: isMobile ? "12px 14px" : "14px 20px", borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Archive size={20} color={T.accent} />
        <div className="stencil" style={{ fontSize: isMobile ? 17 : 20, letterSpacing: ".05em", color: T.text }}>
          ACTION ARCHIVE
        </div>
      </div>
      <span className="mono" style={{ fontSize: 10.5, color: T.faint }}>
        {items.length} submission{items.length === 1 ? "" : "s"}
        {currentFaction ? ` · ${currentFaction.name}` : ""}
      </span>

      {/* the agent/fleet filter */}
      <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <Filter size={13} style={{ color: T.mut }} />
        <select value={effFilter} onChange={(e) => setIssuerFilter(e.target.value)}
          title="Filter to a single agent or fleet"
          style={{ ...selStyle, width: "auto", minWidth: isMobile ? 150 : 190, fontFamily: F.mono, fontSize: 11.5 }}>
          <option value="all">All agents &amp; fleets</option>
          {agentIssuers.length > 0 && (
            <optgroup label="Agents">
              {agentIssuers.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </optgroup>
          )}
          {fleetIssuers.length > 0 && (
            <optgroup label="Fleets">
              {fleetIssuers.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </optgroup>
          )}
        </select>
      </label>
    </div>
  );

  // Nothing ever submitted (or, for an anonymous viewer, nothing to show).
  if (items.length === 0) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {header}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, color: T.faint, padding: 24, textAlign: "center" }}>
          <Archive size={40} strokeWidth={1.2} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".06em", color: T.mut }}>NOTHING ARCHIVED YET</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 360 }}>
            Action requests you raise through an agent, and squadron missions you order from a fleet,
            collect here — split by turn — so you can look back over everything you've asked the GM to resolve.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
      {header}
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 14 : "18px 20px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
          {turnGroups.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 10, color: T.faint, padding: "48px 24px", textAlign: "center" }}>
              <Inbox size={30} strokeWidth={1.3} />
              <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 320 }}>
                No submissions from this {effFilter.startsWith("agent:") ? "agent" : "fleet"}. Choose “All agents &amp; fleets” to see everything.
              </div>
            </div>
          ) : (
            turnGroups.map((g) => {
              const isCurrent = g.turn === currentTurn;
              const actionCount = g.items.filter((x) => x.kind === "action").length;
              const missionCount = g.items.filter((x) => x.kind === "mission").length;
              return (
                <div key={g.turn} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {/* turn band */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    padding: "6px 10px", background: isCurrent ? "rgba(159,194,58,.06)" : T.panel,
                    border: `1px solid ${isCurrent ? T.accent : T.line}`, borderRadius: 2 }}>
                    <span className="stencil" style={{ fontSize: 14, fontWeight: 800, letterSpacing: ".05em",
                      color: isCurrent ? T.accent : T.text }}>
                      TURN {g.turn}
                    </span>
                    {isCurrent && (
                      <span className="mono" style={{ fontSize: 8, letterSpacing: ".1em", textTransform: "uppercase",
                        color: T.accent, border: `1px solid ${T.accent}`, borderRadius: 2, padding: "0 4px" }}>
                        Current
                      </span>
                    )}
                    <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: T.faint }}>
                      {actionCount > 0 && `${actionCount} action${actionCount === 1 ? "" : "s"}`}
                      {actionCount > 0 && missionCount > 0 && " · "}
                      {missionCount > 0 && `${missionCount} squadron order${missionCount === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  {/* the turn's submissions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {g.items.map(card)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
