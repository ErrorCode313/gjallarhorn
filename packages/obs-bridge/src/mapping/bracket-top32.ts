import path from "path";
import { Mapping, extrasPath, writeText } from "./types";

type Set = {
  identifier?: string;
  round?: string;
  bracket?: "upper" | "lower" | "finals";
  "entrant1.name"?: string;
  "entrant1.winner"?: string;
  "entrant1.opacity"?: string;
  "entrant1.score"?: string;
  "entrant2.name"?: string;
  "entrant2.winner"?: string;
  "entrant2.opacity"?: string;
  "entrant2.score"?: string;
};

type BracketPayload = Set[];

const MAX_SLOTS_PER_BRACKET = 16;
const BRACKETS: ("upper" | "lower" | "finals")[] = ["upper", "lower", "finals"];

function writeSlot(base: string, set: Set | undefined): Promise<void>[] {
  const s = set || {};
  const ops: Promise<void>[] = [];
  ops.push(writeText(path.join(base, "identifier.txt"), s.identifier ?? ""));
  ops.push(writeText(path.join(base, "round.txt"), s.round ?? ""));
  for (const t of [1, 2] as const) {
    const tBase = path.join(base, `entrant${t}`);
    const keyName = `entrant${t}.name` as keyof Set;
    const keyWinner = `entrant${t}.winner` as keyof Set;
    const keyOpacity = `entrant${t}.opacity` as keyof Set;
    const keyScore = `entrant${t}.score` as keyof Set;
    ops.push(writeText(path.join(tBase, "name.txt"), s[keyName] ?? ""));
    ops.push(writeText(path.join(tBase, "winner.txt"), s[keyWinner] ?? ""));
    ops.push(writeText(path.join(tBase, "opacity.txt"), s[keyOpacity] ?? ""));
    ops.push(writeText(path.join(tBase, "score.txt"), s[keyScore] ?? ""));
  }
  return ops;
}

export const bracketTop32Mapping: Mapping<BracketPayload> = {
  source: "bracket-Top32.json",
  async apply(ctx, payload) {
    const arr = Array.isArray(payload) ? payload : [];

    const grouped: Record<"upper" | "lower" | "finals", Set[]> = {
      upper: [],
      lower: [],
      finals: [],
    };
    for (const s of arr) {
      const b = (s.bracket as "upper" | "lower" | "finals") || "upper";
      if (grouped[b]) grouped[b].push(s);
    }

    const ops: Promise<void>[] = [];
    for (const b of BRACKETS) {
      const sets = grouped[b];
      for (let i = 0; i < MAX_SLOTS_PER_BRACKET; i++) {
        const base = extrasPath(ctx, "bracket", "top32", b, String(i + 1));
        ops.push(...writeSlot(base, sets[i]));
      }
    }

    await Promise.all(ops);
  },
};
