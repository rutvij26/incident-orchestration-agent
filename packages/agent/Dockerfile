FROM node:20-slim

WORKDIR /app

# Copy monorepo root manifests first for layer caching
COPY package.json package-lock.json* ./

# Copy workspace packages needed at install time (all members the root workspaces glob matches)
COPY packages/shared/package.json      ./packages/shared/package.json
COPY packages/agent/package.json       ./packages/agent/package.json
COPY apps/demo-services/package.json   ./apps/demo-services/package.json

# Install all workspace deps from the root (resolves @agentic/shared via workspaces)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git docker.io \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --workspace @agentic/agent --workspace @agentic/shared

# Copy source after install to maximise cache hits
COPY packages/shared/src      ./packages/shared/src
COPY packages/agent/tsconfig.json ./packages/agent/tsconfig.json
COPY packages/agent/src       ./packages/agent/src

WORKDIR /app/packages/agent

CMD ["npm", "run", "worker"]
