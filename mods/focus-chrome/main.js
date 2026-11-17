import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Button, InputState, Input } from "gpui-base";
import { settings, home, spaces, agents, panes, focused, shared, run, openOverlay, closeOverlay, props, checking } from "herdr";
import { sessionRows, folderName } from "./sessions.js";
import { C, kbd, statusDot, statusText } from "./palette.js";

const icon = (name, size = 14) => svg(name.includes("/") ? name : `mods/workspace-chrome/${name}.svg`).size(size);
const clip = (s, n = 40) => s.length > n ? `${s.slice(0, n - 1)}…` : s;
// The layout "Classic workspace" goes back to: the layout block's `classic` prop (passed on to the palette), else Herdr's main.
const classic = () => props()?.classic ?? "main";
const GROUPS = [["blocked", "Needs you"], ["working", "Working"], ["done", "Finished"], ["idle", "Earlier"], [null, "Terminals"]];

export default class Chrome extends View {
  // Window px from on_size_change, in the mod's own px (they grow with the app's zoom).
  get w() { return this.width / (Number(settings().zoom) || 1); }

  init(_props, cx) {
    this.width = 1400;
    this.selected = 0;
    this.query = InputState.new({ placeholder: "Search sessions, projects, branches…" });
    this.query.on("change", (_e, cx) => { this.selected = 0; cx.notify(); });
    this.query.on("submit", (_e, cx) => { const row = this.rows()[this.selected]; if (row) this.showSession(row); });
    if (checking()) return;
    if (props()?.sessions) this.query.focus();
    else cx.timer.every(30000, cx => cx.notify());
  }

