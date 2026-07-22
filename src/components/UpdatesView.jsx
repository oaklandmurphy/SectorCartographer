import { Bell, Clock, FileText } from "lucide-react";
import { T } from "../theme.js";
import Btn from "./ui/Btn.jsx";

const dateTime = (value) => value ? new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(value)) : "Unknown";

export default function UpdatesView({ articles, factionName, isMobile, openArticle }) {
  return (
    <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: isMobile ? 14 : 24 }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={22} color={T.accent} />
          <div className="stencil" style={{ fontSize: 20, letterSpacing: ".05em" }}>UPDATES</div>
        </div>
        {!factionName ? null : articles.length === 0 ? (
          <div style={{ border: `1px dashed ${T.line}`, color: T.faint, padding: "28px 16px", textAlign: "center", fontSize: 12 }}>
            Your faction is caught up.
          </div>
        ) : articles.map((article) => (
          <div key={article.id} style={{ border: `1px solid ${T.line}`, background: T.panel, padding: "13px 14px", display: "flex", gap: 12, alignItems: "center" }}>
            <FileText size={18} color={T.accent} style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="stencil" style={{ fontSize: 16, letterSpacing: ".04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{article.title || "Untitled"}</div>
              <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 4, fontSize: 10.5, color: T.faint }}>
                <Clock size={11} /> Updated {dateTime(article.updatedAt || article.createdAt)}
              </div>
            </div>
            <Btn kind="primary" onClick={() => openArticle(article.id)}>Read</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}
