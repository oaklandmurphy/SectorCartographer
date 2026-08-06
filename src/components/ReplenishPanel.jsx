import { useMemo, useState } from "react";
import { PackagePlus, Factory, Plus, Minus, Ship, Star } from "lucide-react";
import { T, F, inputStyle, lbl } from "../theme.js";
import { squadronsOf, knownModels } from "../lib/carriers.js";
import {
  eligibleSystemFor, systemCap, systemHasShipyard, systemStagedTotal, stagedFor, recordId,
} from "../lib/replenish.js";
import Btn from "./ui/Btn.jsx";

const MODELS_ID = "replenish-models";

// A count field with − / + steppers. Shows the amount currently staged for one
// carrier+model; committing (blur / Enter / stepper) calls onSet with the target
// value, and App turns that into a budget-clamped delta — so the field snaps back
// to whatever the shared system pool actually allowed.
function StagedField({ staged, canAdd, onSet }) {
  const [draft, setDraft] = useState(null); // null = display the staged prop
  const commit = () => {
    if (draft === null) return;
    onSet(Math.max(0, Math.floor(Number(draft) || 0)));
    setDraft(null);
  };
  const cell = {
    background: T.panel2, border: `1px solid ${T.line}`, color: T.text, borderRadius: 2,
    width: 26, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", flexShrink: 0,
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <button title="Remove one" onClick={() => onSet(staged - 1)} disabled={staged <= 0}
        style={{ ...cell, opacity: staged <= 0 ? 0.35 : 1, cursor: staged <= 0 ? "not-allowed" : "pointer" }}>
        <Minus size={13} />
      </button>
      <input className="mono" inputMode="numeric" value={draft === null ? String(staged) : draft}
        onFocus={() => setDraft(String(staged))}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } }}
        style={{ ...inputStyle, width: 46, textAlign: "center", padding: "4px 4px", fontWeight: 700,
          color: staged > 0 ? T.accent : T.text }} />
      <button title="Add one" onClick={() => onSet(staged + 1)} disabled={!canAdd}
        style={{ ...cell, opacity: canAdd ? 1 : 0.35, cursor: canAdd ? "pointer" : "not-allowed" }}>
        <Plus size={13} />
      </button>
    </div>
  );
}

