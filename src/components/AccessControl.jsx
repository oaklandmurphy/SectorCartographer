import { Lock, Unlock, Shield, UserCog, Users, Plus, Trash2, LogOut, KeyRound, Flag, Ship, EyeOff } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import Btn from "./ui/Btn.jsx";
import PanelPopup from "./ui/PanelPopup.jsx";

// Access badge + popover. Handles four viewer states (open / GM / player / anon)
// and, for the GM, managing player roles used by the asymmetric-info visibility.
export default function AccessControl({
  viewer, roles, factions, canEdit, lockCode, fleetsPublic, toggleFleetsPublic,
  accessOpen, setAccessOpen, codeInput, setCodeInput, codeError, setCodeError,
  setNewLockCode, removeLockCode, tryUnlock, signOut, addRole, patchRole, removeRole, compact,
}) {
  const kind = viewer.kind;
  const badge = {
    open:   { label: "OPEN",      icon: <Unlock size={14} />, title: "Editing is open to everyone with this link" },
    admin:  { label: "GM",        icon: <Shield size={14} />, title: "You are the GM — full access" },
    player: { label: (viewer.roleName || "PLAYER").toUpperCase().slice(0, 12), icon: <UserCog size={14} />,
              title: `Signed in as ${viewer.roleName}` },
    anon:   { label: "VIEW ONLY", icon: <Lock size={14} />,   title: "View only — enter your access code" },
  }[kind];

  return (
    <div style={{ position: "relative" }}>
      <Btn active={accessOpen} onClick={() => { setAccessOpen((o) => !o); setCodeError(""); }} title={badge.title}>
        {badge.icon}{!compact && badge.label}
      </Btn>
      {accessOpen && (
        <PanelPopup frame={{ top: "calc(100% + 6px)", right: 0, width: 288 }} maxHeight="78vh" zIndex={60} gap={10}
          color={T.accent} icon={badge.icon} title="ACCESS" onClose={() => setAccessOpen(false)}>

            {/* ---- open: no GM code set yet ---- */}
            {kind === "open" && (
              <>
                <div style={{ fontSize: 11, color: T.mut, lineHeight: 1.5 }}>
                  Anyone with this link can edit. Set a <b style={{ color: T.text }}>GM code</b> to run the game:
                  you become the GM, and you can create player logins and control what each one sees.
                </div>
                <div style={lbl}>Set a GM code</div>
                <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="e.g. gm-nova7" style={inputStyle} />
                <Btn kind="primary" onClick={() => setNewLockCode(codeInput)} disabled={!codeInput.trim()} style={{ justifyContent: "center" }}>
                  <Shield size={13} /> Become GM
                </Btn>
              </>
            )}

            {/* ---- admin / GM ---- */}
            {kind === "admin" && (
              <>
                <div style={{ fontSize: 11, color: T.accent, lineHeight: 1.5 }}>
                  You are the <b>GM</b>. You see everything and edit everything. Players see only what you share with their role.
                </div>

                <RoleManager roles={roles} factions={factions} addRole={addRole} patchRole={patchRole} removeRole={removeRole} />

                <FleetVisibility fleetsPublic={fleetsPublic} toggleFleetsPublic={toggleFleetsPublic} />

                <div style={{ borderTop: `1px solid ${T.line}`, margin: "2px 0" }} />
                <div style={lbl}>GM code</div>
                <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="change GM code" style={inputStyle} />
                <Btn kind="primary" onClick={() => setNewLockCode(codeInput)} disabled={!codeInput.trim()} style={{ justifyContent: "center" }}>
                  Update GM code
                </Btn>
                <Btn kind="danger" onClick={removeLockCode} style={{ justifyContent: "center" }}>
                  <Unlock size={13} /> Remove lock (open to all)
                </Btn>
              </>
            )}

            {/* ---- player: signed in with a role password ---- */}
            {kind === "player" && (
              <>
                <div style={{ fontSize: 11, color: T.mut, lineHeight: 1.5 }}>
                  Signed in as <b style={{ color: T.accent }}>{viewer.roleName}</b>. You see the map, codex and
                  fleets as your character knows them.
                </div>
                <Btn onClick={signOut} style={{ justifyContent: "center" }}>
                  <LogOut size={13} /> Sign out
                </Btn>
              </>
            )}

            {/* ---- anon: GM code set, no code entered ---- */}
            {kind === "anon" && (
              <>
                <div style={{ fontSize: 11, color: T.mut, lineHeight: 1.5 }}>
                  Enter your <b style={{ color: T.text }}>access code</b> — your player code to see what your
                  character knows, or the GM code for full access.
                </div>
                <input value={codeInput} onChange={(e) => { setCodeInput(e.target.value); setCodeError(""); }}
                  placeholder="access code" style={inputStyle}
                  onKeyDown={(e) => { if (e.key === "Enter") tryUnlock(codeInput); }} />
                {codeError && <div style={{ fontSize: 10.5, color: T.danger }}>{codeError}</div>}
                <Btn kind="primary" onClick={() => tryUnlock(codeInput)} disabled={!codeInput.trim()} style={{ justifyContent: "center" }}>
                  <KeyRound size={13} /> Sign in
                </Btn>
              </>
            )}
        </PanelPopup>
      )}
    </div>
  );
}

