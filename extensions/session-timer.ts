import { FooterComponent, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

const CHILD_ENV = "PI_SUBAGENT_CHILD";

type SessionView = {
	model: ExtensionContext["model"];
	thinkingLevel: ExtensionContext["thinkingLevel"];
	sessionManager: ExtensionContext["sessionManager"];
	getContextUsage: ExtensionContext["getContextUsage"];
	startedAt: number | undefined;
};

/**
 * Same shape as a running subagent clock: `800ms`, `1.2s`, `3m12s`.
 * Shown only while the primary agent is in a run.
 */
function formatRunDuration(ms: number): string {
	const elapsed = Math.max(0, ms);
	if (elapsed < 1000) return `${elapsed}ms`;
	if (elapsed < 60000) return `${(elapsed / 1000).toFixed(1)}s`;
	return `${Math.floor(elapsed / 60000)}m${Math.floor((elapsed % 60000) / 1000)}s`;
}

/** Map each visible character back to its index in a string that contains ANSI codes. */
function visibleMap(line: string): { plain: string; indexes: number[] } {
	let plain = "";
	const indexes: number[] = [];
	for (let i = 0; i < line.length; i++) {
		if (line[i] !== "\x1b") {
			indexes.push(i);
			plain += line[i];
			continue;
		}
		const end = line.indexOf("m", i);
		if (end === -1) break;
		i = end;
	}
	return { plain, indexes };
}

/**
 * Place `timer` at the start of the stats line and take the same number of
 * columns out of the padding before the model, so the line stays the same width.
 */
function insertRunTimer(line: string, timer: string): string {
	const label = `${timer} `;
	const { plain, indexes } = visibleMap(line);
	const gap = / {2,}/.exec(plain);
	const insertAt = indexes[0];
	const removeAt = gap ? indexes[gap.index] : undefined;
	if (!gap || insertAt === undefined || removeAt === undefined || removeAt < insertAt) return line;
	const removed = line.slice(removeAt, removeAt + label.length);
	if (removed.length !== label.length || !/^ +$/.test(removed)) return line;
	const cut = line.slice(0, removeAt) + line.slice(removeAt + label.length);
	return cut.slice(0, insertAt) + label + cut.slice(insertAt);
}

function sessionFor(view: SessionView) {
	return {
		get state() {
			return { model: view.model, thinkingLevel: view.thinkingLevel };
		},
		get model() {
			return view.model;
		},
		get routedModel() {
			return undefined;
		},
		get sessionManager() {
			return view.sessionManager;
		},
		getContextUsage: () => view.getContextUsage(),
		modelRuntime: { isUsingSubscription: () => false },
	};
}

export default function (pi: ExtensionAPI) {
	if (process.env[CHILD_ENV] === "1") return;

	const view: SessionView = {
		model: undefined,
		thinkingLevel: undefined,
		sessionManager: undefined as unknown as ExtensionContext["sessionManager"],
		getContextUsage: () => undefined,
		startedAt: undefined,
	};

	const bind = (ctx: ExtensionContext) => {
		view.model = ctx.model;
		view.thinkingLevel = ctx.thinkingLevel;
		view.sessionManager = ctx.sessionManager;
		view.getContextUsage = () => ctx.getContextUsage();
		view.startedAt = ctx.signal ? Date.now() : undefined;
		if (ctx.mode !== "tui") return;

		ctx.ui.setFooter((tui, _theme, footerData) => {
			const footer = new FooterComponent(sessionFor(view) as ConstructorParameters<typeof FooterComponent>[0], footerData);
			const tick = setInterval(() => {
				if (view.startedAt !== undefined) tui.requestRender();
			}, 1000);
			return {
				dispose() {
					clearInterval(tick);
					footer.dispose();
				},
				invalidate() {
					footer.invalidate();
				},
				render(width: number) {
					view.thinkingLevel = pi.getThinkingLevel();
					footer.setAutoCompactEnabled(pi.getSettings().compaction?.enabled !== false);
					const lines = footer.render(width);
					if (view.startedAt !== undefined && lines.length > 1) {
						lines[1] = insertRunTimer(lines[1], formatRunDuration(Date.now() - view.startedAt));
					}
					return lines;
				},
			};
		});
	};

	pi.on("session_start", (_event, ctx) => {
		bind(ctx);
	});

	pi.on("model_select", (event) => {
		view.model = event.model;
	});

	pi.on("thinking_level_select", (event) => {
		view.thinkingLevel = event.level;
	});

	pi.on("agent_start", () => {
		view.startedAt = Date.now();
	});

	pi.on("agent_end", () => {
		view.startedAt = undefined;
	});
}
