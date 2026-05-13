# OBS Bridge

A small helper that takes Gjallarhorn's output and writes it into the same
folder layout Tournament Stream Helper (TSH) uses — so your existing OBS scene
keeps working without any changes.

It also writes every other Gjallarhorn field (ticker, lower-thirds, champion
banner, full Top-32 bracket, deep player stats, etc.) into a `gjallarhorn/`
sub-folder, so you can wire any of those into OBS too.

---

## What you need

- Gjallarhorn installed and running.
- An OBS scene that already works with TSH (or a clean folder you want to
  point OBS at).
- Node.js 18 or newer.

---

## Quick start (if you currently use TSH)

1. **Close Tournament Stream Helper.** TSH and the bridge write to the same
   files; only one can be the writer.
2. **Start Gjallarhorn** like you normally do.
3. **Double-click `Start OBS Bridge.bat`**.
4. On first run only, it asks you two questions:

   > **Where is your Tournament Stream Helper folder?** > _(paste the path; leave blank if you don't use TSH)_

   Paste the folder that contains `TournamentStreamHelper.exe` (the bridge
   will figure out the `out/` part itself). You can paste either the TSH
   root folder or the `out/` folder directly — both work.

   > **Is Gjallarhorn running on this same computer? [Y/n]**

   Just press Enter for the normal case.

5. The bridge remembers your answers. It will never ask again.
6. A window appears showing:

   ```
   obs-bridge — using saved settings:
     OBS folder    D:/TournamentStreamHelper-5.81/out  (TSH mode)
     Gjallarhorn   localhost:3000

   To change these: double-click "Change OBS Bridge Settings.bat",
   or edit obs-bridge.config.json, or delete it to start over.

   Listening for updates from Gjallarhorn — press Ctrl+C to stop.
   ```

7. **Leave that window open for the whole stream.** OBS reads the files the
   bridge writes — no changes needed in OBS.

---

## Quick start (fresh setup, no TSH)

Same as above, but at question 1 leave the answer blank and press Enter. The
bridge will then ask:

> **Where should OBS files be written?** _(default: ./obs-out)_

Pick any folder you like — say `C:/obs-data`. The bridge writes every
Gjallarhorn field there. Point your OBS Text/Image sources at that folder.

The file layout is documented in [LAYOUT.md](./LAYOUT.md) (auto-generated
during setup).

---

## Changing your settings later

You have three options — pick whichever you prefer:

- **Double-click `Change OBS Bridge Settings.bat`.** Re-runs the same
  two-question wizard. This is the easiest.
- **Edit `obs-bridge.config.json` in Notepad.** It's a tiny file with the
  paths and host/port. Save the file and restart the bridge.
- **Delete `obs-bridge.config.json` entirely.** The bridge will run the
  wizard from scratch the next time you start it.

The reminder banner at startup tells you these options every single time, so
you don't need to remember.

---

## "It's not working"

### Nothing changes in OBS when I click Push in Gjallarhorn

- Is the bridge window still open and showing "Listening for updates"?
- Is Gjallarhorn actually running, and listening on the host/port the bridge
  is connecting to?
- Look at the bridge window: it should print a line every time Gjallarhorn
  pushes data. If you see `disconnected` or `connection error`, the bridge
  can't reach Gjallarhorn. Restart Gjallarhorn first, then the bridge.

### Player images / country flags are missing

The bridge downloads images the first time it sees them. Watch the bridge
window for `WARN` lines mentioning the URL — if it can't reach the image
server (e.g. no internet on the streaming PC), it falls back to whatever
image was there before. To start fresh, close the bridge, delete the
`.obs-bridge-cache` folder inside your OBS folder, then start the bridge
again.

### I moved my TSH folder and now nothing works

Double-click **`Change OBS Bridge Settings.bat`** and paste the new path.

### The window closed instantly when I double-clicked the .bat

Open `obs-bridge.config.json` in Notepad and check the `out` path. If TSH
was uninstalled or the folder was deleted, the saved path is no longer
valid. Delete the config file and start over.

### I'm getting a `Cannot find module socket.io-client` error

Run `npm install` in the gjallarhorn project root, then try again.

---

## Mac and Linux

Use `Start OBS Bridge.command` and `Change OBS Bridge Settings.command`
instead of the `.bat` files. You may need to right-click → Open the first
time (Gatekeeper on macOS) or `chmod +x` them on Linux.

Everything else works the same.

---

## For people who like the terminal

```
obs-bridge [options]

  -o, --out <path>          OBS output directory (or your TSH root folder)
  -e, --extras-prefix <s>   Subdirectory for Gjallarhorn-only fields
                            (default "gjallarhorn"; "" = root)
  -H, --host <host>         Gjallarhorn host (default localhost)
  -p, --port <number>       Gjallarhorn port (default 3000)
  --tsh                     Force TSH-mode mapping (skip auto-detect)
  --no-tsh                  Force native-mode mapping
  --no-aggregate            Don't write gjallarhorn-state.json
  --reconfigure             Ignore saved config; re-run the wizard
  --log-level <level>       trace|debug|info|warn|error (default info)
  -V, --version
  -h, --help
```

Settings are loaded in this order: command-line flags → env vars
(`OBS_BRIDGE_OUT`, `OBS_BRIDGE_HOST`, `OBS_BRIDGE_PORT`,
`OBS_BRIDGE_EXTRAS_PREFIX`) → `obs-bridge.config.json` in the current
directory → wizard prompts for anything still missing.

---

## What the bridge does NOT do

- It does not modify Gjallarhorn. The fork's core code is untouched.
- It does not send data anywhere over the internet (except downloading the
  image assets Gjallarhorn references — same images TSH itself downloads).
- It does not read or change your OBS scene.
- It does not run as a service or background process. When you close the
  window, it stops.

---

## For developers

The internal design doc lives in [DESIGN.md](./DESIGN.md). Mapping tables,
architecture, future-work list, and the decision log are all there.
