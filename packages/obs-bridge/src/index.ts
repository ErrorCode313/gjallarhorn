#!/usr/bin/env node

import { resolveConfig, makeCacheDir } from "./cli";
import { startClient } from "./client";
import { dispatch } from "./translator";
import { MappingContext } from "./mapping/types";
import { ImageCache, cleanupTmp } from "./cache";
import { ImageQueue } from "./image-queue";
import { AggregateWriter } from "./aggregate";
import { writeLayoutDoc } from "./layout-doc";
import { log } from "./log";

async function main() {
  const { config } = await resolveConfig(process.argv);

  try {
    const layoutPath = await writeLayoutDoc(config);
    log.info(`Wrote layout reference: ${layoutPath}`);
  } catch (e) {
    log.warn(`could not write layout doc: ${(e as Error).message}`);
  }

  const cacheDir = makeCacheDir(config.out);
  await cleanupTmp(cacheDir);
  const cache = new ImageCache(cacheDir);
  const images = new ImageQueue(cache, 4);

  const aggregate = new AggregateWriter(config.out, config.aggregate);

  const ctx: MappingContext = {
    outDir: config.out,
    extrasPrefix: config.extrasPrefix,
    mode: config.mode,
    images,
  };

  const client = startClient({
    host: config.host,
    port: config.port,
    onWriteFile: async (file, data) => {
      const key = Array.isArray(file) ? file.join("/") : file;
      try {
        const parsed = JSON.parse(data);
        aggregate.record(key, parsed);
      } catch {
        /* aggregate skips this event; translator will log */
      }
      await dispatch(file, data, ctx);
    },
  });

  const shutdown = (sig: string) => {
    log.info(`Received ${sig}. Shutting down.`);
    client.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((e) => {
  log.error(`fatal: ${(e as Error).message}\n${(e as Error).stack}`);
  process.exit(1);
});
