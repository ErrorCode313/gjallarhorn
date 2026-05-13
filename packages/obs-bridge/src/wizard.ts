import readline from "readline";
import path from "path";
import fs from "fs";
import { BridgeConfig, DEFAULTS } from "./config";
import { resolveOutPath, detect } from "./detect";

function makeRl(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "").trim();
}

export async function runWizard(
  existing?: Partial<BridgeConfig>
): Promise<BridgeConfig> {
  const rl = makeRl();
  process.stdout.write("\n");
  process.stdout.write("obs-bridge first-time setup\n");
  process.stdout.write("───────────────────────────\n");

  let out = "";
  let mode: BridgeConfig["mode"] = "native";

  for (;;) {
    const def = existing?.out ? ` (current: ${existing.out})` : "";
    const tshAnswer = stripQuotes(
      await ask(
        rl,
        `1) Where is your Tournament Stream Helper folder?\n   (paste the path; leave blank if you don't use TSH)${def}\n   > `
      )
    );

    if (tshAnswer === "" && existing?.out) {
      out = existing.out;
      mode = existing.mode || "native";
      break;
    }

    if (tshAnswer === "") {
      const def2 = existing?.out || "./obs-out";
      const obsAnswer = stripQuotes(
        await ask(
          rl,
          `   Where should OBS files be written? [default: ${def2}]\n   > `
        )
      );
      const chosen = obsAnswer || def2;
      const result = detect(chosen, "native");
      out = result.resolvedOut;
      mode = "native";
      process.stdout.write(`\n   ✓ Writing to ${out} (no TSH layout)\n\n`);
      break;
    }

    const result = detect(tshAnswer);
    if (result.mode === "tsh") {
      out = result.resolvedOut;
      mode = "tsh";
      process.stdout.write(
        `\n   ✓ TSH detected. Files will be written to ${out}\n\n`
      );
      break;
    } else {
      const useAnyway = (
        await ask(
          rl,
          `\n   I couldn't find TSH at ${result.resolvedOut}.\n   Use this folder anyway? [y/N] > `
        )
      ).toLowerCase();
      if (useAnyway === "y" || useAnyway === "yes") {
        out = result.resolvedOut;
        mode = "native";
        process.stdout.write(`\n   ✓ Writing to ${out} (no TSH layout)\n\n`);
        break;
      }
    }
  }

  let host = DEFAULTS.host;
  let port = DEFAULTS.port;

  const hostDef = existing?.host || DEFAULTS.host;
  const portDef = existing?.port || DEFAULTS.port;
  const sameComputer = (
    await ask(rl, `2) Is Gjallarhorn running on this same computer? [Y/n] > `)
  ).toLowerCase();

  if (sameComputer === "n" || sameComputer === "no") {
    const hostAnswer = stripQuotes(
      await ask(rl, `   Host or IP address? [default: ${hostDef}] > `)
    );
    host = hostAnswer || hostDef;

    const portAnswer = stripQuotes(
      await ask(rl, `   Port? [default: ${portDef}] > `)
    );
    const portNum = parseInt(portAnswer, 10);
    port = Number.isFinite(portNum) && portNum > 0 ? portNum : portDef;
    process.stdout.write(`\n   ✓ Using ${host}:${port}\n\n`);
  } else {
    host = hostDef;
    port = portDef;
    process.stdout.write(`\n   ✓ Using ${host} on port ${port}.\n\n`);
  }

  rl.close();

  return {
    out,
    extrasPrefix: existing?.extrasPrefix ?? DEFAULTS.extrasPrefix,
    host,
    port,
    mode,
    aggregate: existing?.aggregate ?? DEFAULTS.aggregate,
  };
}
