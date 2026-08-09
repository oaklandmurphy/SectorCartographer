import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { inputStyle } from "../../theme.js";

// A <textarea> that grows to fit its content instead of scrolling inside a fixed
// box. Any `minHeight` from `style` stays the floor — it never shrinks past that,
// but it grows as far as the text needs. Drop-in replacement for the bare
// <textarea>s we used to use; it forces `resize: none` (the box sizes itself, so
// the manual drag handle is redundant). Especially wanted on mobile, where a
// short fixed box made long GM write-ups a chore to read back while typing.
//
// Forwards its ref — WikiView drives the caret/selection through it.
const AutoTextarea = forwardRef(function AutoTextarea(
  { value, style, onInput, ...rest }, ref,
) {
  const innerRef = useRef(null);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    // Collapse first so scrollHeight reports the content's natural height, then
    // add the vertical borders back (scrollHeight excludes them, and our global
    // box-sizing: border-box counts them in the height we set).
    el.style.height = "auto";
    const cs = window.getComputedStyle(el);
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = `${el.scrollHeight + border}px`;
  }, []);

  // Re-fit on every value change (typing or an external edit) and after mount.
  // Layout effect so the height is correct before the browser paints the frame.
  useLayoutEffect(resize, [value, resize]);

  // A width change (rotate, window/panel resize) reflows the text, so re-fit.
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  return (
    <textarea
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      value={value}
      onInput={(e) => { resize(); onInput?.(e); }}
      {...rest}
      style={{ ...inputStyle, ...style, resize: "none", overflowY: "hidden" }}
    />
  );
});

export default AutoTextarea;
