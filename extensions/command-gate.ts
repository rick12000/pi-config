import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FLAG = "no-command-gate";
const ENV_OFF = "PI_COMMAND_GATE";
const QUEUE_DIR = join(homedir(), ".pi", "agent", "command-gate-queue");
const HEARTBEAT = join(QUEUE_DIR, "approver.json");
const HEARTBEAT_MS = 500;
const HEARTBEAT_STALE_MS = 3000;

type ShellKind = "bash" | "powershell";
type Verdict = "allow" | "ask" | "ban";

type Classification = {
	verdict: Verdict;
	summary: string;
};

const GIT_READ = new Set([
	"status",
	"diff",
	"log",
	"show",
	"blame",
	"ls-files",
	"rev-parse",
	"cat-file",
	"grep",
	"shortlog",
	"describe",
	"name-rev",
	"version",
	"help",
	"check-ignore",
	"merge-base",
	"rev-list",
	"for-each-ref",
	"count-objects",
	"verify-commit",
	"verify-tag",
	"show-ref",
	"var",
	"check-attr",
	"check-mailmap",
	"check-ref-format",
	"whatchanged",
	"range-diff",
	"interpret-trailers",
]);

const GIT_OPTION_VALUES = new Set([
	"-C",
	"-c",
	"--git-dir",
	"--work-tree",
	"--namespace",
	"--super-prefix",
	"--config-env",
	"--exec-path",
]);

const INSTALL_SUBCOMMANDS = new Set([
	"install",
	"i",
	"in",
	"add",
	"update",
	"upgrade",
	"ci",
	"sync",
	"get",
	"require",
	"dlx",
]);

const FETCH_RUNNERS = new Set(["npx", "pnpx", "bunx", "uvx"]);

const NETWORK_CLIENTS = new Set([
	"curl",
	"wget",
	"iwr",
	"irm",
	"invoke-webrequest",
	"invoke-restmethod",
	"start-bitstransfer",
	"bitsadmin",
]);

const DELETE_PROGRAMS = new Set([
	"rm",
	"rmdir",
	"rd",
	"unlink",
	"del",
	"erase",
	"remove-item",
	"ri",
]);

const BAN_PROGRAMS = new Set([
	"format",
	"format-volume",
	"clear-disk",
	"initialize-disk",
	"diskpart",
	"mkfs",
	"mkfs.ext4",
	"mkfs.ntfs",
	"mkfs.vfat",
	"mkfs.xfs",
	"shutdown",
	"reboot",
	"halt",
	"poweroff",
	"stop-computer",
	"restart-computer",
]);

const REJECT_REASON =
	"The user rejected this command. That rejection is final. Do not run it again, and do not retry it through another shell, a wrapper, different flags, or an encoded form. Continue the task without it.";

const GATE_PROMPT = [
	"Command gate: bash and powershell commands are allowed unless they hit the ban list or the ask list.",
	"Banned commands are refused with no prompt. Ask-list commands wait for the user to press Enter (allow) or n (reject).",
	"If a tool result says the user rejected a command, that rejection is final. Do not retry the command, a wrapper, or an encoded form.",
	"If a tool result says a command was blocked by the ban list, do not retry it.",
	"web_search, source_check, and fetch_content are not part of this gate.",
].join(" ");

type RequestFile = {
	id: string;
	tool: string;
	command: string;
	summary: string;
	source: string;
};

let poller: ReturnType<typeof setInterval> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let approver: ExtensionContext | undefined;
let promptChain: Promise<void> = Promise.resolve();
const inflight = new Set<string>();

type Approval = "allow" | "reject" | "unavailable" | "aborted";

export function classifyCommand(command: string, shell: ShellKind): Classification {
	const raw = command.trim();
	if (!raw) return { verdict: "allow", summary: "" };

	if (isForkBomb(raw)) {
		return { verdict: "ban", summary: "fork bomb" };
	}

	const segments = splitSegments(raw, shell);
	if (!segments) {
		return { verdict: "ask", summary: "command could not be parsed" };
	}

	let verdict: Verdict = "allow";
	const summaries: string[] = [];
	for (const segment of segments) {
		const part = classifySegment(segment, shell);
		if (part.verdict === "ban") return part;
		if (part.verdict === "ask") {
			verdict = "ask";
			summaries.push(part.summary);
		}
	}
	return {
		verdict,
		summary: summaries.length > 0 ? [...new Set(summaries)].join("; ") : "",
	};
}

