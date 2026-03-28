# Pull Docker CLI binary without needing apt-get
FROM docker:27-cli AS docker-cli

FROM node:22

WORKDIR /app

# Copy docker CLI from official image (avoids apt-get network dependency)
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

# Copy monorepo root manifests first for layer caching
COPY package.json package-lock.json* ./

# Copy workspace packages needed at install time (all members the root workspaces glob matches)
COPY packages/shared/package.json      ./packages/shared/package.json
COPY packages/agent/package.json       ./packages/agent/package.json
COPY apps/demo-services/package.json   ./apps/demo-services/package.json

# Install all workspace deps from the root (resolves @agentic/shared via workspaces)
RUN npm install --workspace @agentic/agent --workspace @agentic/shared

# Copy source after install to maximise cache hits
COPY packages/shared/src      ./packages/shared/src
COPY packages/agent/tsconfig.json ./packages/agent/tsconfig.json
COPY packages/agent/src       ./packages/agent/src

WORKDIR /app/packages/agent

CMD ["npm", "run", "worker"]