// One carrier: its class/name, then a row per squadron model (existing or newly
// staged) with a StagedField, plus an add-model control for craft the carrier
// doesn't fly yet. `remaining` is the shared system pool left this turn — every
// StagedField's + is disabled once it hits zero.
function CarrierRow({ ship, record, remaining, onStage }) {
  const [newModel, setNewModel] = useState("");
  // Merge the carrier's existing squadron models with any staged for a model it
  // doesn't currently have (a brand-new model the GM just added).
  const slots = useMemo(() => {
    const out = squadronsOf(ship).map((sq) => ({
      model: sq.model || "", current: Number(sq.count) || 0, isNew: false,
    }));
    const known = new Set(out.map((s) => s.model));
    for (const l of (record && record.lines) || []) {
      if (l.shipId === ship.id && !known.has(l.model)) {
        out.push({ model: l.model, current: 0, isNew: true });
        known.add(l.model);
      }
    }
    return out;
  }, [ship, record]);

  const addNew = () => {
    const m = newModel.trim();
    if (!m || remaining <= 0) return;
    onStage(ship.id, m, 1);
    setNewModel("");
  };

  return (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2, padding: 8,
      display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <Ship size={13} color={T.mut} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 700, color: T.text }}>{ship.name || "Carrier"}</span>
        {ship.model && <span className="mono" style={{ fontSize: 10, color: T.faint }}>{ship.model}</span>}
      </div>
      {slots.length === 0 && (
        <div style={{ fontSize: 10.5, color: T.faint, fontStyle: "italic" }}>Empty hangar — add a model below.</div>
      )}
      {slots.map((slot) => {
        const staged = stagedFor(record, ship.id, slot.model);
        return (
          <div key={slot.model || "(unnamed)"} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 12, color: T.text, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {slot.model || "(unnamed)"}
                {slot.isNew && <span style={{ color: T.amber, fontSize: 9.5, marginLeft: 5 }}>NEW</span>}
              </div>
              <div style={{ fontSize: 10, color: T.faint }}>
                {slot.current} now{staged > 0 ? ` → ${slot.current + staged}` : ""}
              </div>
            </div>
            <StagedField staged={staged} canAdd={remaining > 0}
              onSet={(target) => onStage(ship.id, slot.model, target - staged)} />
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input className="mono" list={MODELS_ID} value={newModel} placeholder="add a model…"
          onChange={(e) => setNewModel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addNew(); }}
          style={{ ...inputStyle, flex: 1, padding: "4px 7px", fontSize: 11.5 }} />
        <Btn onClick={addNew} disabled={!newModel.trim() || remaining <= 0} title="Stage one of this model">
          <Plus size={13} /> Add
        </Btn>
      </div>
    </div>
  );
}

// GM Tools → Replenish. Lists every fleet sitting in a system it may resupply in
// (own / allied / vassal space) grouped by that system, with the shared per-turn
// budget (12, or 25 with a shipyard) shown as a meter. The GM stages exactly which
// carriers/models get topped up; nextTurn() applies it and notifies each faction.
export default function ReplenishPanel({
  fleets, systems, relations, factions, replenishments, turnNumber, isMobile, stageReplenishment, notesPane,
}) {
  const factionById = (id) => (factions || []).find((f) => f.id === id) || null;
  const models = useMemo(() => knownModels(fleets), [fleets]);
  const recordFor = (fleetId) => (replenishments || []).find((r) => r.id === recordId(turnNumber, fleetId));

  // Group eligible fleets by the system they'd replenish in. A fleet needs a
  // carrier to be worth listing; a system with no eligible fleet is skipped.
  const groups = useMemo(() => {
    const bySystem = new Map();
    for (const f of fleets || []) {
      if (!(f.ships || []).length) continue;
      const system = eligibleSystemFor(f, systems, relations);
      if (!system) continue;
      if (!bySystem.has(system.id)) bySystem.set(system.id, { system, fleets: [] });
      bySystem.get(system.id).fleets.push(f);
    }
    return [...bySystem.values()]
      .map(({ system, fleets: fs }) => {
        const cap = systemCap(system);
        const used = systemStagedTotal(replenishments, turnNumber, system.id);
        return { system, fleets: fs, cap, used, remaining: Math.max(0, cap - used),
          hasShipyard: systemHasShipyard(system) };
      })
      .sort((a, b) => a.system.name.localeCompare(b.system.name));
  }, [fleets, systems, relations, replenishments, turnNumber]);

  const list = (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 720 }}>
      <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
        display: "flex", alignItems: "center", gap: 7 }}>
        <PackagePlus size={15} color={T.accent} /> REPLENISH STRIKE CRAFT
      </div>
      <div style={{ fontSize: 11, color: T.mut, lineHeight: 1.6, marginTop: -8 }}>
        Fleets in friendly space (own, allied, or vassal systems). Each system tops up {" "}
        {12} craft per turn — {25} with a shipyard — shared across every fleet in it. Staged
        amounts apply on <span style={{ color: T.text }}>Next Turn</span>, and each faction is
        notified of its own top-ups.
      </div>

      {groups.length === 0 && (
        <div style={{ fontSize: 11.5, color: T.faint, padding: "20px 8px", textAlign: "center",
          border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
          No fleets are sitting in systems they can replenish in. A carrier can only be
          topped up while its fleet is in a system owned by its faction, or one allied or
          vassaled to it.
        </div>
      )}

      {groups.map(({ system, fleets: fs, cap, used, remaining, hasShipyard }) => {
        const owner = factionById(system.factionId);
        const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
        return (
          <div key={system.id} style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.line}`,
              display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <Star size={14} color={owner ? owner.color : T.faint} style={{ flexShrink: 0 }} />
              <span className="stencil" style={{ fontSize: 14, letterSpacing: ".04em", color: T.text }}>{system.name}</span>
              {owner && <span style={{ fontSize: 10.5, color: T.mut }}>{owner.name}</span>}
              {hasShipyard && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5,
                  color: T.amber, border: `1px solid ${T.amber}`, borderRadius: 2, padding: "1px 5px",
                  letterSpacing: ".08em", textTransform: "uppercase" }}>
                  <Factory size={11} /> Shipyard
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 90, height: 6, background: T.panel3, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%",
                    background: remaining > 0 ? T.accent : T.amber }} />
                </div>
                <span className="mono" style={{ fontSize: 11, color: remaining > 0 ? T.text : T.amber }}>
                  {used} / {cap}
                </span>
              </div>
            </div>

            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
              {fs.map((fleet) => {
                const fac = factionById(fleet.factionId);
                const record = recordFor(fleet.id);
                return (
                  <div key={fleet.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%",
                        background: fac ? fac.color : T.faint, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{fleet.name || "Fleet"}</span>
                      {fac && <span style={{ fontSize: 10, color: T.faint }}>{fac.name}</span>}
                    </div>
                    <div style={{ display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
                      {fleet.ships.map((ship) => (
                        <CarrierRow key={ship.id} ship={ship} record={record} remaining={remaining}
                          onStage={(shipId, model, delta) => stageReplenishment(fleet.id, shipId, model, delta)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <datalist id={MODELS_ID}>
        {models.map((m) => <option key={m} value={m} />)}
      </datalist>
    </div>
  );

  if (isMobile) return list;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", background: T.void }}>
      <div className="scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 18 }}>
        {list}
      </div>
      {notesPane && (
        <div className="scroll" style={{ width: 340, flexShrink: 0, borderLeft: `2px solid ${T.line}`,
          background: T.void, overflowY: "auto", padding: 18 }}>
          {notesPane}
        </div>
      )}
    </div>
  );
}
