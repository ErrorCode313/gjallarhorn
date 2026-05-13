import path from "path";
import { Mapping, extrasPath, writeText } from "./types";

type PlayerEntry = {
  name?: string;
  sponsor?: string;
  sponsorPath?: string;
  country?: string;
  twitter?: string;
  twitch?: string;
  face?: string;
  legend?: string;
  offsetX?: number;
  offsetZ?: number;
  splash?: string;
  legendName?: string;
  pr?: string;
  region?: string;
  earnings?: string;
  top8?: string;
  top32?: string;
  gold?: string;
  silver?: string;
  bronze?: string;
  lifetimeScore?: string;
  winrate?: string;
};

type PlayersPayload = PlayerEntry[];

const FIELDS = [
  "name",
  "sponsor",
  "sponsorPath",
  "country",
  "twitter",
  "twitch",
  "face",
  "legend",
  "offsetX",
  "offsetZ",
  "splash",
  "legendName",
  "pr",
  "region",
  "earnings",
  "top8",
  "top32",
  "gold",
  "silver",
  "bronze",
  "lifetimeScore",
  "winrate",
] as const;

export const playersMapping: Mapping<PlayersPayload> = {
  source: "players.json",
  async apply(ctx, payload) {
    const arr = Array.isArray(payload) ? payload : [];

    const ops: Promise<void>[] = [];
    for (let i = 0; i < 6; i++) {
      const p = arr[i] || {};
      const team = (i % 2 === 0 ? 1 : 2) as 1 | 2;
      const player = (Math.floor(i / 2) + 1) as 1 | 2 | 3;
      const base = extrasPath(
        ctx,
        "players",
        "team",
        String(team),
        "player",
        String(player)
      );
      for (const f of FIELDS) {
        const v = (p as Record<string, unknown>)[f];
        ops.push(writeText(path.join(base, `${f}.txt`), v ?? ""));
      }
    }
    await Promise.all(ops);
  },
};
