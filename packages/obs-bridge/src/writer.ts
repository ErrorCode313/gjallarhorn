import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { log } from "./log";

let counter = 0;
let totalWrites = 0;

function tmpPath(dst: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${dst}.tmp.${process.pid}.${counter}`;
}

export function getTotalWrites(): number {
  return totalWrites;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const RENAME_RETRY_DELAYS_MS = [0, 25, 75, 200];

async function renameWithRetry(tmp: string, dst: string): Promise<void> {
  let lastErr: unknown;
  for (const delay of RENAME_RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    try {
      await fsp.rename(tmp, dst);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") {
        throw e;
      }
      lastErr = e;
    }
  }
  throw lastErr;
}

async function unlinkQuiet(p: string): Promise<void> {
  try {
    if (fs.existsSync(p)) await fsp.unlink(p);
  } catch {
    /* ignore */
  }
}

export async function writeTextAtomic(
  dst: string,
  contents: string
): Promise<void> {
  await fsp.mkdir(path.dirname(dst), { recursive: true });
  const tmp = tmpPath(dst);
  try {
    await fsp.writeFile(tmp, contents, "utf8");
    await renameWithRetry(tmp, dst);
    totalWrites++;
  } catch (e) {
    await unlinkQuiet(tmp);
    log.error(`writeTextAtomic failed for ${dst}: ${(e as Error).message}`);
    throw e;
  }
}

export async function writeBinaryAtomic(
  dst: string,
  contents: Buffer
): Promise<void> {
  await fsp.mkdir(path.dirname(dst), { recursive: true });
  const tmp = tmpPath(dst);
  try {
    await fsp.writeFile(tmp, contents);
    await renameWithRetry(tmp, dst);
    totalWrites++;
  } catch (e) {
    await unlinkQuiet(tmp);
    log.error(`writeBinaryAtomic failed for ${dst}: ${(e as Error).message}`);
    throw e;
  }
}

export async function copyFileAtomic(src: string, dst: string): Promise<void> {
  await fsp.mkdir(path.dirname(dst), { recursive: true });
  const tmp = tmpPath(dst);
  try {
    await fsp.copyFile(src, tmp);
    await renameWithRetry(tmp, dst);
    totalWrites++;
  } catch (e) {
    await unlinkQuiet(tmp);
    log.error(`copyFileAtomic failed for ${dst}: ${(e as Error).message}`);
    throw e;
  }
}