export default function commandGate(pi: ExtensionAPI) {
	pi.registerFlag(FLAG, {
		type: "boolean",
		description: "Disable the command gate for this process. Bash and PowerShell run with no ban or ask checks.",
		default: false,
	});

	pi.on("session_start", (_event, ctx) => {
		if (!isApprover(ctx)) return;
		if (gateOff(pi)) {
			approver = undefined;
			stopApprover();
			return;
		}
		approver = ctx;
		startApprover();
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx !== approver) return;
		approver = undefined;
		stopApprover();
	});

	pi.on("before_agent_start", (event) => {
		if (gateOff(pi)) return;
		const note = `\n\n${GATE_PROMPT}`;
		if (event.systemPrompt.includes("Command gate:")) return;
		return { systemPrompt: event.systemPrompt + note };
	});

	pi.on("tool_call", async (event, ctx) => {
		if (gateOff(pi)) return;
		if (event.toolName !== "bash" && event.toolName !== "powershell") return;

		const command = typeof event.input.command === "string" ? event.input.command : "";
		const shell: ShellKind = event.toolName === "powershell" ? "powershell" : "bash";
		const result = classifyCommand(command, shell);
		if (result.verdict === "allow") return;

		if (result.verdict === "ban") {
			return {
				block: true,
				reason: `Blocked before execution: ${result.summary}. This command is on the ban list and cannot be approved. Do not retry it or hide it in a wrapper.`,
			};
		}

		const decision = await ask(ctx, {
			tool: event.toolName,
			command,
			summary: result.summary,
		});
		if (decision === "allow") return;
		if (decision === "unavailable") {
			return {
				block: true,
				reason: "Blocked: this command needs approval and no interactive session is available. Do not retry it.",
			};
		}
		if (decision === "aborted") {
			return {
				block: true,
				reason: "The turn was aborted before this command was approved. Do not retry it.",
			};
		}
		return { block: true, reason: REJECT_REASON };
	});
}

function gateOff(pi: ExtensionAPI): boolean {
	if (process.env[ENV_OFF] === "off") return true;
	if (pi.getFlag(FLAG) === true) {
		process.env[ENV_OFF] = "off";
		return true;
	}
	return false;
}

function isApprover(ctx: ExtensionContext): boolean {
	return ctx.mode === "tui" && ctx.hasUI && process.env.PI_SUBAGENT_CHILD !== "1";
}

function startApprover() {
	stopApprover();
	mkdirSync(QUEUE_DIR, { recursive: true });
	clearQueue();
	writeHeartbeat();
	heartbeat = setInterval(writeHeartbeat, HEARTBEAT_MS);
	heartbeat.unref?.();
	poller = setInterval(() => {
		void drainQueue();
	}, 150);
	poller.unref?.();
}

function stopApprover() {
	if (poller) clearInterval(poller);
	if (heartbeat) clearInterval(heartbeat);
	poller = undefined;
	heartbeat = undefined;
	if (existsSync(HEARTBEAT)) {
		try {
			const current = JSON.parse(readFileSync(HEARTBEAT, "utf8")) as { pid?: number };
			if (current.pid === process.pid) unlinkSync(HEARTBEAT);
		} catch {
			// A crashed approver can leave a partial file. The next session replaces it.
		}
	}
}

function writeHeartbeat() {
	mkdirSync(QUEUE_DIR, { recursive: true });
	writeFileSync(HEARTBEAT, JSON.stringify({ pid: process.pid, at: Date.now() }), { mode: 0o600 });
}

function clearQueue() {
	if (!existsSync(QUEUE_DIR)) return;
	for (const name of readdirSync(QUEUE_DIR)) {
		if (name === "approver.json") continue;
		try {
			unlinkSync(join(QUEUE_DIR, name));
		} catch {
			// Another session may have consumed the file.
		}
	}
}

