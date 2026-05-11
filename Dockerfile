# syntax=docker/dockerfile:1.7
# Chatfy — Next.js 15 + Prisma, optimized for Railway
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ---- deps
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ---- builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Standalone Next output (server.js + bundled node_modules including @prisma/client and bcryptjs)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
# Copy source files needed by the worker process (tsx runs them directly).
# Next standalone doesn't bundle these because the worker isn't part of the HTTP server.
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Install tsx GLOBALLY so it's always on PATH (npm-run-script PATH munging is
# flaky with Next.js standalone's node_modules layout). Also install prisma CLI
# locally for db push + its transitive deps (effect, etc).
RUN npm install -g --no-audit --no-fund tsx@^4.19.2 \
    && npm install --omit=dev --no-audit --no-fund prisma@^6.19.3 \
    && chown -R nextjs:nodejs node_modules

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Push schema to DB, seed admin, then start. Railway/host injects DATABASE_URL.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss && node prisma/seed.js && node server.js"]
