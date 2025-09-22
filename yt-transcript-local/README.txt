Plain YouTube Transcript — Local Backend
========================================

What this is
------------
A tiny local API that fetches YouTube captions and a super simple UI that calls it.
The UI always talks to http://127.0.0.1:17653 on your own machine. No API keys.
I've also hosted the page here and added a simple URL redirect that's easy to remember at http://yt.promptinject.me (http only).
   - Example usage: http://yt.promptinject.me?=https://www.youtube.com/watch?v=dQw4w9WgXcQ

Files
-----
- main.py                FastAPI server exposing /api/transcript and /api/ping
- requirements.txt       Python deps
- start_server.bat       Windows helper to create a venv, install deps, and run the server
- ui/index.html          Front-end that queries your local server (works from file:// or any host)

Quickstart (Windows)
--------------------
1) Unzip this folder somewhere.
2) Double-click start_server.bat
   - First run will install Python packages.
   - Server starts at: http://127.0.0.1:17653
3) Open index.html in your browser OR use my hosted GitHub Pages UI that points to http://127.0.0.1:17653.
4) Paste a YouTube URL or open with a query param, for example:
   file:///.../ui/index.html?=https://youtu.be/VIDEOID
   or
   https://helix4u.github.io/yt-transcript-local/?https://www.youtube.com/watch?v=dQw4w9WgXcQ

Notes
-----
- The UI accepts both ?=https://... and ?url=https://...
- If the page says the local API is not reachable, ensure the server window is running.
- Some videos do not have captions (manual or auto) — you will get a clear error in that case.
- Language preference can be edited in the UI (default: en,en-US,en-GB).
- 
