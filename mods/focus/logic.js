import { folderName } from "./sessions.js";

// No shell commands: task text is always passed as a structured argument.
export function launchRequest(task, agent, project, spaceList) {
  const text = task.trim();
  if (!text) throw new Error("Describe a task first.");
  if (!agent?.installed || !agent.run?.length) throw new Error("Choose an installed agent.");
  if (!project?.folder) throw new Error("Choose a project folder.");
  // The folder is passed explicitly, so a tab in the project's space starts there whatever the space's own folder.
  const space = spaceList.find(s => s.id === project.spaceId && (s.machine ?? null) === (project.machine ?? null));
  const args = { argv: [...agent.run], task: text, folder: project.folder };
  const title = text.replace(/\s+/g, " ").slice(0, 48);
  return space
    ? { name: "tab.new", args: { ...args, space: space.id, name: title } }
    : { name: "space.new", args: { ...args, machine: project.machine ?? "", name: project.folder.replace(/\\/g, "/").split("/").filter(Boolean).pop(), tab: title } };
}

export function parseWorktrees(text) {
  return text.split("\0\0").filter(Boolean).flatMap(block => {
    const lines = block.split("\0");
    const folder = lines.find(l => l.startsWith("worktree "))?.slice(9);
    if (!folder || lines.some(l => l === "bare" || l.startsWith("prunable"))) return [];
    const branch = lines.find(l => l.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "");
    return [{ folder, branch: branch ?? "detached HEAD" }];
  });
}

// One entry per folder and machine: where each space starts and where its terminals are now.
// Space names follow their first terminal, so they can name another folder than the one used: show folders.
export function projectList(spaceList, paneList, home) {
  const out = new Map();
  for (const s of spaceList) {
    const remoteHome = s.machine ? "~" : home;
    const live = paneList.filter(p => p.terminal && p.cwd && s.tabs.some(t => t.id === p.tab)).map(p => p.cwd);
    for (const folder of [s.folder || remoteHome, ...live]) {
      const key = `${s.machine ?? ""}\0${folder.replace(/(.)\/+$/, "$1")}`;
      if (out.has(key)) continue;
      const parent = folder.replace(/\/[^/]+\/?$/, "") || "/";
      const where = s.machine ?? (folderName(folder, home) === "~" ? "Home" : parent.startsWith(home) ? `~${parent.slice(home.length)}` : parent);
      out.set(key, { folder, machine: s.machine ?? null, spaceId: s.id, name: folderName(folder, remoteHome), where });
    }
  }
  return [...out.values()];
}
