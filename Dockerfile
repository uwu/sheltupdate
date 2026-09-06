# using two containers means we don't have to upload a docker layer containing pnpm, so it should be smaller.
FROM node:23-alpine AS pnpm-container
WORKDIR /app

COPY package.json ./
RUN npm install -g --no-fund --no-update-notifier "$(node -p "require('./package.json').packageManager")" \
	&& npm cache clean --force

COPY pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile --prod

FROM alpine:3.22 AS cloudflared
RUN apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/testing cloudflared

FROM node:23-alpine
WORKDIR /app

COPY --from=cloudflared /usr/bin/cloudflared /usr/bin/cloudflared

COPY src ./src
COPY branches ./branches
COPY package.json ./package.json
COPY CHANGELOG.md ./CHANGELOG.md

COPY --from=pnpm-container /app/node_modules ./node_modules

ARG SHELTUPDATE_RELEASE=false
ENV SHELTUPDATE_RELEASE=${SHELTUPDATE_RELEASE}

EXPOSE 8080/tcp
ENTRYPOINT ["node", "src/index.js"]
STOPSIGNAL SIGKILL
