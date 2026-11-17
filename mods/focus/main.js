import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, Button, TextareaState, Textarea, InputState, Input } from "gpui-base";
import { settings, theme, spaces, agents, knownAgents, run, exec, home, checking, shared, setShared, nextCommand, openOverlay, pickFolder, readTextFile, panes, props } from "herdr";
import { launchRequest, parseWorktrees, projectList } from "./logic.js";
import { sessionRows, folderName } from "./sessions.js";
import { configuredAgent, modelCatalog, family } from "./options.js";
import { C, kbd, statusDot, statusText } from "./palette.js";

const DRAFT = "focus.draft";
const icon = (name, size = 14) => svg(name.includes("/") ? name : `mods/workspace-chrome/${name}.svg`).size(size);
const short = (text, max = 28) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
// The card's rows have fixed heights so popovers can sit at known offsets below them.
const CARD_HEIGHT = 200;

export default class Focus extends View {
  // Window px from on_size_change, in the mod's own px (they grow with the app's zoom).
  get w() { return this.width / (Number(settings().zoom) || 1); }
  get h() { return this.height / (Number(settings().zoom) || 1); }

  init(_props, cx) {
    const draft = shared(DRAFT) ?? {};
    this.model = draft.model ?? "";
    this.effort = draft.effort ?? "";
    this.models = [];
    this.query = InputState.new({ placeholder: "Filter…" });
    this.query.on("change", (_e, cx) => cx.notify());
    const current = spaces().find(s => s.active);
    this.project = draft.project ?? { folder: current?.folder || home(), machine: current?.machine ?? null, spaceId: current?.id };
    this.agentKey = draft.agentKey;
    this.agents = [];
    this.worktrees = [];
    this.branch = null;
    this.menu = null;
    this.pending = false;
    this.width = 900;
    this.height = 800;
    this.error = "";
    this.handle = cx.focus_handle();
    this.input = TextareaState.new({ value: draft.task ?? "", placeholder: "What would you like to work on?", rows: 3 });
    this.input.on("change", (_e, cx) => { this.error = ""; this.save(); cx.notify(); });
    this.input.on("submit", (e, cx) => { if (e.secondary) this.submit(cx); });
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    if (checking()) return;
    this.refresh(cx);
    this.input.focus();
    // Session times ("Working · 4 min") move on without any other change.
    cx.timer.every(30000, cx => cx.notify());
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus") { this.menu = null; this.input.focus(); }
        if (["agents", "models", "effort"].includes(command)) this.open("agent");
        if (["projects", "branches"].includes(command)) this.open(command);
        if (command === "workspace") this.workspace();
        if (command === "sessions") this.sessions();
        // "Next task" from a finished session: start from its folder.
        if (command === "next" && shared("focus.next")) this.selectProject(shared("focus.next"), cx);
        if (command === "new") { this.pending = false; this.menu = null; this.input.focus(); }
        cx.notify();
      }
    });
  }

  save() {
    const key = `${this.project.machine ?? "local"}:${this.project.folder}`;
    setShared("focus.preferences", { ...(shared("focus.preferences") ?? {}), [key]: { agentKey: this.agentKey, model: this.model, effort: this.effort } });
    setShared(DRAFT, { task: this.input.value(), project: this.project, agentKey: this.agentKey, model: this.model, effort: this.effort });
  }

  refresh(cx) {
    const revision = this.revision = (this.revision ?? 0) + 1;
    const project = { ...this.project };
    this.loading = true;
    this.branch = null;
    this.gitChecked = false;
    this.worktrees = [];
    this.agents = [];
    cx.spawn(async cx => {
      try {
        const list = await knownAgents({ on: project.machine });
        if (revision !== this.revision) return;
        this.agents = list.filter(a => a.installed);
        if (!this.agents.some(a => a.key === this.agentKey)) this.agentKey = this.agents[0]?.key;
        this.agentError = "";
        let cache;
        try {
          const raw = project.machine ? (await exec("cat", [".codex/models_cache.json"], { on: project.machine })).stdout : await readTextFile(`${home()}/.codex/models_cache.json`);
          cache = JSON.parse(raw ?? "null");
        } catch { /* An absent model cache leaves the custom-model option available. */ }
        if (revision !== this.revision) return;
        this.cache = cache;
        this.models = modelCatalog(this.agents.find(a => a.key === this.agentKey), cache);
      } catch (e) {
        if (revision !== this.revision) return;
        this.agentError = `Could not check agents: ${e.message ?? e}`;
      }
      this.loading = false;
      cx.notify();
    });
    cx.spawn(async cx => {
      try {
        const r = await exec("git", ["worktree", "list", "--porcelain", "-z"], { cwd: project.folder, on: project.machine });
        if (revision !== this.revision) return;
        this.worktrees = r.code === 0 ? parseWorktrees(r.stdout) : [];
        const head = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: project.folder, on: project.machine });
        if (revision !== this.revision) return;
        this.branch = head.code === 0 ? head.stdout.trim() : null;
        this.gitChecked = true;
      } catch (e) {
        if (revision !== this.revision) return;
        this.error = `Could not read project: ${e.message ?? e}`;
      }
      cx.notify();
    });
  }

  selectProject(project, cx) {
    this.project = project;
    const preference = shared("focus.preferences")?.[`${project.machine ?? "local"}:${project.folder}`];
    this.agentKey = preference?.agentKey ?? this.agentKey;
    this.model = preference?.model ?? "";
    this.effort = preference?.effort ?? "";
    this.menu = null;
    this.error = "";
    this.save();
    this.refresh(cx);
    this.input.focus();
    cx.notify();
  }

  chooseFolder(cx) {
    cx.spawn(async cx => {
      try {
        const folder = await pickFolder({ prompt: "Choose project" });
        if (folder) this.selectProject({ folder, machine: null }, cx);
      } catch (e) { this.error = String(e.message ?? e); }
      cx.notify();
    });
  }

  // The layout the "Classic workspace" button goes back to: the block's `classic` prop, else Herdr's main.
  classic() { return props()?.classic ?? "main"; }

  workspace() { run("layout.switch", { name: this.classic() }); }

  sessions() { openOverlay({ mod: "focus-chrome", kind: "dialog", width: Math.min(620, this.w - 32), height: 520, props: { sessions: true, classic: this.classic() } }); }

  showSession(row) {
    run("space.select", { id: row.space.id });
    run("tab.select", { id: row.tab.id });
    this.enter(row.tab.id);
  }

  // Shows the session and gives its terminal the keyboard: you type to the agent there.
  enter(tab) {
    run("layout.select", { stack: "focus-content", child: "focus-session" });
    const pane = panes().find(p => p.tab === tab && p.focused && p.terminal) ?? panes().find(p => p.tab === tab && p.terminal);
    if (pane) run("pane.focus", { terminal: pane.terminal });
  }

  submit(cx) {
    if (this.pending || this.loading) return;
    const task = this.input.value().trim();
    if (!task) return;
    try {
      const selected = this.agents.find(a => a.key === this.agentKey);
      const agent = configuredAgent(selected, this.model, this.effort);
      const request = launchRequest(task, agent, this.project, spaces());
      const before = new Set(spaces().flatMap(s => s.tabs.map(t => t.id)));
      this.pending = true;
      run(request.name, request.args);
      run("layout.select", { stack: "focus-content", child: "focus-session" });
      const selection = { agent: selected.name, model: this.models.find(m => m.id === this.model)?.name || this.model || "Default model", effort: this.effort || "Default effort" };
      cx.timer.after(150, cx => {
        const created = spaces().flatMap(s => s.tabs).find(t => !before.has(t.id));
        if (created) { setShared("focus.sessions", { ...(shared("focus.sessions") ?? {}), [created.id]: selection }); this.enter(created.id); }
        this.pending = false; cx.notify();
      });
      this.input.set_value(""); this.save();
    } catch (e) { this.pending = false; this.error = String(e.message ?? e); }
    cx.notify();
  }

  button(id, content, action, selected = false) {
    return Button.new(id).h(30).px(9).rounded(8).flex_none().flex().items_center().gap(7)
      .text_size(12).text_color(C.muted).when(selected, el => el.bg(C.raised).text_color(C.fg))
      .hover(s => s.bg(C.raised).text_color(C.fg)).cursor_pointer()
      .on_click((_e, cx) => action(cx)).children(Array.isArray(content) ? content : [div().child(content)]);
  }

  open(menu) { this.menu = menu; this.query.set_value(""); if (menu !== "agent") this.query.focus(); }

  toggle(menu, cx) {
    // A press outside the open popover closes it; the same press must not reopen it on its chip.
    if (this.closed?.menu === menu && Date.now() - this.closed.at < 400) { this.closed = null; return; }
    if (this.menu === menu) { this.menu = null; this.input.focus(); } else this.open(menu);
    cx.notify();
  }

  close(cx) { this.menu = null; this.input.focus(); cx.notify(); }

  row(id, label, detail, action, selected = false) {
    return Button.new(id).w_full().min_h(34).px(8).py(6).rounded(8).flex().items_center().gap(10)
      .text_color(C.fg).when(selected, el => el.bg(C.raised)).hover(s => s.bg(C.raised)).cursor_pointer()
      .on_click((_e, cx) => action(cx))
      .child(div().flex_1().min_w(0).overflow_hidden().text_size(13).child(short(label, 40)))
      .when(Boolean(detail), el => el.child(div().text_size(11).text_color(C.dim).child(short(detail, 24))))
      .when(selected, el => el.child(icon("check", 13).text_color(C.accent)));
  }

  heading(text) { return div().px(8).pt(4).pb(6).text_size(11).text_color(C.dim).child(text.toUpperCase()); }

  popover(width) {
    return v_flex().absolute().left(12).w(width).rounded(14).border_1().border_color(C.line).bg("#0d1220fa").shadow_xl()
      // gpui-kit has no occlusion: without this, a click on a row also reaches the session row drawn under it.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_down_out((_e, cx) => { this.closed = { menu: this.menu, at: Date.now() }; this.menu = null; cx.notify(); });
  }

  agentMenu() {
    const agent = this.agents.find(a => a.key === this.agentKey);
    const q = this.query.value().trim();
    const done = (cx, change) => { change(); this.save(); cx.notify(); };
    const agentsCol = v_flex().flex_1().min_w(0).p(10).gap(2).border_r_1().border_color(C.hairline).child(this.heading("Agent"))
      .children(this.agents.map(a => this.row(a.key, a.name, "", cx => done(cx, () => {
        this.agentKey = a.key; this.model = ""; this.effort = ""; this.models = modelCatalog(a, this.cache);
      }), a.key === this.agentKey)))
      .when(this.loading || !this.agents.length, el => el.child(div().px(8).py(6).text_size(12).text_color(C.dim).child(this.loading ? "Checking installed agents…" : this.agentError || "No installed agents found.")))
      .child(Button.new("retry-agents").mt(4).px(8).py(4).rounded(6).text_size(11).text_color(C.dim).hover(s => s.text_color(C.fg)).cursor_pointer().on_click((_e, cx) => this.refresh(cx)).child("Check installed agents again"));
    const models = this.models.filter(m => (m.name + m.id).toLowerCase().includes(q.toLowerCase()));
    const modelsCol = v_flex().flex_1().min_w(0).p(10).gap(2).border_r_1().border_color(C.hairline).child(this.heading("Model"))
      .child(Input.new(this.query).h(30).px(8).mb(4).rounded(7).bg(C.raised).text_size(12))
      .child(v_flex().max_h(220).gap(2).overflow_y_scrollbar()
        .child(this.row("default-model", "Agent default", "", cx => done(cx, () => { this.model = ""; this.effort = ""; }), !this.model))
        .children(models.map(m => this.row(m.id, m.name, "", cx => done(cx, () => { this.model = m.id; this.effort = ""; }), m.id === this.model)))
        .when(Boolean(q) && !this.models.some(m => m.id === q), el => el.child(this.row("custom-model", `Use ${q}`, "Custom ID", cx => done(cx, () => { this.model = q; this.effort = ""; })))));
    const levels = this.models.find(m => m.id === this.model)?.efforts ?? (family(agent) === "claude" ? ["low", "medium", "high", "xhigh", "max"] : (!this.model ? this.models[0]?.efforts ?? [] : []));
    const effortCol = v_flex().flex_1().min_w(0).p(10).gap(2).child(this.heading("Effort"))
      .children(["", ...levels].map(e => this.row(`effort-${e}`, e ? e[0].toUpperCase() + e.slice(1) : "Agent default", "", cx => done(cx, () => { this.effort = e; }), e === this.effort)))
      .child(div().px(8).pt(8).text_size(11).text_color(C.dim).child("Saved for this project."));
    const supported = family(agent) !== "other";
    return this.popover(Math.min(supported ? 620 : 260, this.w - 48)).top(CARD_HEIGHT + 8)
      .child(h_flex().items_start().child(agentsCol.when(!supported, el => el.border_r_0())).when(supported, el => el.child(modelsCol).child(effortCol)));
  }

  listMenu() {
    const q = this.query.value().toLowerCase();
    const list = v_flex().max_h(260).gap(2).overflow_y_scrollbar();
    if (this.menu === "projects") {
      list.child(this.heading("Projects"));
      list.children(projectList(spaces(), panes(), home()).filter(p => (p.name + p.folder).toLowerCase().includes(q)).map(p => this.row(`project-${p.machine ?? ""}-${p.folder}`, p.name, p.where, cx => this.selectProject({ folder: p.folder, machine: p.machine, spaceId: p.spaceId }, cx), p.folder === this.project.folder && p.machine === (this.project.machine ?? null))));
      list.child(this.row("choose-folder", "Choose a folder…", "", cx => this.chooseFolder(cx)));
    } else {
      list.child(this.heading("Branches · worktrees"));
      list.children(this.worktrees.filter(w => w.branch.toLowerCase().includes(q)).map((w, i) => this.row(`worktree-${i}`, w.branch, w.folder.split("/").pop(), cx => {
        const s = spaces().find(s => s.folder === w.folder && (s.machine ?? null) === (this.project.machine ?? null));
        this.selectProject({ folder: w.folder, machine: this.project.machine, spaceId: s?.id }, cx);
      }, w.folder === this.project.folder)));
      if (!this.worktrees.length) list.child(div().px(8).py(6).text_size(12).text_color(C.dim).child("This folder has no Git worktrees."));
    }
    return this.popover(Math.min(380, this.w - 48)).top(46).p(8).gap(6)
      .child(Input.new(this.query).h(32).px(10).rounded(8).bg(C.raised).text_size(12)).child(list);
  }

  root() {
    return v_flex().id("focus-form").size_full().relative().track_focus(this.handle)
      .on_size_change((size, cx) => { if (size.width !== this.width || size.height !== this.height) { this.width = size.width; this.height = size.height; cx.notify(); } })
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.menu) { this.close(cx); cx.stop_propagation(); }
        if ((e.modifiers.control || e.modifiers.platform) && e.key === "enter") { this.submit(cx); cx.stop_propagation(); }
        if ((e.modifiers.control || e.modifiers.platform) && e.key === "k") { this.sessions(); cx.stop_propagation(); }
      });
  }

  sendButton(ready, label, size) {
    return Button.new("launch").size(size).rounded(size >= 36 ? 11 : 10).flex_none().flex().items_center().justify_center()
      .bg(ready ? C.accent : "#2a3248").text_color(ready ? C.accentInk : C.dim).disabled(!ready).tooltip(label)
      .when(ready, el => el.hover(s => s.bg(C.accentHover)).cursor_pointer())
      .on_click((_e, cx) => this.submit(cx)).child(icon("mods/focus/arrow-up.svg", size >= 36 ? 18 : 16));
  }

  recent(max) {
    const rows = sessionRows(spaces(), agents(), shared("focus.sessions") ?? {}).filter(r => r.isAgent).slice(0, max);
    if (!rows.length) return null;
    return v_flex().w_full().rounded(16).border_1().border_color(C.hairline).bg(C.list).p(8)
      .child(h_flex().px(10).pt(6).pb(6).justify_between().items_center()
        .child(div().text_size(12).font_medium().text_color(C.sub).child("Recent sessions"))
        .child(Button.new("all-sessions").flex().items_center().gap(7).px(6).py(3).rounded(6).text_size(12).text_color(C.accent)
          .hover(s => s.text_color(C.accentHover).bg("#ffffff0d")).cursor_pointer().on_click(() => this.sessions())
          .child(div().child("All sessions")).child(kbd("Ctrl K"))))
      .children(rows.map(r => Button.new(`recent-${r.tab.id}`).w_full().px(10).py(9).rounded(10).flex().items_center().gap(12)
        .hover(s => s.bg("#ffffff0d")).cursor_pointer().on_click(() => this.showSession(r))
        .child(statusDot(r.status))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().text_size(13).font_medium().text_color(C.fg).child(short(r.name, 70)))
          .child(div().text_size(12).text_color(C.dim).child(short(`${r.space.name}${r.space.branch ? ` / ${r.space.branch}` : ""} · ${r.agent}`, 80))))
        .child(div().flex_none().text_size(12).text_color(statusText(r.status)).when(r.status === "blocked", el => el.font_medium()).child(r.label))));
  }

  render() {
    const agent = this.agents.find(a => a.key === this.agentKey);
    const projectName = folderName(this.project.folder, this.project.machine ? "~" : home());
    const ready = !this.pending && !this.loading && Boolean(agent) && Boolean(this.input.value().trim());
    const compact = this.w < 640;
    const mark = agent?.icon ? (agent.tint ? svg(agent.icon) : image(agent.icon)).size(14) : icon("terminal");
    const model = this.models.find(m => m.id === this.model)?.name || this.model || "Default model";
    const effort = this.effort ? this.effort[0].toUpperCase() + this.effort.slice(1) : "Default effort";
    const supported = family(agent) !== "other";
    const sep = () => div().text_color(C.faint).child("·");
    const chip = (id, children, menu) => this.button(id, children, cx => this.toggle(menu, cx), this.menu === menu);
    const agentLabel = agent ? [div().font_medium().text_color(C.fg).child(short(agent.name, 18)), ...(supported && !compact ? [sep(), div().child(short(model, 20)), sep(), div().child(effort)] : [])]
      : [div().text_color(C.dim).child(this.loading ? "Checking agents…" : "Choose an agent")];
    const card = v_flex().w_full().h(CARD_HEIGHT).rounded(20).border_1().border_color(this.inputFocused ? C.accentRing : C.line).bg(C.card).shadow_xl()
      .child(h_flex().h(42).px(12).pt(8).items_center().gap(2)
        .child(chip("projects", [icon("folder"), div().font_medium().text_color(C.fg).child(short(projectName, compact ? 16 : 32)), icon("chevron-down", 12)], "projects"))
        .child(div().px(2).text_color(C.faint).child("/"))
        .child(this.branch
          ? chip("branches", [icon("git-branch"), div().child(short(this.branch, compact ? 16 : 32)), icon("chevron-down", 12)], "branches")
          : div().px(9).text_size(12).text_color(C.dim).child(this.gitChecked ? "No Git repository" : "…")))
      .child(Textarea.new(this.input).h(100).px(22).py(10).text_size(16).text_color(C.fg))
      .child(h_flex().h(56).px(12).items_center().gap(8)
        .child(this.button("agents", [mark, ...agentLabel, icon("chevron-down", 12)], cx => this.toggle("agent", cx), this.menu === "agent").h(32).border_1().border_color(C.line))
        .child(div().flex_1())
        .when(!compact, el => el.child(h_flex().gap(5).items_center().child(kbd("Ctrl")).child(kbd("Enter"))))
        .child(this.sendButton(ready, "Start task", 36)));
    const error = this.error || this.agentError;
    // Rows that fit under the card (header 64, card, gap 28, list title 50, 52 per row); none rather than a clipped list.
    const top = Math.max(16, (this.h - 64 - 460) * 0.4);
    const recent = this.recent(Math.max(0, Math.min(3, Math.floor((this.h - 64 - top - CARD_HEIGHT - 28 - 50 - 16) / 52))));
    const content = v_flex().w_full().max_w(680).relative().gap(error ? 12 : 28)
      .child(card)
      .when(Boolean(error), el => el.child(div().px(8).text_size(12).text_color(C.error).child(error)))
      .when(Boolean(recent), el => el.child(recent))
      .when(this.menu === "agent", el => el.child(this.agentMenu()))
      .when(this.menu === "projects" || this.menu === "branches", el => el.child(this.listMenu()));
    const headerButton = (id, children, action, label) => this.button(id, children, action).h(34).px(label ? 12 : 9).text_size(13).text_color("#d5dae6").tooltip(label ?? "Background");
    return this.root()
      .child(h_flex().h(64).px(compact ? 16 : 28).items_center().justify_between()
        .child(h_flex().gap(10).items_center().text_color(C.fg).text_size(14).font_semibold().child(image("frame/welcome/herdr.png").size(22).rounded(5)).child("Herdr"))
        .child(h_flex().gap(4).items_center()
          .child(headerButton("classic", [icon("panel-left", 16), ...(!compact ? [div().child("Classic workspace")] : [])], () => this.workspace(), "Classic workspace"))
          .child(headerButton("background", [icon("mods/focus/image.svg", 16)], () => openOverlay({ mod: "focus-backgrounds", kind: "dialog", width: Math.min(580, this.w - 32), height: 460 })))))
      .child(v_flex().flex_1().min_h(0).px(compact ? 16 : 24).pt(top).items_center().child(content));
  }
}
