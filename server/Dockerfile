FROM node:22-alpine AS web-builder

WORKDIR /web

COPY web/package.json web/package-lock.json* ./
RUN npm ci

COPY web/ ./
RUN npm run build

# --- Server build ---
FROM node:22-alpine AS builder

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src/ ./src/

RUN npm run build

# --- Production image ---
FROM node:22-alpine

WORKDIR /app

RUN addgroup -S kraken && adduser -S kraken -G kraken \
    && apk add --no-cache su-exec

COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ ./dist/
COPY --from=web-builder /web/dist/ ./public/
COPY server/entrypoint.sh /app/entrypoint.sh

RUN mkdir -p /app/data /app/workspaces && chown -R kraken:kraken /app \
    && chmod +x /app/entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js"]
