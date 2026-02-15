FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git docker.io \
  && rm -rf /var/lib/apt/lists/* \
  && npm install

COPY tsconfig.json ./
COPY src ./src

CMD ["npm", "run", "worker"]