function exclusive<T>(job: () => Promise<T>): Promise<T> {
	const result = promptChain.then(job, job);
	promptChain = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

async function drainQueue() {
	if (!approver || !existsSync(QUEUE_DIR)) return;
	for (const name of readdirSync(QUEUE_DIR)) {
		if (!name.endsWith(".request.json")) continue;
		const id = name.slice(0, -".request.json".length);
		if (inflight.has(id)) continue;
		inflight.add(id);
		void exclusive(async () => {
			const path = join(QUEUE_DIR, name);
			try {
				if (!existsSync(path) || !approver) return;
				const request = JSON.parse(readFileSync(path, "utf8")) as RequestFile;
				const decision = await prompt(approver, request);
				writeFileSync(join(QUEUE_DIR, `${request.id}.decision`), decision, { mode: 0o600 });
			} catch {
				const fallback = join(QUEUE_DIR, `${id}.decision`);
				if (!existsSync(fallback)) writeFileSync(fallback, "unavailable", { mode: 0o600 });
			} finally {
				if (existsSync(path)) {
					try {
						unlinkSync(path);
					} catch {
						// The child may already have left.
					}
				}
				inflight.delete(id);
			}
		});
	}
}

async function ask(
	ctx: ExtensionContext,
	request: { tool: string; command: string; summary: string },
): Promise<Approval> {
	if (isApprover(ctx)) {
		approver = ctx;
		return exclusive(() => prompt(ctx, { ...request, id: "local", source: "this session" }));
	}

	const id = randomUUID();
	mkdirSync(QUEUE_DIR, { recursive: true });
	const payload: RequestFile = {
		id,
		tool: request.tool,
		command: request.command,
		summary: request.summary,
		source: "subagent",
	};
	writeFileSync(join(QUEUE_DIR, `${id}.request.json`), JSON.stringify(payload), { mode: 0o600 });
	const decisionPath = join(QUEUE_DIR, `${id}.decision`);
	const started = Date.now();
	try {
		for (;;) {
			if (ctx.signal?.aborted) return "aborted";
			if (existsSync(decisionPath)) {
				const decision = readFileSync(decisionPath, "utf8").trim();
				if (decision === "allow" || decision === "reject" || decision === "unavailable" || decision === "aborted") {
					return decision;
				}
				return "reject";
			}
			if (!approverFresh() && Date.now() - started > HEARTBEAT_STALE_MS) return "unavailable";
			await sleep(150, ctx.signal);
		}
	} catch {
		return "aborted";
	} finally {
		for (const path of [join(QUEUE_DIR, `${id}.request.json`), decisionPath]) {
			if (existsSync(path)) {
				try {
					unlinkSync(path);
				} catch {
					// The approver may already have removed the request.
				}
			}
		}
	}
}

function approverFresh(): boolean {
	if (!existsSync(HEARTBEAT)) return false;
	try {
		const body = JSON.parse(readFileSync(HEARTBEAT, "utf8")) as { at?: number };
		return typeof body.at === "number" && Date.now() - body.at < HEARTBEAT_STALE_MS;
	} catch {
		return false;
	}
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new Error("aborted"));
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason ?? new Error("aborted"));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

async function prompt(
	ctx: ExtensionContext,
	request: { tool: string; command: string; summary: string; source: string },
): Promise<Approval> {
	const who = request.source === "subagent" ? "Subagent" : "Agent";
	const shown = request.command.length > 800 ? `${request.command.slice(0, 800)}…` : request.command;
	try {
		const choice = await ctx.ui.custom<"allow" | "reject">((_tui, theme, _keybindings, done) => {
			let lines: string[] | undefined;
			return {
				render(width: number) {
					if (lines) return lines;
					const span = Math.max(1, width);
					const bar = theme.fg("accent", "─".repeat(span));
					lines = [
						bar,
						theme.fg("text", `${who} wants to run ${request.tool}: ${request.summary}`),
						"",
						...wrap(shown, span).map((line) => theme.fg("muted", line)),
						"",
						theme.fg("accent", "Enter") + theme.fg("text", " allow    ") + theme.fg("warning", "n") + theme.fg("text", " reject"),
						bar,
					];
					return lines;
				},
				invalidate() {
					lines = undefined;
				},
				handleInput(data: string) {
					if (data === "\r" || data === "\n" || data === "\r\n") {
						done("allow");
						return;
					}
					if (data === "n" || data === "N" || data === "\x1b") done("reject");
				},
			};
		});
		return choice === "allow" ? "allow" : "reject";
	} catch {
		return "unavailable";
	}
}

