#!/bin/sh
# 1. Signatures: one update now (the first takes a few minutes), then freshclam keeps them current in the background.
# 2. clamd in the background on 127.0.0.1:3310. 3. The scan service once clamd answers.
set -e
# /run can be an empty tmpfs at start (Cloudflare Containers): clamd and freshclam keep their pid and socket files here.
mkdir -p /run/clamav && chown clamav:clamav /run/clamav
freshclam --stdout || echo "freshclam: first update failed; retrying in the background"
freshclam -d --stdout
clamd
for i in $(seq 1 120); do
  if printf 'zPING\0' | nc -w 2 127.0.0.1 3310 2>/dev/null | grep -q PONG; then break; fi
  sleep 2
done
exec node /app/server.mjs
