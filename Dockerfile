# Optional VPS fallback. Cloudflare is the primary production target.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:node
FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 CACHE_DIR=/app/cache
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p /app/cache && chown node:node /app/cache
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server-node/index.js"]
