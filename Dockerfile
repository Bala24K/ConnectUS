# Stage 1: Build TypeScript Artifacts
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src
COPY public/ ./public

RUN npm run build

# Stage 2: Production Minimal Runtime
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/database/schema.sql ./dist/database/schema.sql
COPY public/ ./public

USER node

EXPOSE 3000

CMD ["node", "dist/server.js"]