function wrap(text: string, width: number): string[] {
	const lines: string[] = [];
	for (const raw of text.split("\n")) {
		if (raw.length === 0) {
			lines.push("");
			continue;
		}
		for (let i = 0; i < raw.length; i += width) lines.push(raw.slice(i, i + width));
	}
	return lines.length > 0 ? lines : [""];
}

function splitSegments(script: string, shell: ShellKind): string[] | null {
	const parts: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	for (let i = 0; i < script.length; i++) {
		const char = script[i];
		const next = script[i + 1];
		if (quote) {
			current += char;
			if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			current += char;
			continue;
		}
		if (char === "\n" || char === ";") {
			pushSegment(parts, current);
			current = "";
			continue;
		}
		if ((char === "&" && next === "&") || (char === "|" && next === "|")) {
			pushSegment(parts, current);
			current = "";
			i++;
			continue;
		}
		if (char === "|") {
			pushSegment(parts, current);
			current = "";
			continue;
		}
		if (shell === "bash" && char === "&") {
			pushSegment(parts, current);
			current = "";
			continue;
		}
		current += char;
	}
	if (quote) return null;
	pushSegment(parts, current);
	return parts;
}

function pushSegment(parts: string[], segment: string) {
	const trimmed = segment.trim();
	if (trimmed) parts.push(trimmed);
}

function classifySegment(segment: string, shell: ShellKind): Classification {
	if (isOpaque(segment, shell)) {
		if (rawBan(segment)) return { verdict: "ban", summary: "universally destructive command" };
		return { verdict: "ask", summary: "command hides another command" };
	}
	const words = tokenize(segment);
	if (!words) {
		if (rawBan(segment)) return { verdict: "ban", summary: "universally destructive command" };
		return { verdict: "ask", summary: "command could not be parsed" };
	}
	return classifyArgv(words, shell);
}

function isOpaque(segment: string, shell: ShellKind): boolean {
	if (segment.includes("$(")) return true;
	if (shell === "bash" && (segment.includes("`") || segment.includes("<(") || segment.includes(">("))) return true;
	if (/\s-(encodedcommand|enc)\b/i.test(` ${segment}`) && /powershell|pwsh/i.test(segment)) return true;
	return false;
}

function isForkBomb(script: string): boolean {
	return script.replace(/\s+/g, "").includes(":(){:|:&};:");
}

function rawBan(script: string): boolean {
	return /\b(mkfs|diskpart|format-volume|clear-disk|initialize-disk|stop-computer|restart-computer)\b/i.test(script);
}

