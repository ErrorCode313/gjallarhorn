import { MappingContext } from "./mapping/types";
import { REGISTRY, dynamicMapping } from "./mapping";
import { log } from "./log";
import { getTotalWrites } from "./writer";

let firstPushSeen = false;

function normalizeKey(file: string[] | string): string {
  const parts = Array.isArray(file) ? file : [file];
  return parts.join("/");
}

function safeParse(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch (e) {
    log.warn(`could not parse JSON: ${(e as Error).message}`);
    return null;
  }
}

function logFirstPush(ctx: MappingContext): void {
  if (firstPushSeen) return;
  firstPushSeen = true;
  log.info(``);
  log.info(`✓ First push from gjallarhorn received!`);
  log.info(`  Files are landing here: ${ctx.outDir}`);
  log.info(
    `  Open gjallarhorn-LAYOUT.txt in that folder to see where each field lives.`
  );
  log.info(``);
}

export async function dispatch(
  file: string[] | string,
  data: string,
  ctx: MappingContext
): Promise<void> {
  const key = normalizeKey(file);

  const payload = safeParse(data);
  if (payload === null) return;

  const before = getTotalWrites();
  const imagesBefore = ctx.images.totalEnqueuedCount();

  const mapping = REGISTRY.get(key) || dynamicMapping(key);
  if (!mapping) {
    log.debug(`no mapping for ${key}; skipping`);
    return;
  }

  try {
    await mapping.apply(ctx, payload as never);
  } catch (e) {
    log.error(
      `mapping ${key} threw: ${(e as Error).message}\n${(e as Error).stack}`
    );
    return;
  }

  const written = getTotalWrites() - before;
  const imagesQueued = ctx.images.totalEnqueuedCount() - imagesBefore;
  const imgPart =
    imagesQueued > 0
      ? `, ${imagesQueued} image${imagesQueued === 1 ? "" : "s"} queued`
      : "";
  log.info(
    `pushed ${key} → ${written} file${written === 1 ? "" : "s"}${imgPart}`
  );

  logFirstPush(ctx);
}
