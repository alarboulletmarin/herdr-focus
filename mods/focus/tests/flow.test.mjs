import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { launchRequest, parseWorktrees } from "../logic.js";
import { configuredAgent, modelCatalog } from "../options.js";
import { validateImage } from "../../focus-backgrounds/logic.js";

const agent = { key: "codex", name: "Codex", installed: true, run: ["codex", "-m", "old", "-c", 'model_reasoning_effort="low"'] };
const project = { folder: "/repo with spaces", machine: null, spaceId: "s1" };
const space = { id: "s1", folder: project.folder, machine: null, tabs: [{ id: "old" }] };
const text = 'Évalue 中文 👋\n`$(touch /tmp/never)` | "quoted"';
const settings = configuredAgent(agent, "test-model", "high");
assert.deepEqual(settings.run, ["codex", "--no-daemon", "--model", "test-model", "-c", 'model_reasoning_effort="high"']);
assert.equal(launchRequest(text, settings, project, [space]).args.task, text);
assert.equal(launchRequest(text, settings, project, []).name, "space.new");
assert.equal(launchRequest(text, settings, { ...project, machine: "remote" }, [space]).args.machine, "remote");
assert.throws(() => launchRequest(" \n ", settings, project, [space]));
assert.throws(() => launchRequest(text, { ...settings, installed: false }, project, [space]));
assert.throws(() => launchRequest(text, settings, { folder: "" }, [space]));
assert.deepEqual(parseWorktrees("worktree /a b\0HEAD hash\0branch refs/heads/feature/a\0\0worktree /c\0detached\0\0worktree /gone\0prunable missing\0\0"), [{ folder: "/a b", branch: "feature/a" }, { folder: "/c", branch: "detached HEAD" }]);
assert.deepEqual(parseWorktrees(""), []);
assert.equal(modelCatalog(agent, { models: [{ slug: "listed", visibility: "list", supported_reasoning_levels: [{ effort: "high" }] }, { slug: "hidden", visibility: "hide" }] }).length, 1);
assert.throws(() => validateImage(new Uint8Array()));
assert.throws(() => validateImage(new Uint8Array([1, 2, 3, 4])));
assert.throws(() => validateImage(new Uint8Array(8 * 1024 * 1024 + 1)));
validateImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));

// Exercise the actual view's submit method with native app boundaries mocked.
const calls = [], store = new Map();
let tab = "old", paneStatus = "idle", deliveryCode = 0;
const tasks = [], timers = [];
const cx = { notify() {}, spawn(fn) { tasks.push(fn(cx)); }, timer: { after(_ms, fn) { timers.push(fn); } } };
const api = {
  View: class {}, div() {}, svg() {}, image() {}, h_flex() {}, v_flex() {}, Button: {}, TextareaState: {}, Textarea: {}, InputState: {}, Input: {},
  theme() {}, spaces: () => [space], agents: () => [], settings: () => ({ zoom: 1 }), knownAgents() {}, exec() {}, home: () => "/home/test", checking: () => true,
  shared: key => store.get(key), setShared: (key, value) => store.set(key, value), nextCommand() {}, openOverlay() {}, pickFolder() {}, readTextFile() {}, props: () => ({}),
  focused: () => ({ tab }), panes: () => [{ terminal: "wrong", tab: "other", program: { agent: true } }, { terminal: "right", tab, focused: true, status: paneStatus, program: { agent: true } }],
  hc: async args => { calls.push(["hc", args]); return { code: deliveryCode, stderr: "Delivery failed" }; },
  run(name, args) { calls.push([name, args]); if (name === "tab.new") { tab = "new-tab"; space.tabs.push({ id: tab }); } },
};
const context = vm.createContext({ ...api, console });
const modules = new Map();
async function load(path) {
  if (modules.has(path)) return modules.get(path);
  const mod = new vm.SourceTextModule(await fs.readFile(path, "utf8"), { context, identifier: path });
  modules.set(path, mod);
  await mod.link(async (specifier, referencing) => {
    if (specifier.startsWith(".")) return load(new URL(specifier, `file://${referencing.identifier}`).pathname);
    return new vm.SyntheticModule(Object.keys(api), function() { for (const [key, value] of Object.entries(api)) this.setExport(key, value); }, { context });
  });
  return mod;
}
const main = await load(new URL("../main.js", import.meta.url).pathname);
await main.evaluate();
const view = new main.namespace.default();
let value = text;
Object.assign(view, { input: { value: () => value, set_value(next) { value = next; } }, draftKey: "draft", project, agents: [agent], agentKey: "codex", models: [], model: "test-model", effort: "high", loading: false });
view.submit(cx);
assert.equal(calls[0][0], "tab.new");
assert.equal(calls[1][0], "layout.select");
assert.equal(calls[1][1].child, "focus-session");
assert.ok(calls.every(([name]) => name !== "layout.switch"), "Sending must stay in Focus");
const count = calls.length;
view.submit(cx);
assert.equal(calls.length, count, "Double submit must not create a second session");
timers.forEach(fn => fn(cx));
assert.equal(store.get("focus.sessions")["new-tab"].model, "test-model");

assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(["pane.focus", { terminal: "right" }]), "The new session's terminal gets the keyboard");

console.log("PASS: launch routing, persistent Focus, duplicate send, terminal focus, model flags, special text, worktrees and invalid images");
