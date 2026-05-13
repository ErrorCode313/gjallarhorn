import path from "path";
import { Mapping, extrasPath, writeText } from "./types";

type TickerEntry = { subject?: string; ticker?: string };
type TickerPayload = TickerEntry[];

const MAX_SLOTS = 20;

export const tickerMapping: Mapping<TickerPayload> = {
  source: "ticker.json",
  async apply(ctx, payload) {
    const arr = Array.isArray(payload) ? payload : [];

    const ops: Promise<void>[] = [];
    const base = extrasPath(ctx, "ticker");

    ops.push(writeText(path.join(base, "count.txt"), String(arr.length)));

    const joined = arr
      .map((e) => `${e.subject ?? ""}: ${e.ticker ?? ""}`)
      .join("  ·  ");
    ops.push(writeText(path.join(base, "joined.txt"), joined));

    for (let i = 0; i < MAX_SLOTS; i++) {
      const e = arr[i] || {};
      const slotBase = path.join(base, String(i + 1));
      ops.push(writeText(path.join(slotBase, "subject.txt"), e.subject ?? ""));
      ops.push(writeText(path.join(slotBase, "ticker.txt"), e.ticker ?? ""));
    }

    await Promise.all(ops);
  },
};
