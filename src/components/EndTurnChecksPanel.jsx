import { useEffect, useMemo } from "react";
import { ListChecks, Fuel, Star, Dices, Check, X, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";
import { T, F } from "../theme.js";
import { checkTotal, ossiteCheckPassed, OSSITE_RESOURCE_NAME } from "../lib/endTurnChecks.js";
import Btn from "./ui/Btn.jsx";

const DIE_FACES = { 1: Dice1, 2: Dice2, 3: Dice3, 4: Dice4, 5: Dice5, 6: Dice6 };
const OSSITE_TARGET = 8; // 2d6 passes on 8+

// A compact [Auto | Pass | Fail] segment for one check. "Auto" reads the roll;
// "Pass"/"Fail" force the outcome regardless of the dice (override). The active
// segment is highlighted so it's obvious at a glance which checks the GM has
// touched by hand.
function OverrideSeg({ override, onSet }) {
  const opts = [
    { id: null, label: "Auto", color: T.mut },
    { id: "success", label: "Pass", color: T.accent },
    { id: "failure", label: "Fail", color: T.danger },
  ];
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${T.line}`, borderRadius: 2, overflow: "hidden" }}>
      {opts.map((o) => {
        const on = override === o.id || (o.id === null && !override);
        return (
          <button key={o.label} onClick={() => onSet(o.id)}
            style={{ border: "none", cursor: "pointer", padding: "4px 9px", fontSize: 10.5, fontWeight: 700,
              letterSpacing: ".04em", textTransform: "uppercase", fontFamily: F.body,
              background: on ? o.color : "transparent", color: on ? T.onAccent : T.faint }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// GM Tools → End of Turn Checks. Manages the set of checks that resolve when the
// turn advances. Today that's the Ossite Surplus check: one row per system
// carrying the ossite trait, pre-rolled 2d6 (pass on 8+), each pass handing its
// controlling faction +1 Ossite Surplus on Next Turn. The rolls come predone —
// the panel asks App to roll any system that lacks a check for this turn on
// mount — and the GM can re-roll or force any result before advancing.
export default function EndTurnChecksPanel({
  systems, factions, endTurnChecks, turnNumber, isMobile,
  ensureOssiteChecks, rerollOssiteCheck, setOssiteCheckOverride, rerollAllOssiteChecks, notesPane,
}) {
  const factionById = (id) => (factions || []).find((f) => f.id === id) || null;

  const ossiteSystems = useMemo(
    () => (systems || []).filter((s) => s.hasOssite).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [systems],
  );
  // A stable signature of which systems carry the trait, so the "predo the
  // rolls" effect fires when the set changes (or the turn ticks over) but not on
  // every unrelated render.
  const ossiteSig = ossiteSystems.map((s) => s.id).join(",");
  useEffect(() => {
    if (ossiteSystems.length > 0) ensureOssiteChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ossiteSig, turnNumber]);

  const checkFor = (systemId) => (endTurnChecks || []).find(
    (c) => c.type === "ossite" && c.turn === turnNumber && !c.appliedAt && c.systemId === systemId) || null;

  // Per-faction tally of what a Next Turn right now would award — a passing
  // check on a system with a real controller (not fac_none).
  const awards = useMemo(() => {
    const gains = new Map();
    ossiteSystems.forEach((s) => {
      const c = checkFor(s.id);
      if (c && ossiteCheckPassed(c) && s.factionId && s.factionId !== "fac_none") {
        gains.set(s.factionId, (gains.get(s.factionId) || 0) + 1);
      }
    });
    return gains;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ossiteSystems, endTurnChecks, turnNumber]);
  const totalAward = [...awards.values()].reduce((n, v) => n + v, 0);
  const passingCount = ossiteSystems.filter((s) => { const c = checkFor(s.id); return c && ossiteCheckPassed(c); }).length;

  const list = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
      <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
        display: "flex", alignItems: "center", gap: 7 }}>
        <ListChecks size={15} color={T.accent} /> END OF TURN CHECKS
      </div>

      {/* Ossite Surplus check */}
      <div style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel }}>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.line}`,
          display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <Fuel size={15} color={T.accent} style={{ flexShrink: 0 }} />
          <span className="stencil" style={{ fontSize: 14, letterSpacing: ".04em", color: T.text }}>Ossite Surplus Check</span>
          <span style={{ fontSize: 10.5, color: T.mut }}>2d6 · pass on {OSSITE_TARGET}+</span>
          {ossiteSystems.length > 0 && (
            <Btn onClick={rerollAllOssiteChecks} style={{ marginLeft: "auto" }} title="Re-roll every check for this turn, clearing overrides">
              <Dices size={13} /> Re-roll all
            </Btn>
          )}
        </div>

        <div style={{ padding: "9px 12px", borderBottom: `1px solid ${T.line}`, fontSize: 11, color: T.mut, lineHeight: 1.6 }}>
          Runs at every system with the ossite trait. Each pass hands the system's controlling faction {" "}
          <span style={{ color: T.text }}>+1 {OSSITE_RESOURCE_NAME}</span> when you press {" "}
          <span style={{ color: T.text }}>Next Turn</span>. Rolls are made automatically — re-roll or force any result below.
        </div>

        {ossiteSystems.length === 0 ? (
          <div style={{ fontSize: 11.5, color: T.faint, padding: "20px 12px", textAlign: "center", lineHeight: 1.6 }}>
            No systems carry the ossite trait yet. Open a system on the map and tick {" "}
            <span style={{ color: T.text }}>Ossite deposit</span> to have it checked each turn.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {ossiteSystems.map((s) => {
              const c = checkFor(s.id);
              const owner = factionById(s.factionId);
              const uncontrolled = !s.factionId || s.factionId === "fac_none";
              const passed = c ? ossiteCheckPassed(c) : false;
              const total = c ? checkTotal(c) : 0;
              const D1 = c && c.dice ? DIE_FACES[c.dice.d1] : null;
              const D2 = c && c.dice ? DIE_FACES[c.dice.d2] : null;
              return (
                <div key={s.id} style={{ padding: "10px 12px", borderTop: `1px solid ${T.line}`,
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {/* system + controller */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "1 1 180px", minWidth: 0 }}>
                    <Star size={13} color={owner ? owner.color : T.faint} style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name || "System"}</div>
                      <div style={{ fontSize: 10, color: uncontrolled ? T.faint : T.mut }}>
                        {uncontrolled ? "Uncontrolled — no award" : (owner ? owner.name : "Unknown faction")}
                      </div>
                    </div>
                  </div>

                  {/* dice + total */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {D1 && D2 ? (
                      <>
                        <D1 size={26} color={c.override ? T.faint : T.text} strokeWidth={1.5} />
                        <D2 size={26} color={c.override ? T.faint : T.text} strokeWidth={1.5} />
                        <span className="mono" style={{ fontSize: 13, fontWeight: 800,
                          color: c.override ? T.faint : T.text, width: 20, textAlign: "center" }}>{total}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 10.5, color: T.faint }}>rolling…</span>
                    )}
                    <button onClick={() => c && rerollOssiteCheck(c.id)} disabled={!c} title="Re-roll this check"
                      style={{ background: "none", border: `1px solid ${T.line}`, borderRadius: 2, cursor: c ? "pointer" : "default",
                        color: T.mut, padding: 4, display: "flex", opacity: c ? 1 : 0.4 }}>
                      <Dices size={14} />
                    </button>
                  </div>

                  {/* result pill */}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
                    fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
                    border: `1px solid ${passed ? T.accent : T.danger}`, borderRadius: 2, padding: "3px 8px",
                    color: passed ? T.accent : T.danger, background: passed ? "rgba(159,194,58,.12)" : "rgba(178,58,46,.12)",
                    minWidth: 74, justifyContent: "center" }}>
                    {passed ? <Check size={11} /> : <X size={11} />}{passed ? "Surplus" : "No gain"}
                    {c && c.override && <span title="Forced by the GM" style={{ opacity: 0.7 }}>*</span>}
                  </span>

                  {/* manual override */}
                  <OverrideSeg override={c ? c.override : null}
                    onSet={(v) => c && setOssiteCheckOverride(c.id, v)} />
                </div>
              );
            })}

            {/* award summary */}
            <div style={{ padding: "10px 12px", borderTop: `2px solid ${T.line}`, background: T.panel2,
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: T.mut }}>
                {passingCount} of {ossiteSystems.length} passing
              </span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: totalAward > 0 ? T.accent : T.faint, fontWeight: 700 }}>
                {totalAward > 0
                  ? `Next Turn awards +${totalAward} ${OSSITE_RESOURCE_NAME}`
                  : `No ${OSSITE_RESOURCE_NAME} awarded this turn`}
              </span>
            </div>
            {awards.size > 0 && (
              <div style={{ padding: "8px 12px", borderTop: `1px solid ${T.line}`, background: T.panel2,
                display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[...awards.entries()].map(([fid, amt]) => {
                  const fac = factionById(fid);
                  return (
                    <span key={fid} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11,
                      border: `1px solid ${T.line}`, borderRadius: 2, padding: "3px 8px", color: T.text }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: fac ? fac.color : T.faint }} />
                      {fac ? fac.name : "Unknown faction"}
                      <span className="mono" style={{ color: T.accent, fontWeight: 800 }}>+{amt}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
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
