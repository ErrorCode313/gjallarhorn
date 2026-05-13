import path from "path";
import { Mapping, extrasPath, writeText } from "./types";

type LiveEntry = {
  score?: string;
  id?: number | string | null;
  name?: string;
  face?: string;
  legend?: string;
  offsetX?: number;
  offsetZ?: number;
  splash?: string;
  legendName?: string;
};

type LivePayload = LiveEntry[];

const FIELDS = [
  "score",
  "id",
  "name",
  "face",
  "legend",
  "offsetX",
  "offsetZ",
  "splash",
  "legendName",
] as const;

export const liveGameMapping: Mapping<LivePayload> = {
  source: "live/game.json",
  async apply(ctx, payload) {
    const arr = Array.isArray(payload) ? payload : [];

    const ops: Promise<void>[] = [];
    for (let i = 0; i < 6; i++) {
      const p = arr[i];
      const present = !!p;
      const team = (i % 2 === 0 ? 1 : 2) as 1 | 2;
      const player = (Math.floor(i / 2) + 1) as 1 | 2 | 3;
      const base = extrasPath(
        ctx,
        "live",
        "game",
        "team",
        String(team),
        "player",
        String(player)
      );
      for (const f of FIELDS) {
        const v = present ? (p as Record<string, unknown>)[f] : "";
        ops.push(writeText(path.join(base, `${f}.txt`), v ?? ""));
      }
    }
    await Promise.all(ops);
  },
};