function tokenize(segment: string): string[] | null {
	const words: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	for (let i = 0; i < segment.length; i++) {
		const char = segment[i];
		if (quote) {
			if (char === quote) quote = null;
			else current += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (char === " " || char === "\t") {
			if (current) words.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	if (quote) return null;
	if (current) words.push(current);
	return words;
}

function classifyArgv(argv: string[], shell: ShellKind): Classification {
	const words = skipAssignments(argv);
	if (words.length === 0) return { verdict: "allow", summary: "" };
	const program = programName(words[0]);

	if (program === "&") return classifyArgv(words.slice(1), shell);

	if (program === "sudo" || program === "doas") {
		return classifyArgv(skipSudoFlags(words), shell);
	}
	if (program === "env" || program === "command" || program === "builtin" || program === "nohup" || program === "time" || program === "nice") {
		return classifyArgv(skipWrapperFlags(words), shell);
	}
	if (program === "eval" && words[1]) {
		return classifyCommand(words.slice(1).join(" "), shell);
	}
	if (isShell(program)) {
		const inline = inlineScript(words);
		if (inline) return classifyCommand(inline, program === "cmd" ? "bash" : shellFor(program, shell));
		if (words.some((word) => /^-enc(odedcommand)?$/i.test(word))) {
			return { verdict: "ask", summary: "encoded shell command" };
		}
	}

	if (BAN_PROGRAMS.has(program) || program.startsWith("mkfs.")) {
		return { verdict: "ban", summary: `${program} can destroy a disk or stop the machine` };
	}

	const dd = diskWrite(words);
	if (dd) return dd;

	if (program === "chmod" || program === "chown" || program === "icacls") {
		const wipe = words.slice(1).some((word) => isWipeTarget(word));
		if (wipe) return { verdict: "ban", summary: `${program} changes permissions on a drive, root, or home` };
	}

	if (FETCH_RUNNERS.has(program) || NETWORK_CLIENTS.has(program)) {
		return { verdict: "ask", summary: `${program} installs or downloads over the network` };
	}

	const install = packageInstall(words);
	if (install) return install;

	if (DELETE_PROGRAMS.has(program)) return deletion(words, program);

	if (program === "find" && findDeletes(words)) {
		return { verdict: "ask", summary: "find deletes files" };
	}

	if (program === "git") return gitCommand(words);

	return { verdict: "allow", summary: "" };
}

function programName(token: string): string {
	const slash = Math.max(token.lastIndexOf("/"), token.lastIndexOf("\\"));
	const base = (slash >= 0 ? token.slice(slash + 1) : token).toLowerCase();
	return base.replace(/\.(exe|cmd|bat)$/i, "");
}

function isShell(program: string): boolean {
	return ["bash", "sh", "zsh", "dash", "pwsh", "powershell", "cmd"].includes(program);
}

function shellFor(program: string, fallback: ShellKind): ShellKind {
	if (program === "powershell" || program === "pwsh") return "powershell";
	if (program === "bash" || program === "sh" || program === "zsh" || program === "dash") return "bash";
	return fallback;
}

function inlineScript(words: string[]): string | undefined {
	for (let i = 1; i < words.length; i++) {
		const flag = words[i].toLowerCase();
		if (flag === "-c" || flag === "/c" || flag === "-command" || flag === "/command") {
			return words.slice(i + 1).join(" ");
		}
	}
	return undefined;
}

function skipAssignments(words: string[]): string[] {
	let index = 0;
	while (index < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index])) index++;
	return words.slice(index);
}

function skipSudoFlags(words: string[]): string[] {
	let index = 1;
	while (index < words.length) {
		const word = words[index];
		if (word === "--") return words.slice(index + 1);
		if (word === "-u" || word === "--user" || word === "-g" || word === "--group") {
			index += 2;
			continue;
		}
		if (word.startsWith("-")) {
			index++;
			continue;
		}
		break;
	}
	return words.slice(index);
}

function skipWrapperFlags(words: string[]): string[] {
	let index = 1;
	while (index < words.length) {
		const word = words[index];
		if (word === "--") return words.slice(index + 1);
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
			index++;
			continue;
		}
		if (word.startsWith("-")) {
			index++;
			continue;
		}
		break;
	}
	return words.slice(index);
}

function diskWrite(words: string[]): Classification | undefined {
	if (programName(words[0]) !== "dd") return undefined;
	const target = words.find((word) => word.startsWith("of=") || word.startsWith("of="));
	const of = target?.slice(3) ?? valueAfter(words, "of");
	if (!of) return undefined;
	if (isDevice(of)) return { verdict: "ban", summary: "dd writes to a raw disk" };
	return { verdict: "ask", summary: "dd overwrites a file" };
}

function valueAfter(words: string[], flag: string): string | undefined {
	const index = words.indexOf(flag);
	return index >= 0 ? words[index + 1] : undefined;
}

function isDevice(path: string): boolean {
	const normalized = path.replace(/\\/g, "/");
	return normalized.startsWith("/dev/") || normalized.startsWith("//./") || /^[a-zA-Z]:$/.test(path);
}

