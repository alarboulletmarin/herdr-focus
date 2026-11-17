export function family(agent) {
  const key = agent?.key ?? "";
  return key.includes("codex") ? "codex" : key.includes("claude") ? "claude" : "other";
}

export function modelCatalog(agent, cache) {
  if (family(agent) === "codex") return (cache?.models ?? []).filter(m => m.visibility === "list").map(m => ({
    id: m.slug, name: m.display_name || m.slug,
    efforts: (m.supported_reasoning_levels ?? []).map(x => x.effort),
  }));
  if (family(agent) === "claude") return ["opus", "sonnet", "haiku", "fable"].map(id => ({
    id, name: id[0].toUpperCase() + id.slice(1), efforts: ["low", "medium", "high", "xhigh", "max"],
  }));
  return [];
}

function withoutOption(argv, flags, prefix) {
  const result = [];
  for (let i = 0; i < argv.length; i++) {
    if (flags.includes(argv[i])) { i++; continue; }
    if (flags.some(f => argv[i].startsWith(`${f}=`))) continue;
    if (prefix && ["-c", "--config"].includes(argv[i]) && argv[i + 1]?.startsWith(prefix)) { i++; continue; }
    result.push(argv[i]);
  }
  return result;
}

export function configuredAgent(agent, model, effort) {
  if (!agent) return agent;
  const kind = family(agent);
  let argv = [...agent.run];
  if (kind === "codex" && !argv.includes("--no-daemon")) argv.push("--no-daemon");
  if (model && kind !== "other") argv = [...withoutOption(argv, ["--model", "-m"]), "--model", model];
  if (effort && kind === "codex") argv = [...withoutOption(argv, [], "model_reasoning_effort="), "-c", `model_reasoning_effort=${JSON.stringify(effort)}`];
  if (effort && kind === "claude") argv = [...withoutOption(argv, ["--effort"]), "--effort", effort];
  return { ...agent, run: argv };
}
