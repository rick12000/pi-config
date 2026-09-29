import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LOADER = "subagents_enable";
const SUBAGENT = "subagent";

/** Keep `subagent` on the active tool set without the lazy `subagents_enable` loader (same as `pi --exclude-tools subagents_enable`). */
function applyEagerSubagent(pi: ExtensionAPI) {
  if (!pi.getAllTools().some((tool) => tool.name === SUBAGENT)) {
    return;
  }

  const active = pi.getActiveTools();
  const next = active.filter((name) => name !== LOADER);
  if (!next.includes(SUBAGENT)) {
    next.push(SUBAGENT);
  }

  const unique = [...new Set(next)];
  if (
    unique.length !== active.length ||
    active.includes(LOADER) ||
    !active.includes(SUBAGENT)
  ) {
    pi.setActiveTools(unique);
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", () => {
    applyEagerSubagent(pi);
  });

  pi.on("before_agent_start", (event) => {
    applyEagerSubagent(pi);

    const selected = event.systemPromptOptions.selectedTools;
    if (!selected) {
      return;
    }

    const withoutLoader = selected.filter((name) => name !== LOADER);
    if (!withoutLoader.includes(SUBAGENT)) {
      withoutLoader.push(SUBAGENT);
    }

    if (
      withoutLoader.length !== selected.length ||
      selected.includes(LOADER) ||
      !selected.includes(SUBAGENT)
    ) {
      event.systemPromptOptions.selectedTools = withoutLoader;
    }
  });
}
