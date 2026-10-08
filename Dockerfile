# syntax=docker/dockerfile:1

# Robbie: the API, the live meetings and the web app in one image (docs/deploy.md).
# Build from the repository root: docker build -t robbie:local .

FROM node:24-slim AS build
# Prisma's schema engine reads OpenSSL's version
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend-node/package.json backend-node/
COPY frontend-unified/package.json frontend-unified/
COPY mobile/package.json mobile/
# The three shipped workspaces and the root's build tools (TypeScript, Vite, React): never Expo
RUN npm ci -w shared -w backend-node -w frontend-unified --include-workspace-root
COPY shared shared
COPY backend-node backend-node
COPY frontend-unified frontend-unified
RUN npm run build:shared \
  && npm run build -w backend-node \
  && npm run build -w frontend-unified

FROM node:24-slim
# Links the published package to its repository on GitHub
LABEL org.opencontainers.image.source=https://github.com/eudaimonstro/Robbie
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Production only: the JSON logger (pino-pretty is a development package), Secure cookies, and
# the start-up check's refusals
ENV NODE_ENV=production \
  PORT=3001 \
  UPLOAD_DIR=/data/uploads \
  PRESERVE_DIR=/data/preserved \
  CHECKPOINT_DISABLE=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend-node/package.json backend-node/
COPY frontend-unified/package.json frontend-unified/
COPY mobile/package.json mobile/
RUN npm ci --omit=dev -w shared -w backend-node --include-workspace-root=false \
  && npm cache clean --force
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/backend-node/dist backend-node/dist
COPY --from=build /app/frontend-unified/dist frontend-unified/dist
COPY backend-node/prisma backend-node/prisma
COPY backend-node/prisma.config.ts backend-node/
COPY --chmod=755 deploy/app-start.sh /usr/local/bin/app-start
# Named volumes mounted here start with this owner and mode, so the server can write uploads and
# handleReport.js can preserve reported files (readable by node alone)
RUN mkdir -p /data/uploads /data/preserved \
  && chown node:node /data/uploads /data/preserved \
  && chmod 700 /data/preserved
USER node
WORKDIR /app/backend-node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["app-start"]
