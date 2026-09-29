import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
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

function defaultSubagentModel(): string | undefined {
  const settings = readJson(SETTINGS_FILE);
  const subagents = settings?.subagents;
  if (!subagents || typeof subagents !== "object" || Array.isArray(subagents)) {
    return undefined;
  }
  const model = (subagents as JsonRecord).defaultModel;
  return typeof model === "string" ? model : undefined;
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

function providerName(model: unknown): string | undefined {
  if (!model || typeof model !== "object") return undefined;
  const provider = (model as { provider?: unknown }).provider;
  return typeof provider === "string" && provider.length > 0 ? provider : undefined;
}

/**
 * Session model is `ctx.model`. `getModel` is an internal runner callback, not part of
 * ExtensionContext; calling it throws and Pi turns that into a failed tool result.
 * Accept a function only when one is actually present, and never throw out of lookup.
 */
function parentProvider(ctx: ExtensionContext): string | undefined {
  try {
    const current = providerName(ctx.model);
    if (current) return current;
  } catch {
    // A stale runner makes the model getter throw. Fall through.
  }

  const legacy = (ctx as { getModel?: unknown }).getModel;
  if (typeof legacy !== "function") return undefined;
  try {
    return providerName(legacy.call(ctx));
  } catch {
    return undefined;
  }
}

function needsExclusive(input: Record<string, unknown>, ctx: ExtensionContext): boolean {
  const local = localProviders();
  const parent = parentProvider(ctx);
  const explicit = typeof input.model === "string" ? providerOfModelId(input.model) : undefined;
  const agent = typeof input.agent === "string" ? input.agent : undefined;
  const pinned = agent
    ? providerOfModelId(overrideModel(agent) ?? defaultSubagentModel() ?? "")
    : undefined;
  const child = explicit ?? pinned ?? parent;
  return (
    (parent !== undefined && local.has(parent)) ||
    (child !== undefined && local.has(child))
  );
}

const FANOUT_BLOCK = {
  block: true,
  reason:
    "Local models allow one subagent at a time. Call subagent once with agent and task. Do not use workflowScript or parallel fanout.",
} as const;

const INFLIGHT_BLOCK = {
  block: true,
  reason: "A subagent is already running. Wait for its tool result before starting another.",
} as const;

function enforceSerial(input: Record<string, unknown>, toolCallId: string) {
  if (isFanout(input)) return { ...FANOUT_BLOCK };
  if (inflight.size > 0) return { ...INFLIGHT_BLOCK };
  input.async = false;
  inflight.add(toolCallId);
}

/**
 * Local inference cannot share the machine with a continuing parent or a second child.
 * If the session model or the child model is a loopback provider, force one foreground
 * `subagent` call. Remote parent and remote child keep pi-subagents async parallelism.
 */
export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "subagent") return;
    const raw = event.input;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const input = raw as Record<string, unknown>;
    if (!isChildLaunch(input)) return;

    // Classification errors must not escape: Pi records a thrown tool_call hook as the
    // tool result and never starts the child. Unknown locality stays serial.
    let exclusive = true;
    try {
      exclusive = needsExclusive(input, ctx);
    } catch {
      exclusive = true;
    }
    if (!exclusive) return;
    return enforceSerial(input, event.toolCallId);
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
