import path from "path";
import {
  Mapping,
  MappingContext,
  enqueueImage,
  extrasPath,
  joinPath,
  writeText,
} from "./types";

type Player = {
  score?: string;
  name?: string;
  country?: string;
  face?: string;
  legend?: string;
  offsetX?: number;
  offsetZ?: number;
  splash?: string;
  legendName?: string;
  sponsor?: string;
  sponsorPath?: string;
  twitter?: string;
  twitch?: string;
  pr?: string;
};

type GamePayload = Player[];

// payload layout: [L.p1, R.p1, L.p2, R.p2, L.p3, R.p3, L.summary, R.summary]
function teamOf(i: number): 1 | 2 {
  return (i % 2 === 0 ? 1 : 2) as 1 | 2;
}

function playerOf(i: number): 1 | 2 | 3 {
  return (Math.floor(i / 2) + 1) as 1 | 2 | 3;
}

function hasPlayer(p: Player | undefined): boolean {
  return !!p && typeof p.name === "string" && p.name.trim().length > 0;
}

async function writePlayerToTsh(
  ctx: MappingContext,
  team: 1 | 2,
  player: 1 | 2 | 3,
  p: Player,
  present: boolean
): Promise<void> {
  const baseScore = joinPath(
    ctx,
    "score",
    "1",
    "team",
    String(team),
    "player",
    String(player)
  );
  const writes: Promise<void>[] = [];
  writes.push(
    writeText(path.join(baseScore, "name.txt"), present ? p.name : "")
  );
  writes.push(
    writeText(path.join(baseScore, "team.txt"), present ? p.sponsor : "")
  );
  writes.push(
    writeText(path.join(baseScore, "twitter.txt"), present ? p.twitter : "")
  );
  writes.push(
    writeText(
      path.join(baseScore, "character", "1", "name.txt"),
      present ? p.legendName : ""
    )
  );
  if (present) {
    enqueueImage(ctx, p.country, path.join(baseScore, "country", "asset.png"));
    enqueueImage(
      ctx,
      p.face,
      path.join(baseScore, "character", "1", "assets", "icon.png")
    );
    enqueueImage(
      ctx,
      p.legend,
      path.join(baseScore, "character", "1", "assets", "portrait.png")
    );
  }
  await Promise.all(writes);
}

async function writePlayerExtras(
  ctx: MappingContext,
  team: 1 | 2,
  player: 1 | 2 | 3,
  p: Player,
  present: boolean
): Promise<void> {
  const base = extrasPath(
    ctx,
    "game",
    "team",
    String(team),
    "player",
    String(player)
  );
  const writes: Promise<void>[] = [];
  writes.push(writeText(path.join(base, "name.txt"), present ? p.name : ""));
  writes.push(
    writeText(path.join(base, "sponsor.txt"), present ? p.sponsor : "")
  );
  writes.push(
    writeText(path.join(base, "sponsorPath.txt"), present ? p.sponsorPath : "")
  );
  writes.push(
    writeText(path.join(base, "country.txt"), present ? p.country : "")
  );
  writes.push(writeText(path.join(base, "face.txt"), present ? p.face : ""));
  writes.push(
    writeText(path.join(base, "legend.txt"), present ? p.legend : "")
  );
  writes.push(
    writeText(path.join(base, "offsetX.txt"), present ? p.offsetX ?? 0 : 0)
  );
  writes.push(
    writeText(path.join(base, "offsetZ.txt"), present ? p.offsetZ ?? 0 : 0)
  );
  writes.push(
    writeText(path.join(base, "splash.txt"), present ? p.splash : "")
  );
  writes.push(
    writeText(path.join(base, "legendName.txt"), present ? p.legendName : "")
  );
  writes.push(
    writeText(path.join(base, "twitter.txt"), present ? p.twitter : "")
  );
  writes.push(
    writeText(path.join(base, "twitch.txt"), present ? p.twitch : "")
  );
  writes.push(writeText(path.join(base, "pr.txt"), present ? p.pr : ""));
  await Promise.all(writes);
}

export const gameMapping: Mapping<GamePayload> = {
  source: "game.json",
  async apply(ctx, payload) {
    if (!Array.isArray(payload)) return;

    const summaries = [payload[6], payload[7]];

    const teamWrites: Promise<void>[] = [];
    if (ctx.mode === "tsh") {
      for (let t = 0; t < 2; t++) {
        const summary = summaries[t] || {};
        const team = (t + 1) as 1 | 2;
        teamWrites.push(
          writeText(
            joinPath(ctx, "score", "1", "team", String(team), "score.txt"),
            summary.score ?? "0"
          )
        );
        teamWrites.push(
          writeText(
            joinPath(ctx, "score", "1", "team", String(team), "teamName.txt"),
            summary.name ?? ""
          )
        );
      }
    }

    for (let t = 0; t < 2; t++) {
      const summary = summaries[t] || {};
      const team = (t + 1) as 1 | 2;
      teamWrites.push(
        writeText(
          extrasPath(ctx, "game", "team", String(team), "score.txt"),
          summary.score ?? "0"
        )
      );
      teamWrites.push(
        writeText(
          extrasPath(ctx, "game", "team", String(team), "name.txt"),
          summary.name ?? ""
        )
      );
    }

    const playerWrites: Promise<void>[] = [];
    for (let i = 0; i < 6; i++) {
      const p = payload[i] || {};
      const team = teamOf(i);
      const player = playerOf(i);
      const present = hasPlayer(p);
      if (ctx.mode === "tsh") {
        playerWrites.push(writePlayerToTsh(ctx, team, player, p, present));
      }
      playerWrites.push(writePlayerExtras(ctx, team, player, p, present));
    }

    await Promise.all([...teamWrites, ...playerWrites]);
  },
};
