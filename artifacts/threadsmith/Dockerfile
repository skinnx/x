# Threadsmith in one container. Build from the repository root (the pnpm lockfile lives there):
#   docker build -f artifacts/threadsmith/Dockerfile -t threadsmith .
# or use artifacts/threadsmith/docker-compose.yml. Data (SQLite, images, secret.key, config) lives in /data.

FROM node:24-slim AS build
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY . .
RUN pnpm install --filter threadsmith --frozen-lockfile \
 && pnpm --filter threadsmith run build \
 && pnpm --filter threadsmith deploy --legacy --prod /app \
 && cp -r artifacts/threadsmith/dist /app/dist

FROM node:24-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data CONFIG_PATH=/data/threadsmith.config.json
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health',{headers:{authorization:'Bearer '+(process.env.AUTH_TOKEN||'')}}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "--import", "tsx", "server/index.ts"]
