FROM node:22-slim AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json   ./packages/shared/package.json
COPY apps/dashboard/package.json    ./apps/dashboard/package.json
COPY apps/demo-services/package.json ./apps/demo-services/package.json
COPY packages/agent/package.json    ./packages/agent/package.json

RUN npm install --workspace @agentic/dashboard --workspace @agentic/shared

# ---- Builder ----
FROM node:22-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules          ./node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules

COPY packages/shared ./packages/shared
COPY apps/dashboard  ./apps/dashboard
COPY package.json    ./

WORKDIR /app/apps/dashboard

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runner ----
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# outputFileTracingRoot=../../ means standalone is rooted at the monorepo level,
# so server.js lives at apps/dashboard/server.js inside the standalone tree.
COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static     ./apps/dashboard/.next/static
COPY --from=builder /app/apps/dashboard/public           ./apps/dashboard/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/dashboard/server.js"]
