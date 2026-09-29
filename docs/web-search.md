---
title: Web search
tags:
  - pi
  - web-search
---

# Web search

This note documents our personal overrides and configuration for the [[packages#pi-web-access|pi-web-access]] web search tool: Tavily-only provider, a local rate limit, and a system-prompt rule. All files are under `.pi/` in the home directory.

## Configuration

`.pi/agent/web-search.json` (outside this repo; exact contents):

```json
{
  "tavilyApiKey": "$TAVILY_API_KEY",
  "provider": "tavily",
  "webSearch": { "enabled": true, "allowedProviders": ["tavily"] },
  "workflow": "none"
}
```

Two things matter in it:

- **Tavily only.** `provider` makes Tavily the default, and `webSearch.allowedProviders` narrows the `provider` parameter of `web_search` to Tavily, so no other search provider can be selected. `workflow: "none"` additionally disables automatic summary/curator model calls.
- **API key.** No key is stored in any file; the `$TAVILY_API_KEY` reference is resolved from the Pi process environment. When running Pi from a Windows terminal, set the variable once with `setx TAVILY_API_KEY "tvly-..."`, then open a *new* terminal — already-open terminals do not inherit variables set after launch.

## System prompt addendum

`.pi/agent/AGENTS.md` appends a behavioral rule to the agent instructions: use web search sparingly, only for current information or external technical documentation not already available locally or in context, and never include confidential, private, credential, or otherwise non-public information in a search query. This is a prompt-level rule, not code.

## Rate-limit extension

`.pi/agent/extensions/web-search-limit.ts` hooks Pi's `tool_call` event for `web_search` and runs **before the tool executes**; it does no search itself. It counts a `query` call as 1 and each entry of `queries[]` as 1, admits at most **6 queries/minute and 30 queries/day**, and blocks the entire call — with a fixed reason string, never reaching the package — if a batch would exceed a limit. Counters increment before the call is allowed, so a Tavily request that later fails still consumes budget.

Tallies persist in `.pi/agent/web-search-usage.json` (written 0600, temp file + rename), holding only the minute/day buckets and counts — no queries, no keys — so the limits survive `/reload`, restart, and reboot.

> [!note] Future-proofing
> The extension depends only on Pi core contracts (the `tool_call` event, the `web_search` tool name). The package-specific surface is the `web-search.json` schema (`tavilyApiKey`, `provider`, `webSearch.allowedProviders`, `workflow`), valid as of `pi-web-access` 0.33.0 per [[packages#pi-web-access]]. If an update breaks search, re-check those keys against the package README.

Related: [[packages]]
