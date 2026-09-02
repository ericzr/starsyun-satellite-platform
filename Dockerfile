FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:production

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

RUN addgroup -S starsyun && adduser -S -G starsyun starsyun
WORKDIR /app
COPY --from=build --chown=starsyun:starsyun /app/dist ./dist
COPY --from=build --chown=starsyun:starsyun /app/dist-server ./dist-server

USER starsyun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "dist-server/server.js"]
