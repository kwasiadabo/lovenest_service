# syntax=docker/dockerfile:1

# ---- deps: install with dev toolchain (bcrypt needs it to build on musl/alpine) ----
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime: lean image, no compiler toolchain ----
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
