import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const MAX_PER_MINUTE = 6;
const MAX_PER_DAY = 30;

const STATE_FILE = join(
  homedir(),
  ".pi",
  "agent",
  "web-search-usage.json",
);

type State = {
  minute: string;
  minuteCount: number;
  day: string;
  dayCount: number;
};

function currentMinute() {
  return new Date().toISOString().slice(0, 16);
}

function currentDay() {
  return new Date().toISOString().slice(0, 10);
}

function loadState(): State {
  const empty: State = {
    minute: currentMinute(),
    minuteCount: 0,
    day: currentDay(),
    dayCount: 0,
  };

  if (!existsSync(STATE_FILE)) return empty;

  try {
    return {
      ...empty,
      ...JSON.parse(readFileSync(STATE_FILE, "utf8")),
    };
  } catch {
    return empty;
  }
}

function saveState(state: State) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });

  const tmp = `${STATE_FILE}.tmp`;

  writeFileSync(tmp, JSON.stringify(state, null, 2), {
    mode: 0o600,
  });

  try {
    renameSync(tmp, STATE_FILE);
  } catch {
    // Windows cannot rename over an existing file; remove it first.
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    renameSync(tmp, STATE_FILE);
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    if (event.toolName !== "web_search") return;

    const state = loadState();

    const minute = currentMinute();
    const day = currentDay();

    if (state.minute !== minute) {
      state.minute = minute;
      state.minuteCount = 0;
    }

    if (state.day !== day) {
      state.day = day;
      state.dayCount = 0;
    }

    const input = event.input as {
      query?: string;
      queries?: string[];
    };

    const count =
      Array.isArray(input.queries) && input.queries.length > 0
        ? input.queries.length
        : 1;

    if (state.minuteCount + count > MAX_PER_MINUTE) {
      return {
        block: true,
        reason: `Web-search limit reached: maximum ${MAX_PER_MINUTE} searches per minute.`,
      };
    }

    if (state.dayCount + count > MAX_PER_DAY) {
      return {
        block: true,
        reason: `Daily web-search limit reached: maximum ${MAX_PER_DAY} searches per day.`,
      };
    }

    state.minuteCount += count;
    state.dayCount += count;

    saveState(state);
  });
}