function packageInstall(words: string[]): Classification | undefined {
	const program = programName(words[0]);
	if (["python", "python3", "py"].includes(program)) {
		const module = words.indexOf("-m");
		if (module >= 0 && words[module + 1]?.toLowerCase() === "pip") {
			const action = words.slice(module + 2).find((word) => !word.startsWith("-"));
			if (action && ["install", "download"].includes(action.toLowerCase())) {
				return { verdict: "ask", summary: "pip install" };
			}
		}
		return undefined;
	}

	if (program === "uv") {
		const rest = words.slice(1).filter((word) => !word.startsWith("-"));
		if (rest[0] === "pip" && rest[1] === "install") return { verdict: "ask", summary: "uv pip install" };
		if (rest[0] === "tool" && rest[1] === "install") return { verdict: "ask", summary: "uv tool install" };
		if (rest[0] && ["add", "sync"].includes(rest[0])) return { verdict: "ask", summary: `uv ${rest[0]}` };
		return undefined;
	}

	if (program === "go") {
		const action = firstPositional(words.slice(1));
		if (action && ["install", "get"].includes(action)) return { verdict: "ask", summary: `go ${action}` };
		return undefined;
	}

	if (program === "cargo") {
		const action = firstPositional(words.slice(1));
		if (action === "install") return { verdict: "ask", summary: "cargo install" };
		return undefined;
	}

	if (program === "pacman" && words.some((word) => word === "-S" || word.startsWith("-S"))) {
		return { verdict: "ask", summary: "pacman install" };
	}

	const managers = new Set([
		"npm",
		"pnpm",
		"yarn",
		"bun",
		"pip",
		"pip3",
		"poetry",
		"conda",
		"mamba",
		"micromamba",
		"winget",
		"choco",
		"scoop",
		"gem",
		"bundle",
		"composer",
		"brew",
		"apt",
		"apt-get",
		"yum",
		"dnf",
		"nix",
		"dotnet",
		"nuget",
	]);
	if (!managers.has(program)) return undefined;
	const action = firstPositional(words.slice(1));
	if (!action) {
		if (program === "yarn" || program === "pnpm") return { verdict: "ask", summary: `${program} install` };
		return undefined;
	}
	if (INSTALL_SUBCOMMANDS.has(action)) return { verdict: "ask", summary: `${program} ${action}` };
	if ((program === "npm" || program === "pnpm" || program === "yarn") && action === "exec") {
		return { verdict: "ask", summary: `${program} exec` };
	}
	return undefined;
}

function firstPositional(words: string[]): string | undefined {
	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		if (word === "--") return words[i + 1]?.toLowerCase();
		if (word.startsWith("-")) continue;
		return word.toLowerCase();
	}
	return undefined;
}

function deletion(words: string[], program: string): Classification {
	const recursive = words.some((word) => isRecursiveFlag(word));
	const targets = deleteTargets(words);
	if (recursive && targets.some((target) => isWipeTarget(target))) {
		return { verdict: "ban", summary: `${program} would recursively delete a drive, root, or home directory` };
	}
	return { verdict: "ask", summary: `${program} deletes files` };
}

function isRecursiveFlag(word: string): boolean {
	const lower = word.toLowerCase();
	if (["-r", "-rf", "-fr", "--recursive", "-recurse", "/s"].includes(lower)) return true;
	return /^-[a-z]{2,4}$/.test(lower) && lower.includes("r");
}

function deleteTargets(words: string[]): string[] {
	const targets: string[] = [];
	for (let i = 1; i < words.length; i++) {
		const word = words[i];
		const lower = word.toLowerCase();
		if (lower === "--") {
			targets.push(...words.slice(i + 1));
			break;
		}
		if (lower === "-path" || lower === "-literalpath" || lower === "--path") {
			if (words[i + 1]) targets.push(words[i + 1]);
			i++;
			continue;
		}
		if (word.startsWith("-")) continue;
		if (/^\/[a-z?]$/i.test(word)) continue;
		targets.push(word);
	}
	return targets;
}

