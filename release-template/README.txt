Gjallarhorn - Quick start
=========================

1. Double-click setup.bat
   - Paste your start.gg API key when prompted.
     Get a key at https://developer.start.gg/docs/authentication
   - Paste your challengermode refresh key if you have one.
     Leave blank if you don't use challengermode.
   - You need at least one of the two keys.

2. Double-click start.bat
   - Your browser will open the dashboard automatically.
   - Keep the black console window open while you use Gjallarhorn.
   - Close the console window to stop the server.

You only need to run setup.bat the first time
(or any time you want to change your API keys).

Output JSON files land in the output\ folder next to this README.

Troubleshooting
---------------
- If the browser doesn't open, manually visit http://localhost:3000
- To change your API keys, run setup.bat again - it will overwrite .env.
- If start.bat closes immediately, run it from a terminal to see the error:
    1. Hold Shift + right-click in this folder
    2. Choose "Open PowerShell window here"
    3. Type:  .\start.bat
