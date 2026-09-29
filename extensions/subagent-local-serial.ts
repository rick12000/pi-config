import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_DIR = join(homedir(), ".pi", "agent");
const MODELS_FILE = join(AGENT_DIR, "models.json");
const SETTINGS_FILE = join(AGENT_DIR, "settings.json");

const inflight = new Set<string>();

type JsonRecord = Record<string, unknown>;

function readJson(path: string): JsonRecord | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : undefined;
  } catch {
    return undefined;
  }
}

/** A provider is local when its configured base URL is loopback. Cloud providers are not listed here. */
function localProviders(): Set<string> {
  const providers = readJson(MODELS_FILE)?.providers;
  const local = new Set<string>();
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    return local;
  }
  for (const [name, value] of Object.entries(providers)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const baseUrl = (value as JsonRecord).baseUrl;
    if (typeof baseUrl !== "string") continue;
    try {
      const host = new URL(baseUrl).hostname;
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
        local.add(name);
      }
    } catch {
      // Ignore a malformed base URL.
    }
  }
  return local;
}

function providerOfModelId(modelId: string): string | undefined {
  const trimmed = modelId.trim();
  if (!trimmed || trimmed === "inherit") return undefined;
  const slash = trimmed.indexOf("/");
  if (slash <= 0) return undefined;
  return trimmed.slice(0, slash);
}

function overrideModel(agent: string): string | undefined {
  const settings = readJson(SETTINGS_FILE);
  const subagents = settings?.subagents;
  if (!subagents || typeof subagents !== "object" || Array.isArray(subagents)) {
    return undefined;
  }
  const overrides = (subagents as JsonRecord).agentOverrides;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return undefined;
  }
  const entry = (overrides as JsonRecord)[agent];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const model = (entry as JsonRecord).model;
  return typeof model === "string" ? model : undefined;
}

function isChildLaunch(input: Record<string, unknown>): boolean {
  if (typeof input.action === "string" && input.action.length > 0) return false;
  return (
    typeof input.agent === "string" ||
    typeof input.workflowScript === "string" ||
    typeof input.workflowScriptPath === "string" ||
    typeof input.workflow === "string"
  );
}

function isFanout(input: Record<string, unknown>): boolean {
  return (
    typeof input.workflowScript === "string" ||
    typeof input.workflowScriptPath === "string" ||
    typeof input.workflow === "string"
  );
}

/**
 * Local inference cannot share the machine with a continuing parent or a second child.
 * If the session model or the child model is a loopback provider, force one foreground
 * `subagent` call. Remote parent and remote child keep pi-subagents async parallelism.
 */
export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "subagent") return;
    const input = event.input;
    if (!isChildLaunch(input)) return;

    const local = localProviders();
    const parentProvider = ctx.getModel()?.provider;
    const explicit = typeof input.model === "string" ? providerOfModelId(input.model) : undefined;
    const agent = typeof input.agent === "string" ? input.agent : undefined;
    const pinned = agent ? providerOfModelId(overrideModel(agent) ?? "") : undefined;
    const childProvider = explicit ?? pinned ?? parentProvider;
    const exclusive =
      (parentProvider !== undefined && local.has(parentProvider)) ||
      (childProvider !== undefined && local.has(childProvider));
    if (!exclusive) return;

    if (isFanout(input)) {
      return {
        block: true,
        reason:
          "Local models allow one subagent at a time. Call subagent once with agent and task. Do not use workflowScript or parallel fanout.",
      };
    }

    if (inflight.size > 0) {
      return {
        block: true,
        reason:
          "A subagent is already running. Wait for its tool result before starting another.",
      };
    }

    input.async = false;
    inflight.add(event.toolCallId);
  });

  const release = (toolCallId: string, toolName: string) => {
    if (toolName === "subagent") inflight.delete(toolCallId);
  };

  pi.on("tool_result", (event) => {
    release(event.toolCallId, event.toolName);
  });

  pi.on("tool_execution_end", (event) => {
    release(event.toolCallId, event.toolName);
  });
}