function isWipeTarget(path: string): boolean {
	const trimmed = path.trim().replace(/^['"]|['"]$/g, "");
	const lower = trimmed.replace(/\\/g, "/").toLowerCase();
	if (["/", "/*", "/.", "~", "~/", "~/*", "$home", "$home/*", "${home}", "${home}/*", "%userprofile%", "%userprofile%/*"].includes(lower)) {
		return true;
	}
	return /^[a-z]:\/?\*?$/.test(lower);
}

function findDeletes(words: string[]): boolean {
	for (let i = 0; i < words.length; i++) {
		if (words[i] === "-delete") return true;
		if ((words[i] === "-exec" || words[i] === "-execdir") && DELETE_PROGRAMS.has(programName(words[i + 1] ?? ""))) {
			return true;
		}
	}
	return false;
}

function gitCommand(words: string[]): Classification {
	const found = gitSubcommand(words);
	if (!found) return { verdict: "allow", summary: "" };
	const { name, rest } = found;
	if (GIT_READ.has(name)) {
		if (rest.some((word) => word === "-o" || word === "--output" || word.startsWith("--output="))) {
			return { verdict: "ask", summary: `git ${name} writes a file` };
		}
		return { verdict: "allow", summary: "" };
	}
	if (name === "remote") return gitRemote(rest);
	if (name === "branch") return gitBranch(rest);
	if (name === "tag") return gitTag(rest);
	if (name === "stash") return gitStash(rest);
	if (name === "config") return gitConfig(rest);
	if (name === "reflog") {
		const action = firstPositional(rest);
		if (!action || action === "show" || action === "exists") return { verdict: "allow", summary: "" };
		return { verdict: "ask", summary: "git reflog changes history" };
	}
	return { verdict: "ask", summary: `git ${name}` };
}

function gitSubcommand(words: string[]): { name: string; rest: string[] } | undefined {
	let index = 1;
	while (index < words.length) {
		const word = words[index];
		if (word === "--") return undefined;
		if (word.startsWith("-")) {
			const name = word.split("=")[0];
			if (!word.includes("=") && GIT_OPTION_VALUES.has(name)) {
				index += 2;
				continue;
			}
			index++;
			continue;
		}
		return { name: word.toLowerCase(), rest: words.slice(index + 1) };
	}
	return undefined;
}

function gitRemote(rest: string[]): Classification {
	const action = firstPositional(rest);
	if (!action || action === "-v" || action === "show" || action === "get-url") {
		return { verdict: "allow", summary: "" };
	}
	return { verdict: "ask", summary: `git remote ${action}` };
}

function gitBranch(rest: string[]): Classification {
	let positionals = 0;
	for (let i = 0; i < rest.length; i++) {
		const word = rest[i];
		if (word === "--") {
			positionals += rest.length - i - 1;
			break;
		}
		if (["-d", "-D", "-m", "-M", "-c", "-C"].includes(word)) return { verdict: "ask", summary: "git branch changes a branch" };
		if (word.startsWith("--delete") || word.startsWith("--move") || word.startsWith("--copy") || word.startsWith("--set-upstream")) {
			return { verdict: "ask", summary: "git branch changes a branch" };
		}
		if (word.startsWith("-")) continue;
		positionals++;
	}
	return positionals > 0
		? { verdict: "ask", summary: "git branch creates a branch" }
		: { verdict: "allow", summary: "" };
}

function gitTag(rest: string[]): Classification {
	if (rest.some((word) => word === "-d" || word === "--delete")) {
		return { verdict: "ask", summary: "git tag deletes a tag" };
	}
	const positionals = rest.filter((word) => word !== "--" && !word.startsWith("-"));
	if (positionals.length > 0) return { verdict: "ask", summary: "git tag creates a tag" };
	return { verdict: "allow", summary: "" };
}

function gitStash(rest: string[]): Classification {
	const action = firstPositional(rest);
	if (!action || action === "list" || action === "show") return { verdict: "allow", summary: "" };
	return { verdict: "ask", summary: `git stash ${action}` };
}

function gitConfig(rest: string[]): Classification {
	if (rest.some((word) => ["--get", "--get-all", "--get-regexp", "--list", "-l"].includes(word))) {
		return { verdict: "allow", summary: "" };
	}
	return { verdict: "ask", summary: "git config writes settings" };
}
