import { createContext, useCallback, useContext, useState } from "react";
import { T, F, panelStyle, cut } from "../theme.js";
import Btn from "../components/ui/Btn.jsx";

const ConfirmContext = createContext(null);

// App-wide "are you sure?" gate for destructive actions (deletes, Next Turn).
// Mounted once at the root; any component calls useConfirm() to get an async
// confirm(message) that resolves true/false instead of wiring up its own
// dialog state and JSX per call site.
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null); // { message, resolve }

  const confirm = useCallback((message) => new Promise((resolve) => setRequest({ message, resolve })), []);
  const respond = (ok) => {
    setRequest((r) => { if (r) r.resolve(ok); return null; });
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div onPointerDown={(e) => { if (e.target === e.currentTarget) respond(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,.6)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ ...panelStyle, ...cut(10), padding: 20, width: 340, maxWidth: "100%",
            display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: T.text, fontFamily: F.body }}>
              {request.message}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => respond(false)}>Cancel</Btn>
              <Btn kind="danger" onClick={() => respond(true)}>Confirm</Btn>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
