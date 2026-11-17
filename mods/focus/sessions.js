// Shared by focus and focus-chrome (mods cannot import from each other): keep both copies identical.
const RANK = { blocked: 0, working: 1, done: 2, idle: 3 };

export function ago(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  return m < 1 ? "<1 min" : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`;
}

// Every tab as a session row, most urgent first, then most recently changed.
export function sessionRows(spaceList, agentList, info = {}, now = Date.now()) {
  return spaceList.flatMap(space => space.tabs.map(tab => {
    const status = tab.status ?? null;
    const since = t => ago(now - (t ?? now));
    const label = status === "blocked" ? "Needs you"
      : status === "working" ? `Working · ${since(tab.working_since)}`
      : status === "done" ? `Done · ${since(tab.changed_at)}`
      : tab.changed_at ? since(tab.changed_at) : "";
    const live = agentList.find(a => a.tab === tab.id);
    const agent = info[tab.id]?.agent ?? live?.program?.name ?? "Terminal";
    // Unnamed tabs are called "1", "2": the terminal title (minus spinner glyphs) says more.
    const title = (live?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
    const name = tab.named || !title || title.toLowerCase() === agent.toLowerCase() ? (tab.named ? tab.name : `Session ${tab.name}`) : title;
    return { space, tab, name, status, label, agent, isAgent: Boolean(status || info[tab.id] || live?.program?.agent) };
  })).sort((a, b) => (RANK[a.status] ?? 4) - (RANK[b.status] ?? 4) || (b.tab.changed_at ?? 0) - (a.tab.changed_at ?? 0));
}

const trim = path => path.replace(/\\/g, "/").replace(/(.)\/+$/, "$1");

// "~" for the home folder, else the folder's own name.
export function folderName(folder, home) {
  const f = trim(folder || home);
  return f === trim(home) || f === "~" ? "~" : f.split("/").filter(Boolean).pop() || "/";
}
