FROM node:23-alpine

RUN npm i -g pnpm

COPY src src
COPY branches branches
COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml

RUN pnpm i --frozen-lockfile --prod

RUN npm rm -g pnpm

EXPOSE 8080/tcp
ENTRYPOINT ["node", "src/index.js"]
STOPSIGNAL SIGKILL
