import { useMemo, useRef, useState } from "react";
import { Images, Plus, X, ChevronRight, ChevronDown, AlertTriangle } from "lucide-react";
import { T, inputStyle, lbl } from "../theme.js";
import { artDataUri, artUsage, validateSvg, mergeNames } from "../lib/shipArt.js";
import { knownModels, knownCarrierModels } from "../lib/carriers.js";
import Btn from "./ui/Btn.jsx";

// Upload / rename / remove the sector's ship art. Art is matched to ships by
// name, so the name field autocompletes from the models actually in use and
// flags entries that match nothing — a typo here just silently shows no picture.
export default function ArtLibrary({ art, fleets, canEdit, addArt, patchArt, removeArt, defaultOpen = false }) {
  // Collapsed by default so the roster stays the star of the tab; the count and
  // the upload button live in the always-visible header, so art is still findable.
  const [open, setOpen] = useState(defaultOpen);
  const [errors, setErrors] = useState([]);
  const fileRef = useRef(null);

  // every model name in play — what an art entry could usefully be called
  const nameSuggestions = useMemo(
    () => mergeNames(knownModels(fleets), knownCarrierModels(fleets)),
    [fleets]
  );
  const SUGGEST_ID = "artlib-model-names";

  function onFiles(e) {
    const files = [...e.target.files];
    e.target.value = ""; // let the same file be picked again after a fix
    const errs = [];
    let pending = files.length;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        const err = validateSvg(text, file.size);
        if (err) errs.push(`${file.name} — ${err}`);
        else addArt(file.name.replace(/\.svg$/i, "").trim() || "Untitled", text);
        if (--pending === 0) setErrors(errs);
      };
      reader.onerror = () => {
        errs.push(`${file.name} — could not be read`);
        if (--pending === 0) setErrors(errs);
      };
      reader.readAsText(file);
    });
    if (files.length) setOpen(true);
  }

  const thumb = (a, size) => {
    const uri = artDataUri(a.svg);
    return (
      <div style={{ width: size, height: size, flexShrink: 0, background: T.panel3,
        border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden" }}>
        {/* <img> on purpose — see the security note in lib/shipArt.js */}
        {uri && <img src={uri} alt={a.name} style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }} />}
      </div>
    );
  };

  return (
    <div style={{ borderBottom: `2px solid ${T.line}`, background: T.panel, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px" }}>
        <button onClick={() => setOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
            color: T.text, cursor: "pointer", padding: 0, flex: 1, textAlign: "left",
            fontFamily: "'Oswald', sans-serif" }}>
          {open ? <ChevronDown size={14} style={{ color: T.faint }} /> : <ChevronRight size={14} style={{ color: T.faint }} />}
          <Images size={14} style={{ color: T.accent }} />
          <span className="stencil" style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em" }}>SHIP ART</span>
          <span className="mono" style={{ fontSize: 10, color: T.faint }}>{art.length}</span>
        </button>
        {canEdit && (
          <>
            <input ref={fileRef} type="file" accept=".svg,image/svg+xml" multiple onChange={onFiles}
              style={{ display: "none" }} />
            <Btn onClick={() => fileRef.current && fileRef.current.click()}
              title="Upload one or more SVG files" style={{ padding: "3px 8px", fontSize: 10.5 }}>
              <Plus size={12} /> Upload SVG
            </Btn>
          </>
        )}
      </div>

      {errors.length > 0 && (
        <div style={{ margin: "0 10px 8px", padding: "6px 8px", background: "rgba(178,58,46,.12)",
          border: `1px solid rgba(178,58,46,.5)`, borderRadius: 2, fontSize: 10.5, color: "#e5988c",
          display: "flex", gap: 6, alignItems: "flex-start" }}>
          <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, lineHeight: 1.5 }}>
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
          <button onClick={() => setErrors([])}
            style={{ background: "none", border: "none", color: "#e5988c", cursor: "pointer", padding: 0 }}>
            <X size={12} />
          </button>
        </div>
      )}

      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          <datalist id={SUGGEST_ID}>
            {nameSuggestions.map((n) => <option key={n} value={n} />)}
          </datalist>

          {art.length === 0 && (
            <div style={{ fontSize: 10.5, color: T.faint, padding: "10px 8px", textAlign: "center",
              border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
              No ship art yet.{canEdit
                ? " Upload an SVG, then name it to match a carrier's or squadron's model."
                : ""}
            </div>
          )}

          {art.map((a) => {
            const use = artUsage(fleets, a.name);
            const used = use.carriers + use.squadrons > 0;
            return (
              <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", background: T.panel2,
                border: `1px solid ${T.line}`, borderRadius: 2, padding: 6 }}>
                {thumb(a, 34)}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  {canEdit ? (
                    <input value={a.name} list={SUGGEST_ID} placeholder="model name"
                      onChange={(e) => patchArt(a.id, { name: e.target.value })}
                      style={{ ...inputStyle, padding: "3px 6px" }} />
                  ) : (
                    <div className="mono" style={{ fontSize: 12, color: T.text, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                  )}
                  {used ? (
                    <div className="mono" style={{ fontSize: 9.5, color: T.faint }}>
                      {use.carriers > 0 && `${use.carriers} carrier${use.carriers === 1 ? "" : "s"}`}
                      {use.carriers > 0 && use.squadrons > 0 && " · "}
                      {use.squadrons > 0 && `${use.squadrons} squadron${use.squadrons === 1 ? "" : "s"}`}
                    </div>
                  ) : (
                    <div style={{ fontSize: 9.5, color: T.amber, display: "flex", alignItems: "center", gap: 3 }}>
                      <AlertTriangle size={9} /> matches no ship yet
                    </div>
                  )}
                </div>
                {canEdit && (
                  <button onClick={() => removeArt(a.id)} title="Remove this art"
                    style={{ background: "none", border: "none", color: T.danger, cursor: "pointer",
                      padding: 2, flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}

          {canEdit && art.length > 0 && (
            <div style={{ ...lbl, fontSize: 9, color: T.faint, lineHeight: 1.6, textTransform: "none",
              letterSpacing: 0 }}>
              An entry's name must match a carrier's or squadron's model for its picture to appear.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
