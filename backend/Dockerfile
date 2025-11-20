# Multi-stage Dockerfile for zkDataVault Backend

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Install only production deps
COPY package.json package-lock.json* ./
RUN npm ci --only=production --no-audit --no-fund

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy env example for reference (do not rely on it)
COPY env.example ./

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', r => { if (r.statusCode !== 200) process.exit(1) }).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
























