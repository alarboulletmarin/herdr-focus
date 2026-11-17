import assert from "node:assert/strict";
import fs from "node:fs";
import { ago, sessionRows } from "../sessions.js";

for (const file of ["sessions.js", "palette.js"]) assert.equal(fs.readFileSync(new URL(`../../focus-chrome/${file}`, import.meta.url), "utf8"), fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), `focus-chrome/${file} must match focus/${file}`);

assert.equal(ago(0), "<1 min");
assert.equal(ago(-5000), "<1 min");
assert.equal(ago(59 * 60000), "59 min");
assert.equal(ago(60 * 60000), "1 h");
assert.equal(ago(25 * 3600000), "1 d");

const now = 10_000_000;
const tab = (id, status, changed_at = null, working_since = null) => ({ id, name: id, status, changed_at, working_since });
const spaces = [
  { name: "a", tabs: [tab("idle", "idle", now - 1000), tab("shell", null, now - 10), tab("old-done", "done", now - 7200000)] },
  { name: "b", tabs: [tab("work", "working", now, now - 240000), tab("ask", "blocked", now - 99999999), tab("new-done", "done", now - 60000)] },
];
const rows = sessionRows(spaces, [{ tab: "work", program: { name: "Codex", agent: true } }], { ask: { agent: "Claude Code" } }, now);
assert.deepEqual(rows.map(r => r.tab.id), ["ask", "work", "new-done", "old-done", "idle", "shell"]);
assert.equal(rows[0].label, "Needs you");
assert.equal(rows[0].agent, "Claude Code");
assert.equal(rows[1].label, "Working · 4 min");
assert.equal(rows[1].agent, "Codex");
assert.equal(rows[2].label, "Done · 1 min");
assert.equal(rows.at(-1).agent, "Terminal");
assert.equal(rows.at(-1).isAgent, false);
assert.deepEqual(sessionRows([], []), []);
assert.deepEqual(sessionRows([{ name: "x", tabs: [] }], []), []);
const titled = sessionRows([{ name: "s", tabs: [{ id: "x", name: "2", named: false, status: "idle" }, { id: "y", name: "Fix", named: true, status: "idle" }, { id: "z", name: "3", named: false, status: "idle" }] }],
  [{ tab: "x", title: "✳ Refactor the picker", program: { name: "Claude Code" } }, { tab: "y", title: "⠂ other", program: { name: "Codex" } }, { tab: "z", title: "Claude Code", program: { name: "Claude Code" } }], {}, now);
assert.deepEqual(titled.map(r => r.name).sort(), ["Fix", "Refactor the picker", "Session 3"]);
console.log("PASS: session order, labels, agent names, empty lists");

const { folderName } = await import("../sessions.js");
const { projectList } = await import("../logic.js");
assert.equal(folderName("/home/a", "/home/a"), "~");
assert.equal(folderName("/home/a/", "/home/a"), "~");
assert.equal(folderName("", "/home/a"), "~");
assert.equal(folderName("/home/a/code/web", "/home/a"), "web");
assert.equal(folderName("/", "/home/a"), "/");
const home = "/home/a";
const projects = projectList([
  { id: "s1", folder: "/home/a", machine: null, tabs: [{ id: "t1" }] },
  { id: "s2", folder: "/home/a/code/api", machine: null, tabs: [{ id: "t2" }] },
  { id: "s3", folder: "/home/a/code/web", machine: null, tabs: [{ id: "t3" }] },
  { id: "s4", folder: "/home/a/", machine: null, tabs: [{ id: "t4" }] },
  { id: "s5", folder: "", machine: "vps", tabs: [] },
], [
  { terminal: "x", tab: "t2", cwd: "/home/a/code/web" },
  { terminal: "y", tab: "t3", cwd: "/home/a/code" },
  { terminal: null, tab: "t3", cwd: null },
], home);
assert.deepEqual(projects.map(p => [p.name, p.where, p.spaceId]), [
  ["~", "Home", "s1"], ["api", "~/code", "s2"], ["web", "~/code", "s2"], ["code", "~", "s3"], ["~", "vps", "s5"],
], "One entry per folder; the same folder in two spaces appears once");
assert.deepEqual(projectList([], [], home), []);
console.log("PASS: project folders without duplicates");