  button(id, content, action) {
    return Button.new(id).h(34).px(10).rounded(9).flex_none().flex().items_center().gap(8)
      .text_color("#d5dae6").text_size(13).hover(s => s.bg("#ffffff14").text_color(C.fg)).cursor_pointer()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).children(content);
  }

  rows() {
    const q = this.query.value().toLowerCase();
    return sessionRows(spaces(), agents(), shared("focus.sessions") ?? {})
      .filter(({ space, tab, name }) => `${space.name} ${name} ${tab.name} ${space.branch ?? ""}`.toLowerCase().includes(q));
  }

  showSession(row) {
    if (props()?.overlay) closeOverlay(props().overlay);
    run("space.select", { id: row.space.id });
    run("tab.select", { id: row.tab.id });
    run("layout.select", { stack: "focus-content", child: "focus-session" });
    const pane = panes().find(p => p.tab === row.tab.id && p.focused && p.terminal) ?? panes().find(p => p.tab === row.tab.id && p.terminal);
    if (pane) run("pane.focus", { terminal: pane.terminal });
  }

  sessionsView() {
    const rows = this.rows();
    this.selected = Math.min(this.selected, Math.max(0, rows.length - 1));
    const list = v_flex().flex_1().min_h(0).p(8).gap(2).overflow_y_scrollbar();
    if (!rows.length) list.child(div().p(14).text_size(13).text_color(C.dim).child(this.query.value() ? "No matching sessions." : "No sessions yet. Start a task from Focus."));
    for (const [status, title] of GROUPS) {
      const group = rows.filter(r => r.status === status);
      if (!group.length) continue;
      list.child(div().px(12).pt(10).pb(6).text_size(11).font_medium().text_color(status === "blocked" ? C.blockedText : C.dim).child(title.toUpperCase()));
      list.children(group.map(r => {
        const index = rows.indexOf(r);
        return Button.new(r.tab.id).w_full().px(12).py(9).rounded(10).flex().items_center().gap(12)
          .when(index === this.selected, el => el.bg("#ffffff0f")).hover(s => s.bg("#ffffff0d")).cursor_pointer()
          .on_click(() => this.showSession(r))
          .child(statusDot(r.status))
          .child(v_flex().flex_1().min_w(0).gap(2)
            .child(div().text_size(13).font_medium().text_color(C.fg).child(clip(r.name, 60)))
            .child(div().text_size(12).text_color(C.dim).child(clip(`${r.space.name}${r.space.branch ? ` / ${r.space.branch}` : ""} · ${r.agent}`, 70))))
          .child(index === this.selected ? kbd("Enter") : div().text_size(12).text_color(statusText(r.status)).child(r.label.replace(/^(Working|Done) · /, "")));
      }));
    }
    return v_flex().w_full().h(520).bg(C.card).text_color(C.fg)
      .on_key_down((e, cx) => {
        if (e.key === "down" || e.key === "up") {
          this.selected = Math.max(0, Math.min(rows.length - 1, this.selected + (e.key === "down" ? 1 : -1)));
          cx.stop_propagation(); cx.notify();
        }
      })
      .child(h_flex().h(56).flex_none().px(18).gap(10).items_center().border_b_1().border_color(C.hairline)
        .child(icon("search", 17).text_color(C.dim))
        .child(Input.new(this.query).flex_1().h(40).text_size(15).bg("#00000000"))
        .child(kbd("Esc")))
      .child(list)
      .child(h_flex().h(48).flex_none().px(14).justify_between().items_center().border_t_1().border_color(C.hairline).bg("#090d18e6")
        .child(h_flex().gap(6).items_center().text_size(12).text_color(C.dim).child(kbd("↑")).child(kbd("↓")).child("to move"))
        .child(this.button("classic", [icon("panel-left"), div().child("Open classic workspace")], () => { closeOverlay(props().overlay); run("layout.switch", { name: classic() }); }).h(30).text_size(12)));
  }

  render() {
    if (props()?.sessions) return this.sessionsView();
    const current = spaces().find(s => s.active);
    const tab = current?.tabs.find(t => t.active);
    const row = tab && sessionRows([{ ...current, tabs: [tab] }], agents(), shared("focus.sessions") ?? {})[0];
    const info = shared("focus.sessions")?.[tab?.id];
    // Where this session's terminal is now, and its branch (none outside Git).
    const live = panes().find(p => p.tab === tab?.id && p.focused && p.terminal) ?? panes().find(p => p.tab === tab?.id && p.terminal);
    const waiting = spaces().flatMap(s => s.tabs).filter(t => t.status === "blocked" && t.id !== tab?.id).length;
    const narrow = this.w < 760;
    const pill = row?.status === "blocked" || row?.status === "working"
      ? h_flex().flex_none().h(24).px(10).gap(7).rounded(12).items_center().text_size(12).font_medium()
        .bg(row.status === "blocked" ? "#ffb35c24" : "#7cc4ff24").text_color(statusText(row.status))
        .child(div().size(6).rounded(3).bg(row.status === "blocked" ? C.blocked : C.working)).child(row.label)
      : null;
    const meta = info ? `${info.agent} · ${info.model} · ${info.effort}` : row?.agent ?? "";
    return h_flex().id("focus-header").size_full().px(narrow ? 10 : 20).items_center().gap(12).text_color(C.fg)
      .on_size_change((size, cx) => { if (this.width !== size.width) { this.width = size.width; cx.notify(); } })
      .child(this.button("new", [icon("plus", 16), ...(!narrow ? [div().child("New task")] : [])], () => run("layout.select", { stack: "focus-content", child: "focus-home" })).tooltip("New task"))
      .child(div().w(1).h(20).flex_none().bg("#ffffff24"))
      .child(v_flex().min_w(0).gap(1)
        .child(div().text_size(14).font_semibold().child(clip(row?.name ?? "Session", narrow ? 28 : 60)))
        .child(h_flex().gap(6).items_center().text_size(11).text_color(C.sub)
          .child(clip(folderName(live?.cwd ?? current?.folder ?? "", current?.machine ? "~" : home()), 24))
          .when(Boolean(live?.branch), el => el.child(div().text_color(C.faint).child("/")).child(icon("git-branch", 12)).child(clip(live?.branch ?? "", 24)))
          .when(Boolean(meta) && this.w >= 980, el => el.child(div().text_color(C.faint).child("·")).child(clip(meta, 48)))))
      .when(Boolean(pill), el => el.child(pill))
      .child(div().flex_1())
      .child(this.button("sessions", [icon("layers", 16), ...(!narrow ? [div().child("Sessions")] : []),
        ...(waiting ? [div().min_w(18).h(18).px(5).rounded(9).flex().items_center().justify_center().bg(C.blocked).text_color("#2a1606").text_size(11).font_semibold().child(String(waiting))] : [])],
        () => openOverlay({ mod: "focus-chrome", kind: "dialog", width: 620, height: 520, props: { sessions: true, classic: classic() } })).tooltip(waiting ? `${waiting} waiting for you` : "Sessions"))
      .child(this.button("background", [icon("mods/focus/image.svg", 16)], () => openOverlay({ mod: "focus-backgrounds", kind: "dialog", width: 580, height: 460 })).px(9).tooltip("Background"))
      .child(this.button("classic", [icon("panel-left", 16)], () => run("layout.switch", { name: classic() })).px(9).tooltip("Classic workspace"));
  }
}
