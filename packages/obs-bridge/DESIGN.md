# obs-bridge — Gjallarhorn → OBS file bridge

A standalone TypeScript service that subscribes to a running Gjallarhorn instance
over Socket.IO and writes every output field to flat `.txt` files on disk in a
layout that OBS "Read from file" and "Image" sources can consume directly —
compatible with Tournament Stream Helper (TSH) scenes where the schemas overlap,
and exposing everything else under a clearly-namespaced `gjallarhorn/` subtree
so any field is wirable from OBS.

The Gjallarhorn core is not modified. The bridge is a pure consumer of the
existing `writeFile` event on `socket.external` (path `/api/external`).

---

## 0. Quickstart for TSH users (start here)

The bridge is designed so a streamer who already has a working TSH-based OBS
scene needs to change nothing in OBS. The shortest path:

1. **Make sure Gjallarhorn is running.** Same as before.
2. **Close Tournament Stream Helper.** TSH and the bridge both write to the
   same files; only one can be the writer.
3. **Double-click `Start OBS Bridge.bat`** (shipped next to the binary; see
   §5.4).
4. On first run, the bridge asks two questions:
   - _"Where is your Tournament Stream Helper folder?"_ — paste the folder
     that contains `TournamentStreamHelper.exe` and the `out/` subfolder.
     Anything reasonable works (the TSH root, or the `out/` folder directly).
   - _"Is Gjallarhorn running on this same computer? [Y/n]"_ — for the
     common case, just press Enter.
5. The bridge saves your answers to `obs-bridge.config.json` next to the
   `.bat` file. **You will never be asked again.**
6. The terminal prints the saved settings and `Listening for updates from Gjallarhorn — press Ctrl+C to stop`. Leave it running for the whole
   stream.
7. OBS now reads the same files TSH was writing. **No changes to the OBS
   scene.**

**To change settings later** (e.g. you moved TSH to a different folder), use
any one of these — pick whichever you find easiest:

- Double-click **`Change OBS Bridge Settings.bat`** (shipped alongside the
  regular launcher). It re-runs the same two-question wizard and overwrites
  the saved settings.
- Open `obs-bridge.config.json` in Notepad and edit the paths.
- Delete `obs-bridge.config.json` entirely; the wizard runs from scratch on
  next launch.

The hint about how to change settings is also printed every time the bridge
starts, so you don't need to memorize anything.

If the bridge ever exits with an error, the OBS scene continues to show the
last-written values. Restarting the `.bat` resumes updates.

**Images work in v1.** TSH stores country flags, character heads, etc. as
binary PNG files. Gjallarhorn produces URLs to those graphics. The bridge
downloads each URL the first time it's seen, caches the file, and copies it
to the TSH path the OBS Image source expects. See §9 for details.

---

## 1. Goals

1. **Drop-in replacement for TSH-driven OBS scenes.** Streamer points the bridge
   at their existing TSH `out/` folder; the scene Just Works for fields TSH
   already exposed (player names, team scores, queue, commentary).
2. **No data left behind.** Every field Gjallarhorn outputs — including ones
   TSH has no concept of (ticker, lower-thirds, champion banner, Top-32 bracket,
   per-player PR/earnings/winrate) — is also written to disk so the streamer
   can wire any new OBS source.
3. **Zero changes to gjallarhorn-core.** The bridge is a separate package, a
   separate process, a separate npm binary. The fork stays merge-friendly with
   upstream.
4. **Configurable.** All paths and layout decisions are CLI flags. The bridge
   never assumes a specific directory.
5. **Atomic.** OBS file watchers must never see a half-written file.
6. **Resilient.** Disconnects from gjallarhorn → exponential-backoff reconnect.
   No crash on translator errors; log and continue.

## 2. Non-goals (for v1)

- Two-way sync. OBS-bridge is write-only; it does not read OBS state.
- Replacing TSH. If TSH is also running and writing to the same folder, the two
  will race. The bridge assumes TSH is not running.
- Bidirectional protocols (REST, polling). Pure Socket.IO subscription.

---

## 3. Architecture

```
┌───────────────────────────┐         ┌────────────────────────────────┐
│ gjallarhorn (existing)    │         │ obs-bridge (new)               │
│                           │         │                                │
│  OutputService.writeFile  │         │  Socket.IO client              │
│    │                      │         │    │                           │
│    ├─ fs.writeFile JSON   │  socket │    └─ on('writeFile', (f, d))  │
│    └─ socket.external     ├────────►│         │                      │
│         .emit('writeFile')│ /api/   │         ▼                      │
│                           │ external│      Translator (mapping table)│
│                           │         │         │                      │
│                           │         │         ├──► Atomic text write │
│                           │         │         │       (tmp → rename) │
│                           │         │         │                      │
│                           │         │         └──► Image queue (§9)  │
│                           │         │              fetch → cache →   │
│                           │         │              copy to dest      │
└───────────────────────────┘         └────────────────────────────────┘
                                                  │
                                                  ▼
                                         {out}/score/1/team/1/.../name.txt
                                         {out}/score/1/team/1/.../country/asset.png
                                         {out}/gjallarhorn/ticker/1/...
                                         {out}/gjallarhorn-state.json
                                         {out}/.obs-bridge-cache/{sha}.png
```

### 3.1 Communication contract

The bridge connects to:

```
http://{host}:{port}/api/external
```

