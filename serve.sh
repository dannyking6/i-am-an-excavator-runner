#!/bin/sh
# Serve the game over HTTP (a local server is required; file:// will not work).
PORT="${PORT:-8080}"
exec python3 -m http.server "$PORT" --bind 0.0.0.0
