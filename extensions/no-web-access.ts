import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const FLAG = "no-web-access";
const ENV_OFF = "PI_WEB_ACCESS";

const WITHDRAWN_PACKAGES: { pattern: RegExp; label: string }[] = [
	{ pattern: /pi-web-access/, label: "pi-web-access" },
	{ pattern: /pi-subagents/, label: "pi-subagents" },
];

export default function noWebAccess(pi: ExtensionAPI) {
	pi.registerFlag(FLAG, {
		type: "boolean",
		description:
			"Disable pi-web-access (web search, fetch, source check) and pi-subagents for this session.",
		default: false,
	});

	function off(api: ExtensionAPI): boolean {
		if (process.env[ENV_OFF] === "off") return true;
		if (api.getFlag(FLAG) === true) {
			// Propagate to child processes the way the command gate does.
			process.env[ENV_OFF] = "off";
			return true;
		}
		return false;
	}

	/**
	 * Re-register matching package tools with `exposure: "hidden"` — the documented way
	 * to withdraw a tool. Hidden tools are not declared to the model and are ignored
	 * by setActiveTools(), so package lazy activation cannot bring them back.
	 */
	function withdrawPackageTools(api: ExtensionAPI, packagePattern: RegExp, label: string): void {
		const tools = api
			.getAllTools()
			.filter(
				tool =>
					packagePattern.test(tool.sourceInfo.source) || packagePattern.test(tool.sourceInfo.path),
			);
		for (const tool of tools) {
			pi.registerTool({
				name: tool.name,
				label: `${tool.name} (disabled)`,
				description: `${label} is disabled for this session via --no-web-access or PI_WEB_ACCESS=off.`,
				parameters: tool.parameters,
				exposure: "hidden",
				async execute() {
					throw new Error(`${label} is disabled for this session (${FLAG}).`);
				},
			});
		}
	}

	function applyWithdrawals(api: ExtensionAPI): void {
		for (const { pattern, label } of WITHDRAWN_PACKAGES) {
			withdrawPackageTools(api, pattern, label);
		}
	}

	pi.on("session_start", (_event, ctx) => {
		if (!off(pi)) return;
		applyWithdrawals(pi);
		if (ctx.hasUI) {
			ctx.ui.notify(
				`pi-web-access and pi-subagents disabled for this session (via ${FLAG})`,
				"info",
			);
		}
	});
}
