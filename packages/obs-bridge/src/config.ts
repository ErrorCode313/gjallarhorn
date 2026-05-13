import fs from "fs";
import path from "path";
import { log } from "./log";

export type BridgeMode = "tsh" | "native";

export type BridgeConfig = {
  out: string;
  extrasPrefix: string;
  host: string;
  port: number;
  mode: BridgeMode;
  aggregate: boolean;
};

export const CONFIG_FILENAME = "obs-bridge.config.json";

export const DEFAULTS: BridgeConfig = {
  out: "",
  extrasPrefix: "gjallarhorn",
  host: "localhost",
  port: 3000,
  mode: "native",
  aggregate: true,
};

export function configPath(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_FILENAME);
}

export function loadConfig(
  cwd: string = process.cwd()
): Partial<BridgeConfig> | null {
  const p = configPath(cwd);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as Partial<BridgeConfig>;
  } catch (e) {
    log.warn(`Could not read ${p}: ${(e as Error).message}`);
    return null;
  }
}

export function saveConfig(
  cfg: BridgeConfig,
  cwd: string = process.cwd()
): void {
  const p = configPath(cwd);
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

export function deleteConfig(cwd: string = process.cwd()): void {
  const p = configPath(cwd);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
