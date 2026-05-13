import path from "path";
import { BridgeMode } from "../config";
import { ImageQueue } from "../image-queue";
import { writeTextAtomic } from "../writer";

export type MappingContext = {
  outDir: string;
  extrasPrefix: string;
  mode: BridgeMode;
  images: ImageQueue;
};

export type Mapping<T = unknown> = {
  source: string;
  apply(ctx: MappingContext, payload: T): Promise<void>;
};

export function joinPath(ctx: MappingContext, ...parts: string[]): string {
  return path.join(ctx.outDir, ...parts);
}

export function extrasPath(ctx: MappingContext, ...parts: string[]): string {
  const prefix = ctx.extrasPrefix;
  const segs = prefix ? [prefix, ...parts] : parts;
  return path.join(ctx.outDir, ...segs);
}

export async function writeText(
  absPath: string,
  value: unknown
): Promise<void> {
  const s = value === undefined || value === null ? "" : String(value);
  await writeTextAtomic(absPath, s);
}

export function enqueueImage(
  ctx: MappingContext,
  url: unknown,
  dst: string
): void {
  if (!url || typeof url !== "string") return;
  ctx.images.enqueue(url, dst);
}

export function sanitizeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}
