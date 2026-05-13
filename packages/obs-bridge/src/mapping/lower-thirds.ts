import path from "path";
import { Mapping, extrasPath, writeText } from "./types";

type LowerThird = { title?: string; body?: string };
type Payload = LowerThird[] | LowerThird;

function unwrap(payload: Payload): LowerThird {
  if (Array.isArray(payload)) return payload[0] || {};
  return payload || {};
}

function makeMapping(slug: string): Mapping<Payload> {
  return {
    source: `lower-thirds/${slug}.json`,
    async apply(ctx, payload) {
      const data = unwrap(payload);
      const base = extrasPath(ctx, "lower-thirds", slug);
      await Promise.all([
        writeText(path.join(base, "title.txt"), data.title ?? ""),
        writeText(path.join(base, "body.txt"), data.body ?? ""),
      ]);
    },
  };
}

export const championMapping = makeMapping("champion");
export const preshowMapping = makeMapping("preshow");
export const twitchMapping = makeMapping("twitch");
export const messageMapping = makeMapping("message");
export const twitterMapping = makeMapping("twitter");
