import path from "path";
import {
  Mapping,
  MappingContext,
  enqueueImage,
  extrasPath,
  joinPath,
  writeText,
} from "./types";

type QueueEntry = { [k: string]: unknown };
type QueuePayload = QueueEntry[];

const QUEUE_NAME = "queue";
const SLOTS = 8;
const PLAYERS_PER_TEAM = 3;

function getStr(entry: QueueEntry, key: string): string {
  const v = entry[key];
  return v === undefined || v === null ? "" : String(v);
}

async function writeQueueSlotTsh(
  ctx: MappingContext,
  slotIdx: number,
  entry: QueueEntry
): Promise<void> {
  const slotN = String(slotIdx + 1);
  const slotBase = joinPath(ctx, "streamQueue", QUEUE_NAME, slotN);

  const writes: Promise<void>[] = [];
  writes.push(
    writeText(path.join(slotBase, "match.txt"), getStr(entry, "score"))
  );
  writes.push(
    writeText(path.join(slotBase, "phase.txt"), getStr(entry, "round"))
  );
  writes.push(
    writeText(path.join(slotBase, "event.txt"), getStr(entry, "startTime"))
  );

  for (let t = 1; t <= 2; t++) {
    const teamBase = path.join(slotBase, "team", String(t));
    const namekey = `entrant${t}.name`;
    const scorekey = `entrant${t}.score`;
    writes.push(
      writeText(path.join(teamBase, "teamName.txt"), getStr(entry, namekey))
    );
    writes.push(
      writeText(path.join(teamBase, "seed.txt"), getStr(entry, scorekey))
    );

    for (let p = 1; p <= PLAYERS_PER_TEAM; p++) {
      const pBase = path.join(teamBase, "player", String(p));
      const namekey = `entrant${t}.${p}.name`;
      const sponsorkey = `entrant${t}.${p}.sponsor`;
      writes.push(
        writeText(path.join(pBase, "name.txt"), getStr(entry, namekey))
      );
      writes.push(
        writeText(path.join(pBase, "team.txt"), getStr(entry, sponsorkey))
      );

      enqueueImage(
        ctx,
        entry[`entrant${t}.${p}.country`],
        path.join(pBase, "country", "asset.png")
      );
      enqueueImage(
        ctx,
        entry[`entrant${t}.${p}.face`],
        path.join(pBase, "character", "1", "assets", "icon.png")
      );
    }
  }

  await Promise.all(writes);
}

async function writeQueueSlotExtras(
  ctx: MappingContext,
  slotIdx: number,
  entry: QueueEntry
): Promise<void> {
  const slotN = String(slotIdx + 1);
  const slotBase = extrasPath(ctx, "queue", slotN);

  const writes: Promise<void>[] = [];
  writes.push(
    writeText(path.join(slotBase, "score.txt"), getStr(entry, "score"))
  );
  writes.push(
    writeText(path.join(slotBase, "round.txt"), getStr(entry, "round"))
  );
  writes.push(
    writeText(path.join(slotBase, "startTime.txt"), getStr(entry, "startTime"))
  );

  for (let t = 1; t <= 2; t++) {
    const teamBase = path.join(slotBase, "team", String(t));
    writes.push(
      writeText(
        path.join(teamBase, "name.txt"),
        getStr(entry, `entrant${t}.name`)
      )
    );
    writes.push(
      writeText(
        path.join(teamBase, "score.txt"),
        getStr(entry, `entrant${t}.score`)
      )
    );

    for (let p = 1; p <= PLAYERS_PER_TEAM; p++) {
      const pBase = path.join(teamBase, "player", String(p));
      const fields = [
        "name",
        "sponsor",
        "sponsorPath",
        "country",
        "face",
        "legend",
        "offsetX",
        "offsetZ",
        "pr",
        "region",
        "winner",
      ];
      for (const f of fields) {
        writes.push(
          writeText(
            path.join(pBase, `${f}.txt`),
            getStr(entry, `entrant${t}.${p}.${f}`)
          )
        );
      }
    }
  }

  await Promise.all(writes);
}

export const queueMapping: Mapping<QueuePayload> = {
  source: "queue.json",
  async apply(ctx, payload) {
    const arr = Array.isArray(payload) ? payload : [];

    const ops: Promise<void>[] = [];
    for (let i = 0; i < SLOTS; i++) {
      const entry = (arr[i] || {}) as QueueEntry;
      if (ctx.mode === "tsh") {
        ops.push(writeQueueSlotTsh(ctx, i, entry));
      }
      ops.push(writeQueueSlotExtras(ctx, i, entry));
    }
    await Promise.all(ops);
  },
};
