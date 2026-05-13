import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import http from "http";
import https from "https";
import { URL } from "url";
import { log } from "./log";
import { writeBinaryAtomic, copyFileAtomic } from "./writer";

export const CACHE_DIRNAME = ".obs-bridge-cache";

function hashUrl(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex");
}

function extFromUrl(url: string, contentType?: string): string {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).toLowerCase();
    if (ext && /^\.(png|jpg|jpeg|gif|webp|svg|bmp)$/.test(ext)) return ext;
  } catch {
    /* ignore */
  }
  if (contentType) {
    const t = contentType.split(";")[0].trim().toLowerCase();
    if (t === "image/png") return ".png";
    if (t === "image/jpeg" || t === "image/jpg") return ".jpg";
    if (t === "image/gif") return ".gif";
    if (t === "image/webp") return ".webp";
    if (t === "image/svg+xml") return ".svg";
    if (t === "image/bmp") return ".bmp";
  }
  return ".png";
}

function fetchBuffer(
  url: string,
  redirectsLeft = 5
): Promise<{ body: Buffer; contentType?: string }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${url}`));
    }
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      { timeout: 15_000, headers: { "User-Agent": "gjallarhorn-obs-bridge" } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          fetchBuffer(next, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${status} for ${url}`));
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          if (body.length === 0) return reject(new Error(`empty body: ${url}`));
          resolve({ body, contentType: res.headers["content-type"] });
        });
        res.on("error", reject);
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`timeout: ${url}`));
    });
    req.on("error", reject);
  });
}

type Cached = { path: string; ext: string };

export class ImageCache {
  private inflight = new Map<string, Promise<Cached | null>>();

  constructor(private cacheDir: string) {}

  async ensureCached(url: string): Promise<Cached | null> {
    const sha = hashUrl(url);
    const existing = this.findExisting(sha);
    if (existing) return existing;

    const pending = this.inflight.get(sha);
    if (pending) return pending;

    const p = this.doDownload(url, sha).finally(() => {
      this.inflight.delete(sha);
    });
    this.inflight.set(sha, p);
    return p;
  }

  private async doDownload(url: string, sha: string): Promise<Cached | null> {
    try {
      const { body, contentType } = await fetchBuffer(url);
      const ext = extFromUrl(url, contentType);
      const cachePath = path.join(this.cacheDir, `${sha}${ext}`);

      const raced = this.findExisting(sha);
      if (raced) return raced;

      await writeBinaryAtomic(cachePath, body);
      log.debug(`cached image ${url} -> ${cachePath} (${body.length} bytes)`);
      return { path: cachePath, ext };
    } catch (e) {
      log.warn(`image download failed for ${url}: ${(e as Error).message}`);
      return null;
    }
  }

  private findExisting(sha: string): Cached | null {
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch {
        /* ignore */
      }
      return null;
    }
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(this.cacheDir);
    } catch {
      return null;
    }
    for (const name of entries) {
      if (name.includes(".tmp.")) continue;
      if (!name.startsWith(sha)) continue;
      const rest = name.slice(sha.length);
      if (rest === "" || rest.startsWith(".")) {
        const ext = path.extname(name);
        return { path: path.join(this.cacheDir, name), ext };
      }
    }
    return null;
  }
}

export async function copyCachedTo(
  cache: ImageCache,
  url: string,
  dst: string
): Promise<boolean> {
  if (!url) return false;
  const cached = await cache.ensureCached(url);
  if (!cached) return false;
  try {
    await copyFileAtomic(cached.path, dst);
    return true;
  } catch (e) {
    log.error(`copy ${cached.path} -> ${dst} failed: ${(e as Error).message}`);
    return false;
  }
}

export async function cleanupTmp(cacheDir: string): Promise<void> {
  if (!fs.existsSync(cacheDir)) return;
  try {
    const entries = await fsp.readdir(cacheDir);
    await Promise.all(
      entries
        .filter((n) => n.includes(".tmp."))
        .map((n) =>
          fsp.unlink(path.join(cacheDir, n)).catch(() => {
            /* ignore */
          })
        )
    );
  } catch {
    /* ignore */
  }
}
