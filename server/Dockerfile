FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# --- Production image ---
FROM node:22-alpine

WORKDIR /app

RUN addgroup -S kraken && adduser -S kraken -G kraken

COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ ./dist/

RUN mkdir -p /app/data /app/workspaces && chown -R kraken:kraken /app
USER kraken

EXPOSE 8080

CMD ["node", "dist/index.js"]
