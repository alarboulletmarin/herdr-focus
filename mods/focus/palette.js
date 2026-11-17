// Shared by focus and focus-chrome (mods cannot import from each other): keep both copies identical.
// Focus colors: a night blue that sits on the background image, one fixed peach accent.
import { div } from "gpui-kit";

export const C = {
  card: "#0d1220ed", list: "#0a0e1abd", raised: "#1c2438", line: "#ffffff17", hairline: "#ffffff12",
  fg: "#f2f4f8", muted: "#c3cad9", sub: "#aab2c5", dim: "#8d96ab", faint: "#5d6680",
  accent: "#f6c1a0", accentHover: "#ffd9c2", accentInk: "#2a1810", accentRing: "#f6c1a061",
  working: "#7cc4ff", workingText: "#9fd3ff", blocked: "#ffb35c", blockedText: "#ffc98a", blockedHalo: "#ffb35c2e",
  error: "#ff9a9a",
};

export const kbd = text => div().px(6).py(1).rounded(5).bg(C.raised).border_1().border_color(C.line)
  .text_size(11).text_color(C.muted).child(text);

export const statusText = status => status === "blocked" ? C.blockedText : status === "working" ? C.workingText : C.dim;

export function statusDot(status) {
  const box = div().size(14).rounded(7).flex_none().flex().items_center().justify_center();
  const dot = div().size(8).rounded(4);
  if (status === "blocked") return box.bg(C.blockedHalo).child(dot.bg(C.blocked));
  return box.child(status === "working" ? dot.bg(C.working) : dot.border_1().border_color(C.dim));
}