// GM's list of player roles: name, login code, and the faction each is tied to.
// The faction drives which fleet positions that login sees (its own + allies/vassals).
function RoleManager({ roles, factions, addRole, patchRole, removeRole }) {
  const facList = factions || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}>
        <Users size={12} /> Player roles
        <span style={{ marginLeft: "auto", color: T.faint }}>{roles.length}</span>
      </div>
      {roles.length === 0 && (
        <div style={{ fontSize: 10.5, color: T.faint, lineHeight: 1.5, padding: "8px 6px", textAlign: "center",
          border: `1px dashed ${T.line}` }}>
          No players yet. Add a role, give your player its code, tie it to a faction, then choose what each can see on codex entries and carriers.
        </div>
      )}
      {roles.map((r) => (
        <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 4, background: T.panel2,
          border: `1px solid ${T.line}`, borderRadius: 2, padding: 6 }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <div style={{ width: 4, alignSelf: "stretch", background: r.color || T.accent, flexShrink: 0, minHeight: 20 }} />
            <input value={r.name} onChange={(e) => patchRole(r.id, { name: e.target.value })}
              placeholder="Player / character" style={{ ...inputStyle, padding: "3px 6px", flex: 1 }} />
            <button onClick={() => removeRole(r.id)} title="Remove player"
              style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2, flexShrink: 0 }}>
              <Trash2 size={14} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <KeyRound size={12} style={{ color: T.faint, flexShrink: 0 }} />
            <input value={r.password} onChange={(e) => patchRole(r.id, { password: e.target.value })}
              placeholder="login code for this player"
              style={{ ...inputStyle, padding: "3px 6px", flex: 1,
                borderColor: r.password.trim() ? T.line : T.amber }} />
          </div>
          {!r.password.trim() && (
            <div style={{ fontSize: 9, color: T.amber }}>Set a code so this player can sign in.</div>
          )}
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <Flag size={12} style={{ color: T.faint, flexShrink: 0 }} />
            <select value={r.factionId || ""} onChange={(e) => patchRole(r.id, { factionId: e.target.value || undefined })}
              title="Faction this login can see fleets for"
              style={{ ...selStyle, padding: "3px 6px", flex: 1 }}>
              <option value="">No faction — sees only shared fleets</option>
              {facList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        </div>
      ))}
      <Btn kind="primary" onClick={addRole} style={{ justifyContent: "center" }}>
        <Plus size={13} /> Add player role
      </Btn>
    </div>
  );
}

// GM switch for whether fleet positions are visible to viewers without a login.
// On (default) is the old behavior — anyone with the link sees public fleets. Off
// is the "game has started" state: only signed-in players see fleets, each just
// their own faction's and its allies'/vassals'.
function FleetVisibility({ fleetsPublic, toggleFleetsPublic }) {
  const hidden = fleetsPublic === false;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ borderTop: `1px solid ${T.line}`, margin: "2px 0" }} />
      <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}>
        <Ship size={12} /> Fleet positions
      </div>
      <Btn active={hidden} onClick={() => toggleFleetsPublic(hidden)}
        title={hidden ? "Fleets are hidden from viewers without a login" : "Fleets are visible to anyone with the link"}
        style={{ justifyContent: "flex-start" }}>
        {hidden ? <EyeOff size={13} /> : <Users size={13} />}
        {hidden ? "Signed-in players only" : "Public — anyone with the link"}
      </Btn>
      <div style={{ fontSize: 9.5, color: hidden ? T.amber : T.mut, lineHeight: 1.5 }}>
        {hidden
          ? "Only players signed in with a code see fleets — each sees their own faction's positions plus its allies' and vassals'."
          : "Anyone with the link sees fleet positions. Turn this off once the game starts to hide them from players without a login."}
      </div>
    </div>
  );
}