This is the existing `SocketService.external` server, declared at
[packages/core/src/services/socket.ts:36-41](../core/src/services/socket.ts#L36-L41).
`cors.origin` is `*` — an external Node Socket.IO client can connect without
configuration.

It subscribes to one event:

```ts
socket.on('writeFile', (filePathParts: string[], data: string) => { ... });
```

Emitted by
[packages/core/src/services/output.ts:47](../core/src/services/output.ts#L47).

- `filePathParts` is the relative path Gjallarhorn used (`["game.json"]`,
  `["lower-thirds", "champion.json"]`, `["live", "game.json"]`, etc.).
- `data` is the JSON string (already `JSON.stringify`'d, ready to parse).

That is the **only** event used. No requests/responses, no other channels.

### 3.2 Reconnection

- Initial connect: try forever with exponential backoff (1s → 2s → 4s →
  16s → cap at 30s).
- On disconnect: same backoff. Log at INFO.
- On connect: log; do not request a "replay" — gjallarhorn doesn't store one,
  and operator push actions will refresh state. The bridge's job starts at the
  next `writeFile`.

### 3.3 Atomic writes

```
1. Compute target path P.
2. Compute tmp path P.tmp.{pid}.{counter}.
3. fs.writeFile(tmp, content, 'utf8').
4. fs.rename(tmp, P).
```

Rename is atomic on Windows NTFS and on POSIX within the same volume — which
is the constraint we need, since OBS reads sit on the same volume.

On error, the tmp file is unlinked and the failure is logged. The destination
keeps its previous contents (OBS shows the previous frame).

### 3.4 Empty-slot semantics

If Gjallarhorn outputs `entrantSize: 2` (a 2v2 match), slot 3 must not contain
stale data from a previous 3v3 match. **The translator always writes every slot
in a card, blanking unused ones with empty strings.** Never delete files — OBS
"Read from file" treats a missing file the same as an empty string for text
sources but image sources break loudly. Just write `""`.

### 3.5 Crash isolation

The translator runs inside a `try { ... } catch (e) { log.error(e); }` per
incoming event. A buggy mapping for one file never blocks the next event.

---

## 4. Package layout

```
packages/obs-bridge/
├── package.json
├── tsconfig.json
├── DESIGN.md                  ← this file
├── README.md                  ← user-facing setup, after v1 ships
├── src/
│   ├── index.ts               ← #!/usr/bin/env node CLI entry
│   ├── cli.ts                 ← commander setup
│   ├── client.ts              ← Socket.IO client + reconnect
│   ├── writer.ts              ← atomic write primitive
│   ├── detect.ts              ← TSH out/ auto-detection
│   ├── translator.ts          ← dispatcher: routes filename → mapping
│   ├── mapping/
│   │   ├── index.ts           ← re-exports + the master Map
│   │   ├── types.ts           ← OutputMapping, MappingContext types
│   │   ├── game.ts            ← game.json mapping (TSH + extras)
│   │   ├── queue.ts           ← queue.json mapping
│   │   ├── casters.ts         ← casters.json mapping
│   │   ├── round.ts           ← round.json mapping
│   │   ├── ticker.ts          ← ticker.json mapping
│   │   ├── players.ts         ← players.json mapping
│   │   ├── bracket-top32.ts   ← bracket-Top32.json mapping
│   │   ├── bracket-sgg.ts     ← bracket-*.json + remaining-*.json + recent-sets.json
│   │   ├── live-game.ts       ← live/game.json mapping
│   │   └── lower-thirds.ts    ← lower-thirds/*.json mappings
│   ├── aggregate.ts           ← writes the gjallarhorn-state.json snapshot
│   └── log.ts                 ← structured logger (pino, matching core)
└── lib/                       ← tsc output (gitignored)
```

`package.json` declares a `bin`:

```json
{
  "name": "@bmg-esports/gjallarhorn-obs-bridge",
  "private": true,
  "bin": { "obs-bridge": "lib/index.js" },
  "dependencies": {
    "socket.io-client": "^4",
    "commander": "^12",
    "chokidar": "...", // only if §14 file-watch fallback is built
    "pino": "..."
  }
}
```

---

## 5. CLI

The bridge can be configured three ways, in priority order: command-line flags,
`obs-bridge.config.json` next to where it was invoked, environment variables.
Whatever's missing after all three is collected by the interactive wizard
(§5.3).

```
obs-bridge [options]

Options:
  -o, --out <path>          OBS output directory; OR the TSH root folder
                            (the bridge appends /out automatically if it
                            detects TSH inside)
  -e, --extras-prefix <s>   Subdirectory for Gjallarhorn-only fields
                            (default "gjallarhorn"; "" = root)
  -H, --host <host>         Gjallarhorn host (default localhost)
  -p, --port <number>       Gjallarhorn port (default from GJALLARHORN_PORT
                            env var or core's PORT default)
  --tsh                     Force TSH-mode mapping (skip auto-detect)
  --no-tsh                  Force native-mode mapping (skip auto-detect)
  --no-aggregate            Skip writing gjallarhorn-state.json
  --reconfigure             Ignore saved config; re-run the wizard
  --log-level <level>       trace|debug|info|warn|error (default info)
  -V, --version
  -h, --help

Env vars (overridden by flags, override config file):
  OBS_BRIDGE_OUT
  OBS_BRIDGE_EXTRAS_PREFIX
  OBS_BRIDGE_HOST
  OBS_BRIDGE_PORT
```

### 5.1 Example invocations

```bash
# First run on a new machine — wizard collects everything, saves config
obs-bridge

# Pointing at the TSH root works; bridge appends /out automatically
obs-bridge --out "D:/TournamentStreamHelper-5.81"

# Pointing directly at TSH's out/ also works
obs-bridge --out "D:/TournamentStreamHelper-5.81/out"

# Clean OBS data folder, native layout
obs-bridge --out "C:/obs-data" --no-tsh

# Force the wizard to run again (replaces the saved config)
obs-bridge --reconfigure

# Remote gjallarhorn server
obs-bridge --out "C:/obs-data" --host 192.168.1.20 --port 3000
```

### 5.2 Config file: `obs-bridge.config.json`

When the wizard finishes successfully (or any flag is explicitly set), the
bridge writes a JSON file in the working directory:

```jsonc
{
  "out": "D:/TournamentStreamHelper-5.81/out", // resolved, absolute
  "extrasPrefix": "gjallarhorn",
  "host": "localhost",
  "port": 3000,
  "mode": "tsh" // "tsh" | "native"
}
```

Schema is the smallest set of settings needed to start without prompting.
Loaded automatically on subsequent runs from the cwd. Streamers can edit it
in Notepad to change paths.

The wizard prefers a config that's clearly outdated — e.g., the `out` path no
longer exists on disk — by warning and re-prompting only for the broken field.

### 5.3 Interactive wizard (no-flag mode)

When the user runs `obs-bridge` with no flags AND no `obs-bridge.config.json`
exists, the wizard runs. Implementation: Node's built-in `readline/promises`
— **zero new dependencies**. Total wizard code budget: ~60 lines.

The transcript looks like this:

```
obs-bridge first-time setup
───────────────────────────
1) Where is your Tournament Stream Helper folder?
   (paste the path; leave blank if you don't use TSH)
   > D:/TournamentStreamHelper-5.81

   ✓ TSH detected. Files will be written to D:/TournamentStreamHelper-5.81/out

2) Is Gjallarhorn running on this same computer? [Y/n]
   > <Enter>

   ✓ Using localhost on the default port.

Settings saved to obs-bridge.config.json.

Listening for updates from Gjallarhorn — press Ctrl+C to stop.
```

On every _subsequent_ startup (config already exists, wizard skipped), the
bridge prints the same hint banner so the user always sees how to change
settings:

```
obs-bridge — using saved settings:
  OBS folder    D:/TournamentStreamHelper-5.81/out  (TSH mode)
  Gjallarhorn   localhost:3000

To change these: double-click "Change OBS Bridge Settings.bat",
or edit obs-bridge.config.json, or delete it to start over.

Listening for updates from Gjallarhorn — press Ctrl+C to stop.
```

This banner is printed by `src/index.ts` after config load and before the
socket client starts. It is not gated behind a verbose flag — the streamer
sees it every single time.

If the user leaves question 1 blank → native mode, asks where to write
instead (`C:/obs-data` default). If they enter a path that doesn't exist or
isn't TSH-shaped → "I couldn't find TSH there. Use this folder anyway? [y/N]".
If "n", re-prompt.

If they answer "n" to question 2 → "What's the host or IP? > " and "What
port? [3000] > ". Validate.

That's the entire wizard surface. No multi-screen UI, no inquirer library.

### 5.4 Windows `.bat` launchers

Two `.bat` files ship in `packages/obs-bridge/launchers/`. Streamers copy
**both** anywhere convenient (Desktop, OBS folder, USB stick) — they need to
sit next to each other so they share the same `obs-bridge.config.json`.

**`Start OBS Bridge.bat`** — the normal everyday launcher:

```bat
@echo off
cd /d "%~dp0"
node "%~dp0..\lib\index.js"
pause
```

**`Change OBS Bridge Settings.bat`** — the "I moved TSH / I want different
settings" button:

```bat
@echo off
cd /d "%~dp0"
node "%~dp0..\lib\index.js" --reconfigure
pause
```

The only difference is the `--reconfigure` flag. Shipping both means the
non-technical streamer never has to type a command-line flag, edit a JSON
file, or remember anything. They have two icons: one starts the bridge, the
other changes the settings.

`cd /d "%~dp0"` in both ensures `obs-bridge.config.json` is read from and
written to the folder the `.bat` files live in — so a streamer running off a
USB stick gets portable settings.

`pause` keeps the window open after Ctrl+C or a crash so the streamer can
read the message before it closes.

Matching `Start OBS Bridge.command` and `Change OBS Bridge Settings.command`
for Mac/Linux can be added in the same folder; same structure, different
shebang.

### 5.5 Concurrent launch with gjallarhorn (optional, advanced)

The bridge and core run as fully independent processes. If a tournament op
wants single-command startup, add to root `package.json`:

```json
{
  "scripts": {
    "start:all": "concurrently -k -n gjall,bridge \"gjallarhorn\" \"obs-bridge\""
  }
}
```

A bridge crash does not crash gjallarhorn and vice versa thanks to `-k` only
forwarding signals on exit.

---

## 6. TSH-mode auto-detection

The bridge accepts either the TSH **root folder** (containing
`TournamentStreamHelper.exe` and an `out/` subdir) or the TSH **`out/` folder
directly**. The streamer doesn't need to know which level matters. Resolution:

```
let resolved = path.resolve(input);
if (looksLikeTshOut(resolved)) {
  // already pointing at out/
} else if (existsSync(join(resolved, "out")) && looksLikeTshOut(join(resolved, "out"))) {
  resolved = join(resolved, "out");
} else if (existsSync(join(resolved, "TournamentStreamHelper.exe"))) {
  // TSH root without out/ yet (fresh install) — create and use it
  resolved = join(resolved, "out");
  mkdirSync(resolved, { recursive: true });
}
return resolved;
```

`looksLikeTshOut(dir)` checks for these marker files. The detection rule
applies _after_ the path resolution above — i.e. the bridge always tests the
final `out/` directory, not the user-provided path:

| Marker file present?                | Weight |
| ----------------------------------- | ------ |
| `program_state.json`                | strong |
| `score/1/team/1/teamName.txt`       | strong |
| `commentary/1/name.txt`             | medium |
| `tournamentInfo/tournamentName.txt` | medium |
| `streamQueue/`                      | weak   |

**TSH mode is set when ≥2 strong markers OR `program_state.json` alone is
present.** Otherwise native mode (the streamer never had TSH; just use the
folder as a fresh OBS data dir).

When neither `--tsh` nor `--no-tsh` is set, the result is auto-detected as
above. The flags force the mode regardless of markers.

In TSH mode, fields that have a TSH-compatible path go there; everything else
falls into `{extras-prefix}/`. In native mode, **everything** goes under
`{extras-prefix}/` and TSH paths are not used.

Startup log:

```
[obs-bridge] TSH detected at D:/TournamentStreamHelper-5.81
             writing to D:/TournamentStreamHelper-5.81/out
[obs-bridge] markers found: program_state.json, score/1/team/1/teamName.txt
[obs-bridge] extras-prefix: gjallarhorn
```

---

## 7. The `MappingContext`

Every mapping function receives:

```ts
type MappingContext = {
  outDir: string; // absolute, normalized
  extrasPrefix: string; // e.g. "gjallarhorn" or ""
  mode: "tsh" | "native";
  writer: AtomicWriter; // writer.write(absPath, contents): Promise<void>
};
```

And a parsed payload (the JSON `data` from the socket, already `JSON.parse`'d):

```ts
type Mapping<T = unknown> = {
  source: string | string[]; // gjallarhorn source path, e.g. "game.json"
  // or ["lower-thirds", "champion.json"]
  apply(ctx: MappingContext, payload: T): Promise<void>;
};
```

The dispatcher in `translator.ts` keys on the joined source path:

```ts
const KEY = (parts: string[]) => parts.join("/");

const REGISTRY: Map<string, Mapping> = new Map([
  ["game.json", gameMapping],
  ["queue.json", queueMapping],
  ["casters.json", castersMapping],
  ["round.json", roundMapping],
  ["ticker.json", tickerMapping],
  ["players.json", playersMapping],
  ["bracket-Top32.json", bracketTop32Mapping],
  ["live/game.json", liveGameMapping],
  ["lower-thirds/champion.json", championMapping],
  ["lower-thirds/preshow.json", preshowMapping],
  ["lower-thirds/twitch.json", twitchMapping],
  ["recent-sets.json", recentSetsMapping],
  // bracket-{name}.json and remaining-{name}.json are dynamic — see §8.10
]);
```

Unknown sources are logged at DEBUG and ignored.

---

## 8. Mapping tables

For each source file: where it comes from in the code, its data shape, and how
each field translates to disk. Field types are all strings written verbatim to
a `.txt` file unless noted.

> **Path notation:** all paths are relative to `{outDir}`. `{extras}` is shorthand
> for the `extrasPrefix` (`gjallarhorn/` by default; empty for flat). Slash
> separators normalize per OS.

### 8.1 `game.json` — the live match scoreboard

**Source:** [packages/core/src/backends/cards/game.ts:355-422](../core/src/backends/cards/game.ts#L355-L422)
emitted on operator "Push Game".

**Shape:** array of 8 objects in fixed order:

| Index | Role                         |
| ----- | ---------------------------- |
| 0     | Left team — player 1         |
| 1     | Right team — player 1        |
| 2     | Left team — player 2         |
| 3     | Right team — player 2        |
| 4     | Left team — player 3         |
| 5     | Right team — player 3        |
| 6     | Left team — entrant summary  |
| 7     | Right team — entrant summary |

Player object fields: `score, name, country (URL), face (URL), legend (URL), offsetX, offsetZ, splash (URL), legendName, sponsor, sponsorPath, twitter, twitch, pr`.
Summary object adds: `name` is `"p1/p2/p3"`, all image fields are empty strings.

**Empty-slot handling:** entries 2–5 are still produced when `entrantSize < 3`,
but their per-player image fields are filled with the UNKNOWN placeholders.
The translator detects "is this a real player vs. placeholder" by:

```
hasPlayer = payload[i].name !== "" && payload[i].name !== undefined
```

If `hasPlayer` is false, every TSH `.txt` for that slot is written as `""`.
This guarantees stale player data is cleared when the operator switches from
3v3 to 1v1 mid-event.

#### 8.1.1 TSH-mode output

| Source field              | TSH-mode path                                               | Kind  |
| ------------------------- | ----------------------------------------------------------- | ----- |
| `payload[6].score`        | `score/1/team/1/score.txt`                                  | text  |
| `payload[7].score`        | `score/1/team/2/score.txt`                                  | text  |
| `payload[6].name`         | `score/1/team/1/teamName.txt`                               | text  |
| `payload[7].name`         | `score/1/team/2/teamName.txt`                               | text  |
| `payload[0..5][...].name` | `score/1/team/{1\|2}/player/{1..3}/name.txt`                | text  |
| `payload[*].sponsor`      | `score/1/team/{}/player/{}/team.txt`                        | text  |
| `payload[*].country`      | `score/1/team/{}/player/{}/country/asset.png`               | image |
| `payload[*].twitter`      | `score/1/team/{}/player/{}/twitter.txt`                     | text  |
| `payload[*].face`         | `score/1/team/{}/player/{}/character/1/assets/icon.png`     | image |
| `payload[*].legend`       | `score/1/team/{}/player/{}/character/1/assets/portrait.png` | image |
| `payload[*].splash`       | (no TSH equivalent — extras image)                          | image |
| `payload[*].legendName`   | `score/1/team/{}/player/{}/character/1/name.txt`            | text  |

> Image fields are downloaded by the image queue (§9) and written to disk
> at the listed path. The URL is also always written to the matching
> `{extras}` `.txt` for Browser-source consumers.
>
> The exact TSH "character" asset filenames (`icon.png`, `portrait.png`) may
> vary by game definition file — TSH ships JSON definitions per game under
> `user_data/games/*/base_files/`. During implementation, inspect Brawlhalla's
> game definition to confirm the precise asset filenames the streamer's
> existing scene reads. Treat the paths in this table as the v1 default;
> override per-game via the mapping module if needed.

Index ↔ `{team}/{player}` resolution: `team = i % 2 === 0 ? 1 : 2`,
`player = floor(i / 2) + 1` for `i ∈ [0..5]`.

#### 8.1.2 Extras output (always written, both modes)

All fields go under `{extras}/game/team/{1,2}/player/{1..3}/` and
`{extras}/game/team/{1,2}/`:

```
{extras}/game/team/1/score.txt
{extras}/game/team/1/name.txt
{extras}/game/team/1/player/1/name.txt
{extras}/game/team/1/player/1/sponsor.txt
{extras}/game/team/1/player/1/sponsorPath.txt
{extras}/game/team/1/player/1/country.txt          ← URL
{extras}/game/team/1/player/1/face.txt             ← URL
{extras}/game/team/1/player/1/legend.txt           ← URL
{extras}/game/team/1/player/1/offsetX.txt
{extras}/game/team/1/player/1/offsetZ.txt
{extras}/game/team/1/player/1/splash.txt           ← URL or local path
{extras}/game/team/1/player/1/legendName.txt
{extras}/game/team/1/player/1/twitter.txt
{extras}/game/team/1/player/1/twitch.txt
{extras}/game/team/1/player/1/pr.txt
(same for team/1/player/{2,3} and team/2/...)
```

Streamers can wire either tree depending on whether they want to keep their
TSH scene or build new sources.

---

### 8.2 `queue.json` — upcoming match queue (8 slots)

**Source:** [packages/core/src/backends/cards/queue.ts:433-559](../core/src/backends/cards/queue.ts#L433-L559).

**Shape:** array of exactly 8 entries (padded with blanks). Each entry has flat
dot-notation keys for two teams × three players:

```
score, round, startTime,
entrant1.name, entrant1.score,
entrant1.1.name, entrant1.1.sponsor, entrant1.1.sponsorPath,
entrant1.1.country, entrant1.1.face, entrant1.1.legend,
entrant1.1.offsetX, entrant1.1.offsetZ, entrant1.1.pr,
entrant1.1.region, entrant1.1.winner,
entrant1.2.* (same set),
entrant1.3.* (same set),
entrant2.* (same shape as entrant1.*)
```

#### 8.2.1 TSH-mode output

TSH's `streamQueue/{queueName}/{i+1}/` tree, where `queueName` is the
operator-selected active queue. We don't have it on this socket event directly,
so the translator subscribes additionally to either:

(a) the state-broadcast endpoint via Socket.IO (`backendState` or similar), or
(b) reads the most-recent `program_state.json` value (TSH-mode only).

**v1 simplification:** Hard-code the queue name to `"queue"` in TSH mode
(`streamQueue/queue/{1..8}/...`). Document that this is a v1 limitation. The
streamer can point an OBS source at any path under that name. Multi-queue
support is a v2 enhancement (§14).

Per-set fields:

| Source key                             | TSH-mode path                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `payload[i].score`                     | `streamQueue/queue/{i+1}/match.txt`                                             |
| `payload[i].round`                     | `streamQueue/queue/{i+1}/phase.txt`                                             |
| `payload[i].startTime`                 | `streamQueue/queue/{i+1}/event.txt` _(closest TSH match)_                       |
| `payload[i].entrant{1,2}.score`        | `streamQueue/queue/{i+1}/team/{1,2}/seed.txt` _(repurposed)_                    |
| `payload[i].entrant{1,2}.name`         | `streamQueue/queue/{i+1}/team/{1,2}/teamName.txt`                               |
| `payload[i].entrant{1,2}.{1,2,3}.name` | `streamQueue/queue/{i+1}/team/{1,2}/player/{1,2,3}/name.txt`                    |
| `.entrant{}.{}.sponsor`                | `streamQueue/queue/{i+1}/team/{}/player/{}/team.txt`                            |
| `.entrant{}.{}.country`                | `streamQueue/queue/{i+1}/team/{}/player/{}/country/asset.png` (image)           |
| `.entrant{}.{}.face`                   | `streamQueue/queue/{i+1}/team/{}/player/{}/character/1/assets/icon.png` (image) |
| `.entrant{}.{}.legend`                 | (extras only — no canonical TSH queue path)                                     |
| `.entrant{}.{}.pr`, `.region`          | (extras only — TSH has no rank field)                                           |
| `.entrant{}.{}.winner`                 | (extras only)                                                                   |

> The TSH semantic for `seed.txt`, `phase.txt`, `event.txt`, `match.txt` is
> close but not exact. Document in README that these are best-effort mappings,
> and the canonical accurate source is the extras tree.

#### 8.2.2 Extras output

```
{extras}/queue/{1..8}/score.txt
{extras}/queue/{1..8}/round.txt
{extras}/queue/{1..8}/startTime.txt
{extras}/queue/{1..8}/team/{1,2}/name.txt
{extras}/queue/{1..8}/team/{1,2}/score.txt
{extras}/queue/{1..8}/team/{1,2}/player/{1,2,3}/name.txt
{extras}/queue/{1..8}/team/{1,2}/player/{1,2,3}/sponsor.txt
{extras}/queue/{1..8}/team/{1,2}/player/{1,2,3}/sponsorPath.txt
{extras}/queue/{1..8}/team/{1,2}/player/{1,2,3}/country.txt
{extras}/queue/{1..8}/team/{1,2}/player/{1,2,3}/face.txt
{extras}/queue/{1..8}/team/{1,2}/player/{1,2,3}/legend.txt
{extras}/queue/{1..8}/team/{1,2}/player/{1,2,3}/offsetX.txt
{extras}/queue/{1..8}/team/{1,2}/player/{1,2,3}/offsetZ.txt
{extras}/queue/{1..8}/team/{1,2}/player/{1,2,3}/pr.txt
{extras}/queue/{1..8}/team/{1,2}/player/{1,2,3}/region.txt
{extras}/queue/{1..8}/team/{1,2}/player/{1,2,3}/winner.txt
```

Empty slots ("TBD" names) are written as the literal Gjallarhorn output
(`"TBD"`), preserving operator intent.

---

### 8.3 `casters.json` — commentary roster (4 slots)

**Source:** [packages/core/src/backends/cards/casters.ts:36-46](../core/src/backends/cards/casters.ts#L36-L46).

**Shape:** array of exactly 4 entries: `{ caster, twitter, pronouns }`.

#### TSH-mode output

TSH's `commentary/` only has 2 slots. Map indices 0 and 1; put 2 and 3 in
extras only.

| Source                | TSH path                   |
| --------------------- | -------------------------- |
| `payload[0].caster`   | `commentary/1/name.txt`    |
| `payload[0].twitter`  | `commentary/1/twitter.txt` |
| `payload[0].pronouns` | `commentary/1/pronoun.txt` |
| `payload[1].caster`   | `commentary/2/name.txt`    |
| `payload[1].twitter`  | `commentary/2/twitter.txt` |
| `payload[1].pronouns` | `commentary/2/pronoun.txt` |

#### Extras output (all 4)

```
{extras}/casters/{1..4}/name.txt
{extras}/casters/{1..4}/twitter.txt
{extras}/casters/{1..4}/pronouns.txt
```

---

### 8.4 `round.json` — current round / bracket / region

**Source:** [packages/core/src/backends/cards/game.ts:320-334](../core/src/backends/cards/game.ts#L320-L334).

**Shape:** `[{ text: round }, { text: bracket }, { text: region }]`.

#### TSH-mode output

| Source            | TSH path                     |
| ----------------- | ---------------------------- |
| `payload[0].text` | `score/1/match.txt`          |
| `payload[1].text` | `score/1/phase.txt`          |
| `payload[2].text` | (no TSH field — extras only) |

#### Extras output

```
{extras}/round/round.txt       ← payload[0].text
{extras}/round/bracket.txt     ← payload[1].text
{extras}/round/region.txt      ← payload[2].text
```

---

### 8.5 `ticker.json` — scrolling ticker entries

**Source:** [packages/core/src/backends/cards/ticker.ts:53-70](../core/src/backends/cards/ticker.ts#L53-L70).

**Shape:** array of variable length, each entry `{ subject, ticker }`.

**No TSH equivalent.** Extras only.

#### Extras output

```
{extras}/ticker/count.txt                  ← payload.length
{extras}/ticker/joined.txt                 ← all subjects+tickers joined by " — "
{extras}/ticker/{i+1}/subject.txt          ← per-entry
{extras}/ticker/{i+1}/ticker.txt
```

`joined.txt` lets a streamer wire a single OBS Text source to display the
whole ticker in scrolling marquee mode without scripting. Format is
`"{subject}: {ticker} · {subject}: {ticker} · ..."` (em-dash separator).

The translator must **clear stale slots** when ticker entries are removed.
v1 strategy: write a fixed maximum of 20 slots; entries beyond `payload.length`
get empty strings.

---

### 8.6 `players.json` — deep player profile card (6 entries)

**Source:** [packages/core/src/backends/cards/players.ts:176-228](../core/src/backends/cards/players.ts#L176-L228).

**Shape:** array of 6 entries (left.p1, right.p1, left.p2, right.p2, left.p3,
right.p3), each with: `name, sponsor, sponsorPath, country (URL), twitter, twitch, face (URL), legend (URL), offsetX, offsetZ, splash (URL), legendName, pr, region, earnings, top8, top32, gold, silver, bronze, lifetimeScore, winrate`.

**No TSH equivalent for the deep stats.** TSH-mode optionally mirrors the
name/sponsor/country to `score/1/team/{}/player/{}/...` _only if game.json has
not been pushed recently_ — but this risks stomping. v1 decision:
**players.json is extras-only**, never writes to TSH paths. Document this.

#### Extras output

```
{extras}/players/team/{1,2}/player/{1,2,3}/name.txt
{extras}/players/team/{1,2}/player/{1,2,3}/sponsor.txt
{extras}/players/team/{1,2}/player/{1,2,3}/sponsorPath.txt
{extras}/players/team/{1,2}/player/{1,2,3}/country.txt
{extras}/players/team/{1,2}/player/{1,2,3}/twitter.txt
{extras}/players/team/{1,2}/player/{1,2,3}/twitch.txt
{extras}/players/team/{1,2}/player/{1,2,3}/face.txt
{extras}/players/team/{1,2}/player/{1,2,3}/legend.txt
{extras}/players/team/{1,2}/player/{1,2,3}/offsetX.txt
{extras}/players/team/{1,2}/player/{1,2,3}/offsetZ.txt
{extras}/players/team/{1,2}/player/{1,2,3}/splash.txt
{extras}/players/team/{1,2}/player/{1,2,3}/legendName.txt
{extras}/players/team/{1,2}/player/{1,2,3}/pr.txt
{extras}/players/team/{1,2}/player/{1,2,3}/region.txt
{extras}/players/team/{1,2}/player/{1,2,3}/earnings.txt
{extras}/players/team/{1,2}/player/{1,2,3}/top8.txt
{extras}/players/team/{1,2}/player/{1,2,3}/top32.txt
{extras}/players/team/{1,2}/player/{1,2,3}/gold.txt
{extras}/players/team/{1,2}/player/{1,2,3}/silver.txt
{extras}/players/team/{1,2}/player/{1,2,3}/bronze.txt
{extras}/players/team/{1,2}/player/{1,2,3}/lifetimeScore.txt
{extras}/players/team/{1,2}/player/{1,2,3}/winrate.txt
```

Index ↔ team/player resolution: `team = i % 2 + 1`, `player = floor(i/2) + 1`.

---

### 8.7 `bracket-Top32.json` — final stages bracket

**Source:** [packages/core/src/backends/pages/tournament.ts:534-657](../core/src/backends/pages/tournament.ts#L534-L657).

**Shape:** array of `OutputSet` objects, each with `identifier, round, bracket`
(`upper` | `lower` | `finals`), `entrant1.name, entrant1.winner (img path), entrant1.opacity (img path), entrant1.score`, and same for `entrant2`.

Sets within a bracket are ordered by `bracket` group then `round`. The bridge
must split them into three groups for routing.

**No TSH equivalent.** Extras only.

#### Extras output

```
{extras}/bracket/top32/upper/{1..N}/identifier.txt
{extras}/bracket/top32/upper/{1..N}/round.txt
{extras}/bracket/top32/upper/{1..N}/entrant1/name.txt
{extras}/bracket/top32/upper/{1..N}/entrant1/winner.txt
{extras}/bracket/top32/upper/{1..N}/entrant1/opacity.txt
{extras}/bracket/top32/upper/{1..N}/entrant1/score.txt
{extras}/bracket/top32/upper/{1..N}/entrant2/name.txt
{extras}/bracket/top32/upper/{1..N}/entrant2/winner.txt
{extras}/bracket/top32/upper/{1..N}/entrant2/opacity.txt
{extras}/bracket/top32/upper/{1..N}/entrant2/score.txt
(same under .../lower/{1..N}/...)
(same under .../finals/{1..N}/...)
```

`N` is the per-bracket count. Stale-slot clearing: write up to a fixed maximum
of 16 slots per bracket; entries beyond `length` get empty strings.

---

### 8.8 `live/game.json` — live overlay variant of the scoreboard

**Source:** [packages/core/src/backends/cards/game.ts:402-418](../core/src/backends/cards/game.ts#L402-L418).

**Shape:** array of 2, 4, or 6 entries depending on `entrantSize`. Each entry:
`score, id, name, face (URL), legend (URL), offsetX, offsetZ, splash (URL), legendName`.

**No TSH equivalent.** Extras only.

#### Extras output

```
{extras}/live/game/team/{1,2}/player/{1,2,3}/score.txt
{extras}/live/game/team/{1,2}/player/{1,2,3}/id.txt
{extras}/live/game/team/{1,2}/player/{1,2,3}/name.txt
{extras}/live/game/team/{1,2}/player/{1,2,3}/face.txt
{extras}/live/game/team/{1,2}/player/{1,2,3}/legend.txt
{extras}/live/game/team/{1,2}/player/{1,2,3}/offsetX.txt
{extras}/live/game/team/{1,2}/player/{1,2,3}/offsetZ.txt
{extras}/live/game/team/{1,2}/player/{1,2,3}/splash.txt
{extras}/live/game/team/{1,2}/player/{1,2,3}/legendName.txt
```

Empty slots blanked. Same index→team/player resolution as `game.json`.

---

### 8.9 `lower-thirds/{champion,preshow,twitch}.json`

**Source:** [packages/core/src/backends/cards/lower-thirds.ts:66-82](../core/src/backends/cards/lower-thirds.ts#L66-L82).

**Shape (each file):** `[{ title, body }]` — array of one object (arrayified for
vMix compatibility).

**No TSH equivalent.** Extras only.

#### Extras output

```
{extras}/lower-thirds/champion/title.txt
{extras}/lower-thirds/champion/body.txt
{extras}/lower-thirds/preshow/title.txt
{extras}/lower-thirds/preshow/body.txt
{extras}/lower-thirds/twitch/title.txt
{extras}/lower-thirds/twitch/body.txt
```

Note: the `message` and `twitter` lower-thirds defined in the backend's State
exist but are not written to disk based on the code — only the currently
active `state.type` is pushed. Watch for that during testing; if other types
start showing up, add their mappings here.

---

### 8.10 `bracket-{name}.json` / `remaining-{name}.json` / `recent-sets.json`

**Source (sgg only):** [packages/core/src/backends/pages/tournament.ts:412-472](../core/src/backends/pages/tournament.ts#L412-L472).

These are dynamic file names — the `{name}` is a tournament phase name like
`Top32`, `Top16`, `Round Robin Pool A`, etc. The bridge cannot enumerate them
in advance.

**Translator dispatch:** in `translator.ts`, after the static `REGISTRY`
lookup fails, try regex matches:

```ts
if (key.match(/^bracket-(.+)\.json$/)) → bracketSggMapping(name, payload)
if (key.match(/^remaining-(.+)\.json$/)) → remainingSggMapping(name, payload)
```

The `{name}` is sanitized (replace `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`
with `_`, then trim) before being used as a path component.

**No TSH equivalent.** Extras only.

#### Extras output

```
{extras}/bracket/{name}/sets/{1..N}/identifier.txt
{extras}/bracket/{name}/sets/{1..N}/round.txt
{extras}/bracket/{name}/sets/{1..N}/entrant1/name.txt
... (same shape as bracket-Top32, see §8.7)

{extras}/bracket/{name}/remaining/{1..N}/...

{extras}/recent-sets/{1..N}/id.txt
{extras}/recent-sets/{1..N}/identifier.txt
{extras}/recent-sets/{1..N}/phase.txt
{extras}/recent-sets/{1..N}/phaseGroup.txt
{extras}/recent-sets/{1..N}/round.txt
{extras}/recent-sets/{1..N}/bracket.txt
{extras}/recent-sets/{1..N}/elimination.txt
{extras}/recent-sets/{1..N}/entrant1/name.txt
{extras}/recent-sets/{1..N}/entrant1/score.txt
{extras}/recent-sets/{1..N}/entrant1/seed.txt
{extras}/recent-sets/{1..N}/entrant2/...
```

`recent-sets.json` shape is documented in
[packages/core/src/backends/pages/tournament.ts:435-468](../core/src/backends/pages/tournament.ts#L435-L468).

The schema of `bracket-*.json` and `remaining-*.json` is determined by the
helper `getBracketExport` / `getRoundRobinBracketExport` in
[packages/core/src/support/brackets.ts](../core/src/support/brackets.ts) —
inspect that file during implementation to fill in the exact field list. v1
ships a pass-through that writes every top-level scalar of every array entry
as a `.txt` and skips object/array fields (logs a TODO).

---

## 9. Image downloader

OBS Browser sources require a static URL hard-coded in the scene. There is no
mechanism for a Browser source to read its URL from a file. Therefore, for a
TSH-style scene to keep working, the bridge must produce the actual binary
image at the on-disk path the OBS Image source already points at.

### 9.1 Design

The translator marks each mapping entry as either `text` or `image`. For
image entries:

1. Translator calls `imageQueue.enqueue(url, destAbsPath)`.
2. The queue runs N parallel workers (default 4). Each worker:
   - Computes `sha = sha256(url)`.
   - Cache path: `{outDir}/.obs-bridge-cache/{sha}{ext}` where `ext` is
     inferred from URL path or response `Content-Type` (`.png` default).
   - If the cache file exists: skip the network call.
   - Else: `fetch(url)` (Node 18+ built-in, no dep). Stream to cache path
     via tmp+rename, same atomic pattern as text writes.
   - Once the cache file is present, `fs.copyFile(cache, dest)` (via
     tmp+rename).
3. On fetch error (network down, 404, timeout): log WARN, leave the
   destination file untouched (the previous image stays on screen).
4. On HTTP 200 but invalid content (zero bytes, HTML, etc.): treat as fetch
   error.

The cache is content-addressable, so the same URL is never re-fetched even
across bridge restarts. The translator is non-blocking on image work: the
text `.txt` files write immediately, images catch up.

### 9.2 Cache location and lifetime

```
{outDir}/.obs-bridge-cache/
    {sha256-hex}.png
    {sha256-hex}.svg
    ...
```

Leading dot prefix keeps it visually separated from TSH/Gjallarhorn data and
hides it on most file managers. No automatic eviction in v1 — the cache grows
forever, but each image is a few KB at most. Manual cleanup: delete the
folder. The bridge re-downloads on next request.

A bounded LRU eviction is listed under §14 future work.

### 9.3 Image flow for the `unknown` placeholder

Gjallarhorn emits `https://static.brawltools.com/heads/UNKNOWN.png` (and
similar `____unknown.png`, `UNKNOWN.png` for legend / splash) for empty
player slots. These are first-class URLs and are downloaded like any other.
The streamer's TSH scene will display the upstream Brawlhalla "unknown"
placeholder, which is the same image TSH itself uses. No special-casing
needed.

### 9.4 Failure modes

| Scenario                                 | Effect                                      |
| ---------------------------------------- | ------------------------------------------- |
| Upstream CDN down                        | WARN logged; previous image stays on screen |
| URL returns 404                          | WARN logged; previous image stays on screen |
| Empty / corrupt body                     | WARN logged; previous image stays on screen |
| Disk full while writing cache            | ERROR logged; image write fails             |
| Local file delete (operator wiped cache) | Re-downloaded on next emit                  |
| Same URL ↔ different slots               | One download, copied to each destination    |
| `https://` cert error                    | WARN logged; previous image stays on screen |

The "previous image stays on screen" property is critical: a transient
network blip should never blank a player's character icon during a live
match.

### 9.5 Code budget

Estimated implementation size:

- `image-queue.ts`: queue + worker pool (~40 lines)
- `cache.ts`: cache path + atomic write (~25 lines)
- Hook in `translator.ts`: route `image` kind entries to queue (~10 lines)

Total ~75 lines. No new dependencies (Node 18+ `fetch` and `crypto.subtle`).

---

## 10. Aggregate snapshot — `gjallarhorn-state.json`

In addition to the flat tree, the bridge writes one combined JSON file:

```
{outDir}/gjallarhorn-state.json
```

Schema:

```jsonc
{
  "updatedAt": "2026-05-12T20:14:33.412Z",
  "sources": {
    "game.json": [ ... last-seen payload ... ],
    "queue.json": [ ... ],
    "casters.json": [ ... ],
    "round.json": [ ... ],
    "ticker.json": [ ... ],
    "players.json": [ ... ],
    "bracket-Top32.json": [ ... ],
    "live/game.json": [ ... ],
    "lower-thirds/champion.json": [ ... ],
    "lower-thirds/preshow.json": [ ... ],
    "lower-thirds/twitch.json": [ ... ],
    "bracket-*.json": { "<name>": [ ... ] },
    "remaining-*.json": { "<name>": [ ... ] },
    "recent-sets.json": [ ... ]
  }
}
```

This is intentionally parallel to TSH's `program_state.json`. Streamers using
Browser sources can fetch this single file instead of N text files. Updated
on every incoming event. Atomic-written same as everything else.

Skipped if `--no-aggregate`.

---

## 11. Logging

Use `pino` with a CLI pretty transport.

Log lines:

| Level | Event                                               |
| ----- | --------------------------------------------------- |
| INFO  | Startup: out dir, mode, extras-prefix, host:port    |
| INFO  | Socket connect/disconnect                           |
| INFO  | TSH layout detected (and which markers were found)  |
| DEBUG | Every `writeFile` received: source + size           |
| DEBUG | Each output path written                            |
| WARN  | Mapping skipped (unknown source)                    |
| ERROR | Translator threw — full stack, source path, payload |

No telemetry. No remote logging. Local console only.

---

## 12. Testing strategy

Unit tests (Jest) for each mapping. Input fixture (a real captured
`game.json` etc., committed under `packages/obs-bridge/test/fixtures/`),
output expectation as a flat object `{ relPath: contents }`. The test
asserts that for the given fixture, applying the mapping produces exactly
that set of writes — no extras, none missing.

Integration test: spin up a stub Socket.IO server, emit one `writeFile`
per fixture, assert the on-disk tree matches a snapshot directory in
`test/snapshots/`.

End-to-end (manual, documented in README): start gjallarhorn, start
obs-bridge, click each "Push" button in the operator UI, verify files
appear and OBS reflects them.

---

## 13. Build & ship

- TypeScript, target `es2020`, module `commonjs` to match the rest of the
  monorepo.
- `tsc -b` for the build. No bundler — node consumes the lib/ output directly.
- Added to root `package.json`'s `workspaces` (the monorepo already uses
  workspaces — confirmed by [package-lock.json](../../package-lock.json)).
- Added to `tsconfig.base.json`'s `references` so a root `tsc -b` builds it.
- Binary published as `obs-bridge` via `bin` in package.json. When the root
  `npm install` runs, symlinks land in `node_modules/.bin/obs-bridge`.

---

## 14. Future work / explicitly deferred

1. **Bounded LRU image cache.** v1 cache grows forever (§9.2). Add a
   size/age-based eviction policy when it becomes a problem.
2. **Multi-queue support.** Read the active queue name from a state-broadcast
   socket event (or from the cached `gjallarhorn-state.json`) and route
   `queue.json` to `streamQueue/{actual queue name}/{i+1}/...`.
3. **Per-game character asset name overrides.** TSH's character asset
   filenames vary by game definition. v1 hard-codes Brawlhalla paths; future
   versions could read the same `user_data/games/*/base_files/` definitions
   TSH uses, or accept a `--game <slug>` flag.
4. **Chokidar file-watch fallback.** If we discover a scenario where the
   socket connection is unreliable, add a fallback that reads `output/*.json`
   on filesystem change. Skipped from v1 per design decision; the socket
   already covers every realistic deployment.
5. **Two-process launcher in repo scripts.** Add `concurrently` to root deps
   and a `start:all` script. Mentioned in §5.5.
6. **CLAUDE.md hooks.** None needed — bridge is independent of agent tooling.
7. **Upstream PR.** Once stable, propose to BMG-Esports/gjallarhorn upstream
   as an optional package. No core changes required.

---

## 15. Decision log (so future readers see the reasoning)

- **Why separate package, not a flag on the core CLI?** Keeps the fork
  upstream-mergeable. Bridge bugs cannot crash the operator's
  tournament-control software. Distributable independently.
- **Why socket only, no file-watcher fallback?** No realistic scenario
  needs it: gjallarhorn is the only source of truth and the bridge follows
  it 1:1. A second mechanism doubles the surface area for bugs and race
  conditions. Easy to add later if a real need appears (§14).
- **Why writes-only, not a request/response protocol?** Gjallarhorn already
  emits `writeFile` for every output. No need to invent a parallel API.
- **Why ship the `gjallarhorn/` subtree even in TSH mode?** The user
  explicitly wants every Gjallarhorn output reachable from OBS, including
  fields TSH has no concept of. The dual-tree pattern lets the streamer
  keep their existing TSH scene unchanged AND wire ticker, lower-thirds,
  etc. without conflict.
- **Why download images instead of pointing OBS at URLs?** OBS Browser
  sources require a URL hard-coded in the scene; there is no mechanism to
  read a URL from a file. OBS Image sources only read local files. Either
  way, for a TSH-style scene to keep working unchanged, the bridge must
  produce the actual binary file on disk. A v1 without the image
  downloader breaks the core migration story (§9).
- **Why does the bridge accept the TSH root folder OR the `out/` subdir?**
  Streamers are not expected to know which level matters. The bridge sniffs
  for TSH markers in either location and resolves to the correct path
  itself (§6).
- **Why an interactive wizard instead of a config-file-only flow?** Target
  users are non-technical streamers who shouldn't need to edit JSON or
  remember CLI flags. The wizard runs once on first launch, saves a config,
  then never runs again unless `--reconfigure` is passed. Implementation
  uses Node's built-in `readline` — no `inquirer` dependency, ~60 lines of
  code (§5.3).
- **Why ship a separate "Change Settings" .bat instead of just documenting
  the flag?** A non-technical streamer will not read documentation, will not
  remember a flag, and will not edit a JSON file. They will look for an
  icon to click. The second `.bat` is one line of code and turns "change
  your settings" into a discoverable, double-clickable action. The startup
  banner (§5.3) also prints the same hint every single launch as a backup
  for streamers who don't notice the second file.
- **Why print the "how to change settings" banner on every startup, not
  just first run?** The streamer might not need to change settings for
  months. By the time they do, they've forgotten where they learned about
  it. Printing the hint every launch is free (zero ongoing user cost; it's
  three lines of text they ignore) and guarantees the answer is on screen
  when they need it.
- **Why hard-code the queue name to `"queue"` in v1?** The active queue
  name isn't in the `writeFile` event payload. Adding a second socket
  subscription for backend state expands the scope. Hard-coding gets v1
  shipping; v2 lifts the limitation (§14.2).
- **Why a `MAX_TICKER_SLOTS` instead of deleting stale slot files?** OBS
  Text-from-file treats missing files as empty (fine) but Image sources
  break loudly. A fixed-max policy gives identical behavior across source
  types and never produces a directory-listing race during OBS reads.
