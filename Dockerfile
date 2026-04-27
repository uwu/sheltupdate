# using two containers means we don't have to upload a docker layer containing pnpm, so it should be smaller.

# using node 18 here for arm/v7 compat (https://github.com/nodejs/docker-node/issues/1798)
FROM node:18-alpine AS pnpm-container

RUN npm i -g pnpm

COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml

RUN pnpm i --frozen-lockfile --prod

FROM node:23-alpine AS cloudflared
RUN apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/testing cloudflared

FROM node:23-alpine

COPY --from=cloudflared /usr/bin/cloudflared /usr/bin/cloudflared

COPY src src
COPY branches branches
COPY package.json package.json
COPY CHANGELOG.md CHANGELOG.md

COPY --from=pnpm-container node_modules node_modules

ARG SHELTUPDATE_RELEASE=false
ENV SHELTUPDATE_RELEASE=${SHELTUPDATE_RELEASE}

EXPOSE 8080/tcp
ENTRYPOINT ["node", "src/index.js"]
STOPSIGNAL SIGKILL
