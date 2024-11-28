FROM node:23-alpine

RUN apk add --no-cache curl

RUN npm i -g pnpm asar

COPY src src
COPY branches branches
COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml

RUN pnpm i --frozen-lockfile --prod

COPY branchSetups branchSetups

RUN <<EOF
cd branchSetups
for f in *.sh; do
	./$f
done
cd ..
EOF

RUN npm rm -g pnpm asar
RUN apk del curl

EXPOSE 8080/tcp
ENTRYPOINT ["node", "src/index.js"]
STOPSIGNAL SIGKILL
