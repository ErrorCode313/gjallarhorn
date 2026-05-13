import path from "path";
import {
  Mapping,
  MappingContext,
  extrasPath,
  sanitizeName,
  writeText,
} from "./types";

type AnyRecord = Record<string, unknown>;

async function writeFlatRecord(base: string, rec: AnyRecord): Promise<void> {
  const ops: Promise<void>[] = [];
  for (const key of Object.keys(rec)) {
    const v = rec[key];
    if (v === null || v === undefined) {
      ops.push(writeText(path.join(base, `${sanitizeName(key)}.txt`), ""));
      continue;
    }
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") {
      ops.push(
        writeText(path.join(base, `${sanitizeName(key)}.txt`), String(v))
      );
    } else {
      // Nested object/array — skip in v1; could be expanded per-need.
    }
  }
  await Promise.all(ops);
}

async function writeArray(
  ctx: MappingContext,
  ...rest: { items: unknown[]; baseSegs: string[] }[]
): Promise<void> {
  const ops: Promise<void>[] = [];
  for (const group of rest) {
    for (let i = 0; i < group.items.length; i++) {
      const item = group.items[i];
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const base = extrasPath(ctx, ...group.baseSegs, String(i + 1));
        ops.push(writeFlatRecord(base, item as AnyRecord));
      }
    }
  }
  await Promise.all(ops);
}

export function bracketSggMapping(name: string): Mapping<unknown> {
  const safe = sanitizeName(name);
  return {
    source: `bracket-${name}.json`,
    async apply(ctx, payload) {
      const arr = Array.isArray(payload) ? payload : [];
      await writeArray(ctx, {
        items: arr,
        baseSegs: ["bracket", safe, "sets"],
      });
    },
  };
}

export function remainingSggMapping(name: string): Mapping<unknown> {
  const safe = sanitizeName(name);
  return {
    source: `remaining-${name}.json`,
    async apply(ctx, payload) {
      const arr = Array.isArray(payload) ? payload : [];
      await writeArray(ctx, {
        items: arr,
        baseSegs: ["bracket", safe, "remaining"],
      });
    },
  };
}

export const recentSetsMapping: Mapping<unknown> = {
  source: "recent-sets.json",
  async apply(ctx, payload) {
    const arr = Array.isArray(payload) ? payload : [];
    await writeArray(ctx, { items: arr, baseSegs: ["recent-sets"] });
  },
};
