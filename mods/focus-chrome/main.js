import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Button, InputState, Input } from "gpui-base";
import { settings, home, spaces, agents, panes, shared, setShared, run, openOverlay, closeOverlay, props, checking } from "herdr";
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

  // Each tab's session row, by tab id.
  session(tab) { return sessionRows(spaces(), agents(), shared("focus.sessions") ?? {}).find(r => r.tab.id === tab); }

  pill(row) {
    const look = { blocked: ["#ffb35c24", C.blockedText, C.blocked, "Needs you"], working: ["#7cc4ff1f", C.workingText, C.working, row?.label],
      done: ["#7ee0a81f", C.doneText, C.done, row?.label] }[row?.status];
    if (!look) return null;
    return h_flex().flex_none().h(26).px(10).gap(7).rounded(13).items_center().text_size(12).font_medium().bg(look[0]).text_color(look[1])
      .child(row.status === "done" ? icon("check", 12) : div().size(6).rounded(3).bg(look[2])).child(look[3]);
  }

  // The session's title bar, drawn by Herdr inside the terminal's frame (pane header).
  paneHeader() {
    const pane = panes().find(p => p.terminal === props().terminal);
    const row = pane && this.session(pane.tab);
    const info = shared("focus.sessions")?.[pane?.tab];
    const space = row?.space;
    const narrow = this.w < 720;
    const where = [folderName(pane?.cwd ?? space?.folder ?? "", space?.machine ? "~" : home()), pane?.branch].filter(Boolean).join(" / ");
    const meta = info ? [info.agent, info.model, info.effort].filter(Boolean).join(" · ") : row?.agent ?? "";
    const sub = [where, !narrow && meta].filter(Boolean).join(" · ");
    const done = row?.status === "done";
    const next = () => {
      setShared("focus.next", { folder: pane?.cwd || space?.folder || home(), machine: space?.machine ?? null, spaceId: space?.id });
      run("layout.select", { stack: "focus-content", child: "focus-home" });
      run("focus.next");
    };
    return h_flex().id("focus-pane").size_full().pl(18).pr(10).gap(10).items_center().bg("#10162a").border_b_1().border_color(C.hairline).text_color(C.fg)
      .on_size_change((size, cx) => { if (this.width !== size.width) { this.width = size.width; cx.notify(); } })
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().text_size(14).font_semibold().child(clip(row?.name ?? "Session", narrow ? 30 : 80)))
        .when(Boolean(sub), el => el.child(div().text_size(11).text_color(C.sub).child(clip(sub, narrow ? 40 : 100)))))
      .when(Boolean(this.pill(row)), el => el.child(this.pill(row)))
      .when(done, el => el
        .child(this.button("review", [icon("git-compare", 15), ...(!narrow ? [div().child("Review changes")] : [])], () => {
          run("pane.focus", { terminal: props().terminal });
          openOverlay({ mod: "changes", kind: "dialog", width: Math.min(960, this.w - 32), height: 640 });
        }).h(32).tooltip("Review changes"))
        .child(this.button("close", [icon("archive", 15), ...(!narrow ? [div().child("Close")] : [])], () => {
          run("layout.select", { stack: "focus-content", child: "focus-home" });
          run("tab.close", { id: pane.tab });
        }).h(32).tooltip("Close session"))
        .child(this.button("next", [icon("plus", 15), div().child(narrow ? "Next" : "Next task")], next)
          .h(32).bg(C.accent).text_color(C.accentInk).font_semibold().hover(s => s.bg(C.accentHover).text_color(C.accentInk)).tooltip("New task in this folder")));
  }

  // One pill per agent session under the terminal: the most urgent ones that fit, in tab order.
  dock() {
    const order = spaces().flatMap(s => s.tabs.map(t => t.id));
    const active = spaces().find(s => s.active)?.tabs.find(t => t.active)?.id;
    const rows = sessionRows(spaces(), agents(), shared("focus.sessions") ?? {}).filter(r => r.isAgent);
    const room = Math.max(1, Math.floor((this.w - 160) / 230));
    const shown = rows.slice(0, room);
    const current = rows.find(r => r.tab.id === active);
    if (current && !shown.includes(current)) shown[shown.length - 1] = current;
    shown.sort((a, b) => order.indexOf(a.tab.id) - order.indexOf(b.tab.id));
    const pill = (id, content, action, on = false) => Button.new(id).h(34).px(12).rounded(17).flex_none().flex().items_center().gap(8)
      .text_size(12).bg(on ? "#141a2bf2" : "#0a0e1ac7").border_1().border_color(on ? "#ffffff2e" : C.hairline)
      .hover(s => s.bg("#141a2bf2")).cursor_pointer().on_click(action).children(content);
    const suffix = r => r.status === "blocked" ? ["Needs you", C.blockedText] : r.status === "working" ? [r.label.replace(/^Working · /, ""), C.dim]
      : r.status === "done" ? ["Done", C.dim] : null;
    return h_flex().id("focus-dock").size_full().px(16).gap(8).items_center().justify_center()
      .on_size_change((size, cx) => { if (this.width !== size.width) { this.width = size.width; cx.notify(); } })
      .children(shown.map(r => {
        const on = r.tab.id === active, end = !on && suffix(r);
        return pill(`dock-${r.tab.id}`, [statusDot(r.status), div().text_color(on ? C.fg : C.muted).child(clip(r.name, 26)),
          ...(end ? [div().text_color(end[1]).child(`· ${end[0]}`)] : [])], () => this.showSession(r), on);
      }))
      .child(pill("all", [div().text_color(C.sub).child(rows.length > shown.length ? `All sessions · ${rows.length}` : "All sessions")],
        () => openOverlay({ mod: "focus-chrome", kind: "dialog", width: Math.min(620, this.w - 32), height: 520, props: { sessions: true, classic: classic() } })));
  }

  render() {
    if (props()?.sessions) return this.sessionsView();
    if (props()?.terminal) return this.paneHeader();
    if (props()?.part === "dock") return this.dock();
    const narrow = this.w < 640;
    return h_flex().id("focus-top").size_full().px(narrow ? 12 : 24).items_center().gap(8).text_color(C.fg)
      .on_size_change((size, cx) => { if (this.width !== size.width) { this.width = size.width; cx.notify(); } })
      .child(image("frame/welcome/herdr.png").size(20).rounded(5).mr(6))
      .child(this.button("new", [icon("plus", 15), div().child("New task")], () => run("layout.select", { stack: "focus-content", child: "focus-home" })).h(32))
      .child(div().flex_1())
      .child(this.button("background", [icon("mods/focus/image.svg", 15)], () => openOverlay({ mod: "focus-backgrounds", kind: "dialog", width: 580, height: 460 })).h(32).px(9).tooltip("Background"))
      .child(this.button("classic", [icon("panel-left", 15)], () => run("layout.switch", { name: classic() })).h(32).px(9).tooltip("Classic workspace"));
  }
}
