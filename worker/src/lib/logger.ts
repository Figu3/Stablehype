/**
 * Lightweight structured logger for Cloudflare Workers.
 *
 * Outputs JSON lines to console so they appear properly in
 * `wrangler tail` and Cloudflare dashboard logs.
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  component: string;
  msg: string;
  [key: string]: unknown;
}

function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  switch (entry.level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export function createLogger(component: string): Logger {
  return {
    info(msg, data) {
      emit({ level: "info", component, msg, ...data });
    },
    warn(msg, data) {
      emit({ level: "warn", component, msg, ...data });
    },
    error(msg, data) {
      emit({ level: "error", component, msg, ...data });
    },
  };
}
