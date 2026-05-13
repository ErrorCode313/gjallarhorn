const LEVELS = ["trace", "debug", "info", "warn", "error"] as const;
export type LogLevel = typeof LEVELS[number];

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(currentLevel);
}

function fmt(level: LogLevel, msg: string): string {
  const ts = new Date().toISOString().slice(11, 19);
  return `[${ts}] [${level.toUpperCase()}] ${msg}`;
}

export const log = {
  trace(msg: string, ...rest: unknown[]): void {
    if (shouldLog("trace")) console.log(fmt("trace", msg), ...rest);
  },
  debug(msg: string, ...rest: unknown[]): void {
    if (shouldLog("debug")) console.log(fmt("debug", msg), ...rest);
  },
  info(msg: string, ...rest: unknown[]): void {
    if (shouldLog("info")) console.log(fmt("info", msg), ...rest);
  },
  warn(msg: string, ...rest: unknown[]): void {
    if (shouldLog("warn")) console.warn(fmt("warn", msg), ...rest);
  },
  error(msg: string, ...rest: unknown[]): void {
    if (shouldLog("error")) console.error(fmt("error", msg), ...rest);
  },
};
