# using two containers means we don't have to upload a docker layer containing pnpm, so it should be smaller.
FROM node:23-alpine AS pnpm-container

RUN npm i -g pnpm

COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml

RUN pnpm i --frozen-lockfile --prod

FROM node:23-alpine

COPY src src
COPY branches branches
COPY package.json package.json

COPY --from=pnpm-container node_modules node_modules

EXPOSE 8080/tcp
ENTRYPOINT ["node", "src/index.js"]
STOPSIGNAL SIGKILL
