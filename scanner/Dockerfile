# FloorTest virus scanner: ClamAV (clamd + freshclam for daily signatures) and a tiny Node service, on Alpine.
FROM alpine:3.20

RUN apk add --no-cache clamav clamav-daemon freshclam nodejs npm \
 && mkdir -p /run/clamav /var/lib/clamav \
 && chown -R clamav:clamav /run/clamav /var/lib/clamav
WORKDIR /app
# Signatures baked in, so a restart loads them from disk instead of downloading ~200 MB first (freshclam keeps them
# current after that). If the mirror refuses the build, start.sh fetches them at start-up as before.
RUN freshclam --stdout || echo "freshclam at build failed; start.sh will fetch"
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs clamd.mjs start.sh ./
COPY clamd-extra.conf /etc/clamav/clamd-extra.conf
RUN cat /etc/clamav/clamd-extra.conf >> /etc/clamav/clamd.conf && chmod +x /app/start.sh

EXPOSE 8080
CMD ["/app/start.sh"]
