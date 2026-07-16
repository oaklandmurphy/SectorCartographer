// Geometry for the map's piece popups. Kept free of React so it can be reasoned
// about (and tested) on its own.

export const EDGE = 8;  // breathing room kept between the popup and the container edge
export const GAP = 30;  // offset from the piece the popup points at, so it never sits on top of it

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

// How tall a popup is allowed to get before its body starts scrolling.
// Mobile is a bottom sheet, so it deliberately leaves the top of the map visible.
export function popupMaxHeight(containerH, isMobile) {
  const room = Math.max(160, containerH - EDGE * 2);
  return isMobile ? clamp(Math.round(containerH * 0.62), 200, room) : room;
}

// Sits the popup beside the piece, then pulls it back inside the container.
// `size` must be the popup's *measured* size: the map container is overflow:hidden,
// so anything placed past its edge is cut off with no way to reach it except panning
// the map away from the very piece you just clicked.
export function placePopup(anchor, size, container) {
  let x = anchor.x + GAP;
  if (x + size.w + EDGE > container.w) {
    const flipped = anchor.x - size.w - GAP; // no room on the right — try the other side
    x = flipped >= EDGE ? flipped : container.w - size.w - EDGE;
  }
  return {
    x: clamp(x, EDGE, container.w - size.w - EDGE),
    y: clamp(anchor.y - 24, EDGE, container.h - size.h - EDGE),
  };
}
