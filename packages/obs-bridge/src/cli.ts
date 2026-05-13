import { Command, Option } from "commander";
import path from "path";
import {
  BridgeConfig,
  BridgeMode,
  DEFAULTS,
  loadConfig,
  saveConfig,
} from "./config";
import { detect } from "./detect";
import { runWizard } from "./wizard";
import { log, setLogLevel, LogLevel } from "./log";

const PKG = require("../package.json");

type CliOpts = {
  out?: string;
  extrasPrefix?: string;
  host?: string;
  port?: number;
  tsh?: boolean;
  aggregate?: boolean;
  reconfigure?: boolean;
  logLevel?: string;
};

function parseCli(argv: string[]): CliOpts {
  const program = new Command();
  program
    .name("obs-bridge")
    .description(
      "Bridge that turns Gjallarhorn's JSON output into a TSH-compatible folder tree for OBS."
    )
    .version(PKG.version || "0.0.0")
    .addOption(
      new Option(
        "-o, --out <path>",
        "OBS output directory (or your TSH root folder)"
      ).env("OBS_BRIDGE_OUT")
    )
    .addOption(
      new Option(
        "-e, --extras-prefix <s>",
        'Subdirectory for Gjallarhorn-only fields (default "gjallarhorn"; "" = root)'
      ).env("OBS_BRIDGE_EXTRAS_PREFIX")
    )
    .addOption(
      new Option("-H, --host <host>", "Gjallarhorn host").env("OBS_BRIDGE_HOST")
    )
    .addOption(
      new Option("-p, --port <number>", "Gjallarhorn port")
        .env("OBS_BRIDGE_PORT")
        .argParser((v) => parseInt(v, 10))
    )
    .option("--tsh", "Force TSH-mode mapping (skip auto-detect)")
    .option("--no-tsh", "Force native-mode mapping")
    .option("--no-aggregate", "Don't write gjallarhorn-state.json")
    .option("--reconfigure", "Ignore saved config; re-run the wizard")
    .option(
      "--log-level <level>",
      "trace|debug|info|warn|error (default info)"
    );

  program.parse(argv);
  const opts = program.opts();
  return {
    out: opts.out as string | undefined,
    extrasPrefix: opts.extrasPrefix as string | undefined,
    host: opts.host as string | undefined,
    port: opts.port as number | undefined,
    tsh: typeof opts.tsh === "boolean" ? opts.tsh : undefined,
    aggregate: typeof opts.aggregate === "boolean" ? opts.aggregate : undefined,
    reconfigure: opts.reconfigure as boolean | undefined,
    logLevel: opts.logLevel as string | undefined,
  };
}

function isValidLevel(s: string | undefined): s is LogLevel {
  return (
    s === "trace" ||
    s === "debug" ||
    s === "info" ||
    s === "warn" ||
    s === "error"
  );
}

function printBanner(cfg: BridgeConfig): void {
  process.stdout.write("\n");
  process.stdout.write(`obs-bridge — using saved settings:\n`);
  process.stdout.write(`  OBS folder    ${cfg.out}  (${cfg.mode} mode)\n`);
  process.stdout.write(`  Gjallarhorn   ${cfg.host}:${cfg.port}\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`► All outputs land inside the OBS folder above.\n`);
  process.stdout.write(
    `► Open "gjallarhorn-LAYOUT.txt" in that folder to see every file path.\n`
  );
  process.stdout.write(`\n`);
  process.stdout.write(
    `To change these: double-click "Change OBS Bridge Settings.bat",\n`
  );
  process.stdout.write(
    `or edit obs-bridge.config.json, or delete it to start over.\n`
  );
  process.stdout.write("\n");
  process.stdout.write(
    `Listening for updates from Gjallarhorn — press Ctrl+C to stop.\n`
  );
  process.stdout.write("\n");
}

export type ResolveResult = {
  config: BridgeConfig;
  detectionNotes: string[];
  detectionMarkers: string[];
};

export async function resolveConfig(argv: string[]): Promise<ResolveResult> {
  const cli = parseCli(argv);

  if (isValidLevel(cli.logLevel)) setLogLevel(cli.logLevel);

  const fromFile = (cli.reconfigure ? null : loadConfig()) || {};

  let out = cli.out ?? fromFile.out;
  let extrasPrefix =
    cli.extrasPrefix ?? fromFile.extrasPrefix ?? DEFAULTS.extrasPrefix;
  let host = cli.host ?? fromFile.host ?? DEFAULTS.host;
  let port = cli.port ?? fromFile.port ?? DEFAULTS.port;
  let aggregate = cli.aggregate ?? fromFile.aggregate ?? DEFAULTS.aggregate;
  let forcedMode: BridgeMode | undefined =
    cli.tsh === true ? "tsh" : cli.tsh === false ? "native" : fromFile.mode;

  const noConfigYet = !out;

  if (cli.reconfigure || noConfigYet) {
    const wizardResult = await runWizard(fromFile);
    out = wizardResult.out;
    extrasPrefix = wizardResult.extrasPrefix;
    host = wizardResult.host;
    port = wizardResult.port;
    aggregate = wizardResult.aggregate;
    forcedMode = wizardResult.mode;
  }

  const det = detect(out!, forcedMode);
  const config: BridgeConfig = {
    out: det.resolvedOut,
    extrasPrefix,
    host,
    port,
    mode: det.mode,
    aggregate,
  };

  saveConfig(config);

  printBanner(config);
  for (const note of det.notes) log.info(note);
  if (det.markers.length > 0)
    log.info(`markers found: ${det.markers.join(", ")}`);
  log.info(`extras-prefix: ${config.extrasPrefix || "(root)"}`);

  return {
    config,
    detectionNotes: det.notes,
    detectionMarkers: det.markers,
  };
}

export function makeCacheDir(out: string): string {
  return path.join(out, ".obs-bridge-cache");
}
