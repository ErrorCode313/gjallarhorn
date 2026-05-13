import { io, Socket } from "socket.io-client";
import { log } from "./log";

export type WriteFileHandler = (
  filePathParts: string[] | string,
  data: string
) => void | Promise<void>;

export type ClientOptions = {
  host: string;
  port: number;
  onWriteFile: WriteFileHandler;
};

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export function startClient(opts: ClientOptions): { stop: () => void } {
  const url = `http://${opts.host}:${opts.port}`;
  let socket: Socket | null = null;
  let backoff = MIN_BACKOFF_MS;
  let stopped = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let everConnected = false;
  let firstErrorLogged = false;

  function connect() {
    if (stopped) return;
    log.debug(`Connecting to gjallarhorn at ${url} ...`);

    socket = io(url, {
      path: "/api/external",
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: 10_000,
    });

    socket.on("connect", () => {
      log.info(`Connected to gjallarhorn at ${url}.`);
      everConnected = true;
      firstErrorLogged = false;
      backoff = MIN_BACKOFF_MS;
    });

    socket.on("writeFile", (file: string[] | string, data: string) => {
      Promise.resolve(opts.onWriteFile(file, data)).catch((e) => {
        log.error(`onWriteFile handler threw: ${(e as Error).message}`);
      });
    });

    socket.on("disconnect", (reason) => {
      log.warn(`Lost connection to gjallarhorn (${reason}). Reconnecting...`);
      scheduleReconnect();
    });

    socket.on("connect_error", (err) => {
      if (!firstErrorLogged) {
        firstErrorLogged = true;
        if (!everConnected) {
          log.warn(`Could not reach gjallarhorn at ${url}.`);
          log.warn(`  Is gjallarhorn running on ${opts.host}:${opts.port}?`);
          log.warn(
            `  If your port is different, double-click "Change OBS Bridge Settings.bat" to update it.`
          );
          log.warn(
            `  I'll keep retrying in the background — no need to restart.`
          );
        } else {
          log.warn(`Reconnecting to gjallarhorn at ${url}... (${err.message})`);
        }
      }
      scheduleReconnect();
    });
  }

  function scheduleReconnect() {
    if (stopped) return;
    if (reconnectTimer) return;
    if (socket) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      socket = null;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      connect();
    }, backoff);
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        socket = null;
      }
    },
  };
}
