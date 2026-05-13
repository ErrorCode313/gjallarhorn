import path from "path";
import { BridgeConfig } from "./config";
import { writeTextAtomic } from "./writer";

const LAYOUT_FILENAME = "gjallarhorn-LAYOUT.txt";

function extras(cfg: BridgeConfig, ...segs: string[]): string {
  const p = cfg.extrasPrefix
    ? [cfg.extrasPrefix, ...segs].join("/")
    : segs.join("/");
  return p;
}

export async function writeLayoutDoc(cfg: BridgeConfig): Promise<string> {
  const x = (segs: string[]) => extras(cfg, ...segs);
  const lines: string[] = [];

  lines.push("OBS Bridge — where every Gjallarhorn output lives");
  lines.push("=================================================");
  lines.push("");
  lines.push(`Output folder:    ${cfg.out}`);
  lines.push(`Mode:             ${cfg.mode}`);
  lines.push(
    `Extras prefix:    ${cfg.extrasPrefix || "(written at the root)"}`
  );
  lines.push(`Gjallarhorn:      ${cfg.host}:${cfg.port}`);
  lines.push(`Generated:        ${new Date().toISOString()}`);
  lines.push("");
  lines.push(
    "Point your OBS Text and Image sources at the paths below. All paths"
  );
  lines.push("are relative to the Output folder shown above.");
  lines.push("");

  if (cfg.mode === "tsh") {
    lines.push(
      "─── TSH-COMPATIBLE PATHS ──────────────────────────────────────"
    );
    lines.push("(read by your existing TSH OBS scene without any changes)");
    lines.push("");
    lines.push("Live match scoreboard:");
    lines.push("  score/1/team/{1,2}/teamName.txt           Team name");
    lines.push("  score/1/team/{1,2}/score.txt              Team score");
    lines.push("  score/1/team/{1,2}/player/{1,2,3}/name.txt");
    lines.push(
      "  score/1/team/{1,2}/player/{1,2,3}/team.txt           Sponsor tag"
    );
    lines.push("  score/1/team/{1,2}/player/{1,2,3}/twitter.txt");
    lines.push(
      "  score/1/team/{1,2}/player/{1,2,3}/character/1/name.txt   Legend name"
    );
    lines.push(
      "  score/1/team/{1,2}/player/{1,2,3}/country/asset.png      Country flag (image)"
    );
    lines.push(
      "  score/1/team/{1,2}/player/{1,2,3}/character/1/assets/icon.png      Character head (image)"
    );
    lines.push(
      "  score/1/team/{1,2}/player/{1,2,3}/character/1/assets/portrait.png  Character full (image)"
    );
    lines.push("");
    lines.push("Round / bracket label:");
    lines.push(
      '  score/1/match.txt                         Round name (e.g. "Winners Final")'
    );
    lines.push("  score/1/phase.txt                         Bracket name");
    lines.push("");
    lines.push("Upcoming queue (slots 1–8):");
    lines.push(
      '  streamQueue/queue/{1..8}/match.txt        Score line (e.g. "3 - 0")'
    );
    lines.push("  streamQueue/queue/{1..8}/phase.txt        Round name");
    lines.push(
      "  streamQueue/queue/{1..8}/event.txt        Scheduled start time"
    );
    lines.push("  streamQueue/queue/{1..8}/team/{1,2}/teamName.txt");
    lines.push("  streamQueue/queue/{1..8}/team/{1,2}/seed.txt   Team score");
    lines.push("  streamQueue/queue/{1..8}/team/{1,2}/player/{1,2,3}/name.txt");
    lines.push(
      "  streamQueue/queue/{1..8}/team/{1,2}/player/{1,2,3}/team.txt   Sponsor"
    );
    lines.push(
      "  streamQueue/queue/{1..8}/team/{1,2}/player/{1,2,3}/country/asset.png"
    );
    lines.push(
      "  streamQueue/queue/{1..8}/team/{1,2}/player/{1,2,3}/character/1/assets/icon.png"
    );
    lines.push("");
    lines.push(
      "Commentary (TSH supports slots 1–2 only; 3 & 4 are in extras):"
    );
    lines.push("  commentary/{1,2}/name.txt                 Caster name");
    lines.push("  commentary/{1,2}/twitter.txt");
    lines.push("  commentary/{1,2}/pronoun.txt");
    lines.push("");
  }

  lines.push("─── EVERY GJALLARHORN FIELD (extras tree) ─────────────────────");
  lines.push("(written in BOTH modes; the only place TSH-mode users will find");
  lines.push(" fields TSH doesn't know about)");
  lines.push("");

  lines.push("Live match (mirror of game.json):");
  lines.push(`  ${x(["game", "team", "{1,2}", "score.txt"])}`);
  lines.push(`  ${x(["game", "team", "{1,2}", "name.txt"])}`);
  lines.push(
    `  ${x(["game", "team", "{1,2}", "player", "{1,2,3}", "name.txt"])}`
  );
  lines.push(
    `  ${x(["game", "team", "{1,2}", "player", "{1,2,3}", "sponsor.txt"])}`
  );
  lines.push(
    `  ${x([
      "game",
      "team",
      "{1,2}",
      "player",
      "{1,2,3}",
      "country.txt",
    ])}        URL`
  );
  lines.push(
    `  ${x([
      "game",
      "team",
      "{1,2}",
      "player",
      "{1,2,3}",
      "face.txt",
    ])}           URL`
  );
  lines.push(
    `  ${x([
      "game",
      "team",
      "{1,2}",
      "player",
      "{1,2,3}",
      "legend.txt",
    ])}         URL`
  );
  lines.push(
    `  ${x([
      "game",
      "team",
      "{1,2}",
      "player",
      "{1,2,3}",
      "splash.txt",
    ])}         URL or local path`
  );
  lines.push(
    `  ${x(["game", "team", "{1,2}", "player", "{1,2,3}", "legendName.txt"])}`
  );
  lines.push(
    `  ${x([
      "game",
      "team",
      "{1,2}",
      "player",
      "{1,2,3}",
      "pr.txt",
    ])}             Power Rank`
  );
  lines.push(
    `  ${x(["game", "team", "{1,2}", "player", "{1,2,3}", "twitter.txt"])}`
  );
  lines.push(
    `  ${x(["game", "team", "{1,2}", "player", "{1,2,3}", "twitch.txt"])}`
  );
  lines.push("");

  lines.push("Upcoming queue (slots 1–8):");
  lines.push(`  ${x(["queue", "{1..8}", "score.txt"])}`);
  lines.push(`  ${x(["queue", "{1..8}", "round.txt"])}`);
  lines.push(`  ${x(["queue", "{1..8}", "startTime.txt"])}`);
  lines.push(`  ${x(["queue", "{1..8}", "team", "{1,2}", "name.txt"])}`);
  lines.push(`  ${x(["queue", "{1..8}", "team", "{1,2}", "score.txt"])}`);
  lines.push(
    `  ${x([
      "queue",
      "{1..8}",
      "team",
      "{1,2}",
      "player",
      "{1,2,3}",
      "name.txt",
    ])}`
  );
  lines.push(
    `  ${x([
      "queue",
      "{1..8}",
      "team",
      "{1,2}",
      "player",
      "{1,2,3}",
      "pr.txt",
    ])}`
  );
  lines.push(
    `  ${x([
      "queue",
      "{1..8}",
      "team",
      "{1,2}",
      "player",
      "{1,2,3}",
      "winner.txt",
    ])}   Winner badge`
  );
  lines.push(
    "  (plus sponsor, sponsorPath, country, face, legend, offsetX, offsetZ, region — all .txt)"
  );
  lines.push("");

  lines.push("Casters (all 4 slots):");
  lines.push(`  ${x(["casters", "{1..4}", "name.txt"])}`);
  lines.push(`  ${x(["casters", "{1..4}", "twitter.txt"])}`);
  lines.push(`  ${x(["casters", "{1..4}", "pronouns.txt"])}`);
  lines.push("");

  lines.push("Round / bracket / region:");
  lines.push(`  ${x(["round", "round.txt"])}                  Round name`);
  lines.push(`  ${x(["round", "bracket.txt"])}                Bracket name`);
  lines.push(`  ${x(["round", "region.txt"])}                 Region`);
  lines.push("");

  lines.push("Ticker (up to 20 entries):");
  lines.push(
    `  ${x(["ticker", "count.txt"])}                 Number of entries`
  );
  lines.push(
    `  ${x([
      "ticker",
      "joined.txt",
    ])}                All entries joined with separators`
  );
  lines.push(`  ${x(["ticker", "{1..20}", "subject.txt"])}`);
  lines.push(`  ${x(["ticker", "{1..20}", "ticker.txt"])}`);
  lines.push("");

  lines.push("Deep player stats (pushed via the Players card):");
  lines.push(
    `  ${x(["players", "team", "{1,2}", "player", "{1,2,3}", "pr.txt"])}`
  );
  lines.push(
    `  ${x(["players", "team", "{1,2}", "player", "{1,2,3}", "earnings.txt"])}`
  );
  lines.push(
    `  ${x(["players", "team", "{1,2}", "player", "{1,2,3}", "winrate.txt"])}`
  );
  lines.push(
    `  ${x(["players", "team", "{1,2}", "player", "{1,2,3}", "top8.txt"])}`
  );
  lines.push(
    `  ${x(["players", "team", "{1,2}", "player", "{1,2,3}", "top32.txt"])}`
  );
  lines.push(
    `  ${x(["players", "team", "{1,2}", "player", "{1,2,3}", "gold.txt"])}`
  );
  lines.push(
    `  ${x(["players", "team", "{1,2}", "player", "{1,2,3}", "silver.txt"])}`
  );
  lines.push(
    `  ${x(["players", "team", "{1,2}", "player", "{1,2,3}", "bronze.txt"])}`
  );
  lines.push(
    `  ${x([
      "players",
      "team",
      "{1,2}",
      "player",
      "{1,2,3}",
      "lifetimeScore.txt",
    ])}`
  );
  lines.push(
    `  ${x(["players", "team", "{1,2}", "player", "{1,2,3}", "region.txt"])}`
  );
  lines.push(
    "  (plus name, sponsor, country, twitter, twitch, face, legend, splash, legendName, offsetX, offsetZ)"
  );
  lines.push("");

  lines.push("Top-32 bracket (CM tournaments):");
  lines.push(
    `  ${x([
      "bracket",
      "top32",
      "upper",
      "{1..16}",
      "entrant{1,2}",
      "name.txt",
    ])}`
  );
  lines.push(
    `  ${x([
      "bracket",
      "top32",
      "upper",
      "{1..16}",
      "entrant{1,2}",
      "score.txt",
    ])}`
  );
  lines.push(
    `  ${x([
      "bracket",
      "top32",
      "upper",
      "{1..16}",
      "entrant{1,2}",
      "winner.txt",
    ])}     Img path`
  );
  lines.push(
    `  ${x([
      "bracket",
      "top32",
      "upper",
      "{1..16}",
      "entrant{1,2}",
      "opacity.txt",
    ])}    Img path`
  );
  lines.push(
    `  ${x([
      "bracket",
      "top32",
      "{lower,finals}",
      "{1..16}",
      "...",
    ])}   (same shape)`
  );
  lines.push("");

  lines.push("Lower-thirds:");
  lines.push(`  ${x(["lower-thirds", "champion", "title.txt"])}`);
  lines.push(`  ${x(["lower-thirds", "champion", "body.txt"])}`);
  lines.push(`  ${x(["lower-thirds", "preshow", "{title,body}.txt"])}`);
  lines.push(`  ${x(["lower-thirds", "twitch", "{title,body}.txt"])}`);
  lines.push("");

  lines.push("Live overlay (mirror of live/game.json):");
  lines.push(
    `  ${x([
      "live",
      "game",
      "team",
      "{1,2}",
      "player",
      "{1,2,3}",
      "score.txt",
    ])}`
  );
  lines.push(
    `  ${x(["live", "game", "team", "{1,2}", "player", "{1,2,3}", "name.txt"])}`
  );
  lines.push(
    `  ${x(["live", "game", "team", "{1,2}", "player", "{1,2,3}", "face.txt"])}`
  );
  lines.push("  (plus id, legend, offsetX, offsetZ, splash, legendName)");
  lines.push("");

  lines.push("─── COMBINED STATE ────────────────────────────────────────────");
  lines.push(
    "  gjallarhorn-state.json     Every field above in one JSON file."
  );
  lines.push("                             Useful for OBS Browser sources.");
  lines.push("");
  lines.push("─── INTERNAL ──────────────────────────────────────────────────");
  lines.push("  .obs-bridge-cache/         Downloaded images (don't touch).");
  lines.push("  gjallarhorn-LAYOUT.txt     This file.");
  lines.push(
    "  obs-bridge.config.json     Your bridge settings (NOT in this folder; lives next to the .bat)."
  );
  lines.push("");
  lines.push("To regenerate this file: restart the bridge.");
  lines.push("");

  const dst = path.join(cfg.out, LAYOUT_FILENAME);
  await writeTextAtomic(dst, lines.join("\n"));
  return dst;
}
