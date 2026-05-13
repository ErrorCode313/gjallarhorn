import { Mapping } from "./types";
import { gameMapping } from "./game";
import { queueMapping } from "./queue";
import { castersMapping } from "./casters";
import { roundMapping } from "./round";
import { tickerMapping } from "./ticker";
import { playersMapping } from "./players";
import { bracketTop32Mapping } from "./bracket-top32";
import { liveGameMapping } from "./live-game";
import {
  championMapping,
  preshowMapping,
  twitchMapping,
  messageMapping,
  twitterMapping,
} from "./lower-thirds";
import {
  bracketSggMapping,
  remainingSggMapping,
  recentSetsMapping,
} from "./bracket-sgg";

export const REGISTRY: Map<string, Mapping<unknown>> = new Map<
  string,
  Mapping<unknown>
>([
  ["game.json", gameMapping as Mapping<unknown>],
  ["queue.json", queueMapping as Mapping<unknown>],
  ["casters.json", castersMapping as Mapping<unknown>],
  ["round.json", roundMapping as Mapping<unknown>],
  ["ticker.json", tickerMapping as Mapping<unknown>],
  ["players.json", playersMapping as Mapping<unknown>],
  ["bracket-Top32.json", bracketTop32Mapping as Mapping<unknown>],
  ["live/game.json", liveGameMapping as Mapping<unknown>],
  ["lower-thirds/champion.json", championMapping as Mapping<unknown>],
  ["lower-thirds/preshow.json", preshowMapping as Mapping<unknown>],
  ["lower-thirds/twitch.json", twitchMapping as Mapping<unknown>],
  ["lower-thirds/message.json", messageMapping as Mapping<unknown>],
  ["lower-thirds/twitter.json", twitterMapping as Mapping<unknown>],
  ["recent-sets.json", recentSetsMapping as Mapping<unknown>],
]);

const BRACKET_RE = /^bracket-(.+)\.json$/;
const REMAINING_RE = /^remaining-(.+)\.json$/;

export function dynamicMapping(key: string): Mapping<unknown> | null {
  const b = key.match(BRACKET_RE);
  if (b && key !== "bracket-Top32.json") {
    return bracketSggMapping(b[1]) as Mapping<unknown>;
  }
  const r = key.match(REMAINING_RE);
  if (r) return remainingSggMapping(r[1]) as Mapping<unknown>;
  return null;
}
