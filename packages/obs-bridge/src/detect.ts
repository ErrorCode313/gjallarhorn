import fs from "fs";
import path from "path";
import { BridgeMode } from "./config";

const STRONG_MARKERS = ["program_state.json", "score/1/team/1/teamName.txt"];
const MEDIUM_MARKERS = [
  "commentary/1/name.txt",
  "tournamentInfo/tournamentName.txt",
];
const WEAK_MARKERS = ["streamQueue"];

export type DetectionResult = {
  resolvedOut: string;
  mode: BridgeMode;
  markers: string[];
  notes: string[];
};

function existsAt(root: string, rel: string): boolean {
  try {
    return fs.existsSync(path.join(root, rel));
  } catch {
    return false;
  }
}

function looksLikeTshOut(dir: string): { ok: boolean; markers: string[] } {
  const markers: string[] = [];
  let strong = 0;
  let programStateAlone = false;

  for (const m of STRONG_MARKERS) {
    if (existsAt(dir, m)) {
      markers.push(m);
      strong++;
      if (m === "program_state.json") programStateAlone = true;
    }
  }
  for (const m of MEDIUM_MARKERS) {
    if (existsAt(dir, m)) markers.push(m);
  }
  for (const m of WEAK_MARKERS) {
    if (existsAt(dir, m)) markers.push(m);
  }

  const ok = strong >= 2 || (programStateAlone && strong >= 1);
  return { ok, markers };
}

function looksLikeTshRoot(dir: string): boolean {
  return (
    existsAt(dir, "TournamentStreamHelper.exe") ||
    existsAt(dir, "TournamentStreamHelper") ||
    existsAt(dir, "user_data") ||
    existsAt(dir, "user_data/games")
  );
}

export function resolveOutPath(input: string): {
  resolved: string;
  notes: string[];
} {
  const notes: string[] = [];
  const absInput = path.resolve(input);

  if (!fs.existsSync(absInput)) {
    notes.push(`Path ${absInput} does not exist; creating it.`);
    fs.mkdirSync(absInput, { recursive: true });
    return { resolved: absInput, notes };
  }

  if (looksLikeTshOut(absInput).ok) {
    return { resolved: absInput, notes };
  }

  const outSub = path.join(absInput, "out");
  if (fs.existsSync(outSub) && looksLikeTshOut(outSub).ok) {
    notes.push(`Treating ${absInput} as the TSH root; using ${outSub}.`);
    return { resolved: outSub, notes };
  }

  if (looksLikeTshRoot(absInput)) {
    if (!fs.existsSync(outSub)) {
      notes.push(
        `Found a TSH root at ${absInput} but no out/ folder yet; creating ${outSub}.`
      );
      fs.mkdirSync(outSub, { recursive: true });
    }
    return { resolved: outSub, notes };
  }

  return { resolved: absInput, notes };
}

export function detect(input: string, forced?: BridgeMode): DetectionResult {
  const { resolved, notes } = resolveOutPath(input);

  if (forced) {
    return { resolvedOut: resolved, mode: forced, markers: [], notes };
  }

  const { ok, markers } = looksLikeTshOut(resolved);
  return {
    resolvedOut: resolved,
    mode: ok ? "tsh" : "native",
    markers,
    notes,
  };
}
