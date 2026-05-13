import path from "path";
import { Mapping, extrasPath, joinPath, writeText } from "./types";

type RoundEntry = { text?: string };
type RoundPayload = RoundEntry[];

export const roundMapping: Mapping<RoundPayload> = {
  source: "round.json",
  async apply(ctx, payload) {
    const arr = Array.isArray(payload) ? payload : [];
    const round = arr[0]?.text ?? "";
    const bracket = arr[1]?.text ?? "";
    const region = arr[2]?.text ?? "";

    const ops: Promise<void>[] = [];

    if (ctx.mode === "tsh") {
      ops.push(writeText(joinPath(ctx, "score", "1", "match.txt"), round));
      ops.push(writeText(joinPath(ctx, "score", "1", "phase.txt"), bracket));
    }

    const eBase = extrasPath(ctx, "round");
    ops.push(writeText(path.join(eBase, "round.txt"), round));
    ops.push(writeText(path.join(eBase, "bracket.txt"), bracket));
    ops.push(writeText(path.join(eBase, "region.txt"), region));

    await Promise.all(ops);
  },
};
