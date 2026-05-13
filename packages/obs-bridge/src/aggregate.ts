import path from "path";
import { writeTextAtomic } from "./writer";
import { log } from "./log";

type AggregateState = {
  updatedAt: string;
  sources: { [key: string]: unknown };
  dynamic: {
    "bracket-*.json": { [name: string]: unknown };
    "remaining-*.json": { [name: string]: unknown };
  };
};

const BRACKET_RE = /^bracket-(.+)\.json$/;
const REMAINING_RE = /^remaining-(.+)\.json$/;

export class AggregateWriter {
  private state: AggregateState = {
    updatedAt: new Date().toISOString(),
    sources: {},
    dynamic: { "bracket-*.json": {}, "remaining-*.json": {} },
  };

  private writePending = false;
  private writeQueued = false;

  constructor(private outDir: string, private enabled: boolean) {}

  record(key: string, payload: unknown): void {
    if (!this.enabled) return;

    const bm = key.match(BRACKET_RE);
    if (bm && key !== "bracket-Top32.json") {
      this.state.dynamic["bracket-*.json"][bm[1]] = payload;
    } else {
      const rm = key.match(REMAINING_RE);
      if (rm) {
        this.state.dynamic["remaining-*.json"][rm[1]] = payload;
      } else {
        this.state.sources[key] = payload;
      }
    }

    this.state.updatedAt = new Date().toISOString();
    void this.scheduleWrite();
  }

  private async scheduleWrite(): Promise<void> {
    if (this.writePending) {
      this.writeQueued = true;
      return;
    }
    this.writePending = true;
    try {
      const dst = path.join(this.outDir, "gjallarhorn-state.json");
      await writeTextAtomic(dst, JSON.stringify(this.state, null, 2));
    } catch (e) {
      log.error(`aggregate write failed: ${(e as Error).message}`);
    } finally {
      this.writePending = false;
      if (this.writeQueued) {
        this.writeQueued = false;
        void this.scheduleWrite();
      }
    }
  }
}
