import { Bell, Check, CheckCheck, Clock, FileText, VenetianMask, Ship } from "lucide-react";
import { T } from "../theme.js";
import Btn from "./ui/Btn.jsx";

const dateTime = (value) => value ? new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(value)) : "Unknown";

// One acknowledgeable item: an icon, a title line, a "when" line, an Acknowledge
// button and a primary link to jump to the full result. Shared shape for all
// three Updates sections (articles, resolved actions, resolved missions) —
// only the icon, title/subtitle text and the two callbacks differ.
function UpdateCard({ icon, title, subtitle, when, isMobile, onAcknowledge, onOpen, openLabel }) {
  return (
    <div style={{ border: `1px solid ${T.line}`, background: T.panel, padding: "13px 14px", display: "flex", gap: 12, alignItems: "center" }}>
      {icon}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="stencil" style={{ fontSize: 16, letterSpacing: ".04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: T.mut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{subtitle}</div>
        )}
        <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 4, fontSize: 10.5, color: T.faint }}>
          <Clock size={11} /> {when}
        </div>
      </div>
      <Btn title="Dismiss without opening" onClick={onAcknowledge}>
        <Check size={14} /> {!isMobile && "Acknowledge"}
      </Btn>
      <Btn kind="primary" onClick={onOpen}>{openLabel}</Btn>
    </div>
  );
}

// A counted section header: icon, stencil label, count, and an "Acknowledge
// all" button that only shows once there's something to clear.
function SectionHeader({ icon, label, count, isMobile, onAcknowledgeAll }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {icon}
      <div className="stencil" style={{ fontSize: 15, letterSpacing: ".05em", flex: 1 }}>{label} ({count})</div>
      {count > 0 && (
        <Btn onClick={onAcknowledgeAll} title={`Dismiss every ${label.toLowerCase()} entry below without opening it`}>
          <CheckCheck size={14} /> {!isMobile && "Acknowledge all"}
        </Btn>
      )}
    </div>
  );
}

export default function UpdatesView({
  articles, factionName, isMobile, openArticle, acknowledgeArticle, acknowledgeAll,
  resolvedActions, openAction, acknowledgeAction, acknowledgeAllActions,
  resolvedMissions, openMission, acknowledgeMission, acknowledgeAllMissions,
}) {
  const actions = resolvedActions || [];
  const missions = resolvedMissions || [];
  return (
    <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: isMobile ? 14 : 24 }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={22} color={T.accent} />
          <div className="stencil" style={{ fontSize: 20, letterSpacing: ".05em", flex: 1 }}>UPDATES</div>
        </div>

        {!factionName ? null : (
          <>
            {/* Resolved action requests and resolved squadron missions are their
                own counters, separate from the codex counter below — a player
                should be able to tell "the GM ruled on something" apart from
                "there's new lore to read" at a glance. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SectionHeader icon={<VenetianMask size={18} color={T.accent} />} label="Action requests resolved"
                count={actions.length} isMobile={isMobile} onAcknowledgeAll={acknowledgeAllActions} />
              {actions.length === 0 ? (
                <div style={{ border: `1px dashed ${T.line}`, color: T.faint, padding: "16px", textAlign: "center", fontSize: 12 }}>
                  No unread resolutions.
                </div>
              ) : actions.map((rq) => (
                <UpdateCard key={rq.id} isMobile={isMobile}
                  icon={<VenetianMask size={18} color={T.accent} style={{ flexShrink: 0 }} />}
                  title={rq.text || "Action request"}
                  subtitle={rq.agentName}
                  when={`Resolved ${dateTime(rq.resolvedAt)}`}
                  onAcknowledge={() => acknowledgeAction(rq)}
                  onOpen={() => openAction(rq.agentId, rq.factionId)}
                  openLabel="View" />
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SectionHeader icon={<Ship size={18} color={T.accent} />} label="Squadron missions resolved"
                count={missions.length} isMobile={isMobile} onAcknowledgeAll={acknowledgeAllMissions} />
              {missions.length === 0 ? (
                <div style={{ border: `1px dashed ${T.line}`, color: T.faint, padding: "16px", textAlign: "center", fontSize: 12 }}>
                  No unread resolutions.
                </div>
              ) : missions.map((m) => (
                <UpdateCard key={m.id} isMobile={isMobile}
                  icon={<Ship size={18} color={T.accent} style={{ flexShrink: 0 }} />}
                  title={m.text || "Squadron mission"}
                  subtitle={m.fleetName}
                  when={`Resolved ${dateTime(m.resolvedAt)}`}
                  onAcknowledge={() => acknowledgeMission(m)}
                  onOpen={() => openMission(m.fleetId)}
                  openLabel="View" />
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={18} color={T.accent} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".05em", flex: 1 }}>CODEX ARTICLES ({articles.length})</div>
          {articles.length > 0 && (
            <Btn onClick={acknowledgeAll} title="Dismiss every update below without reading it">
              <CheckCheck size={14} /> {!isMobile && "Acknowledge all"}
            </Btn>
          )}
        </div>
        {!factionName ? null : articles.length === 0 ? (
          <div style={{ border: `1px dashed ${T.line}`, color: T.faint, padding: "28px 16px", textAlign: "center", fontSize: 12 }}>
            Your faction is caught up.
          </div>
        ) : articles.map((article) => (
          <UpdateCard key={article.id} isMobile={isMobile}
            icon={<FileText size={18} color={T.accent} style={{ flexShrink: 0 }} />}
            title={article.title || "Untitled"}
            when={`Updated ${dateTime(article.updatedAt || article.createdAt)}`}
            onAcknowledge={() => acknowledgeArticle(article)}
            onOpen={() => openArticle(article.id)}
            openLabel="Read" />
        ))}
      </div>
    </div>
  );
}
