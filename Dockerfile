 # syntax=docker/dockerfile:1

  FROM node:20-alpine AS deps
  RUN apk add --no-cache python3 make g++
  WORKDIR /app
  COPY package.json package-lock.json ./

  # Install production deps, plus sequelize-cli for Dokploy one-off migrations.
  RUN npm ci --omit=dev && npm install sequelize-cli@6.6.2 --save=false

  FROM node:20-alpine
  RUN apk add --no-cache tini
  WORKDIR /app
  ENV NODE_ENV=production
  COPY --from=deps /app/node_modules ./node_modules
  COPY . .
  RUN mkdir -p uploads && chown -R node:node /app
  USER node
  EXPOSE 4000
  HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||4000)+'/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
  ENTRYPOINT ["tini", "--"]
  CMD ["node", "src/server.js"]
