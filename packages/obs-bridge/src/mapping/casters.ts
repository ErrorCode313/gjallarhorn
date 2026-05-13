import path from "path";
import { Mapping, extrasPath, joinPath, writeText } from "./types";

type Caster = { caster?: string; twitter?: string; pronouns?: string };
type CastersPayload = Caster[];

const SLOTS = 4;

export const castersMapping: Mapping<CastersPayload> = {
  source: "casters.json",
  async apply(ctx, payload) {
    const arr = Array.isArray(payload) ? payload : [];

    const ops: Promise<void>[] = [];
    for (let i = 0; i < SLOTS; i++) {
      const c = arr[i] || {};
      const slotN = String(i + 1);

      if (ctx.mode === "tsh" && i < 2) {
        const base = joinPath(ctx, "commentary", slotN);
        ops.push(writeText(path.join(base, "name.txt"), c.caster ?? ""));
        ops.push(writeText(path.join(base, "twitter.txt"), c.twitter ?? ""));
        ops.push(writeText(path.join(base, "pronoun.txt"), c.pronouns ?? ""));
      }

      const eBase = extrasPath(ctx, "casters", slotN);
      ops.push(writeText(path.join(eBase, "name.txt"), c.caster ?? ""));
      ops.push(writeText(path.join(eBase, "twitter.txt"), c.twitter ?? ""));
      ops.push(writeText(path.join(eBase, "pronouns.txt"), c.pronouns ?? ""));
    }

    await Promise.all(ops);
  },
};
