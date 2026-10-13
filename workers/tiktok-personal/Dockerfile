FROM node:22-bookworm-slim

WORKDIR /worker
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npx playwright install --with-deps chromium \
  && npm cache clean --force

COPY src ./src
RUN mkdir -p /data/profiles /data/ledgers \
  && chown -R node:node /worker /data

USER node
ENV NODE_ENV=production
CMD ["node", "src/worker.mjs"]
