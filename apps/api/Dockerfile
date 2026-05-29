# syntax=docker/dockerfile:1
FROM node:20-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/

RUN if [ -f package-lock.json ]; then npm ci -w @rag/api; else npm install -w @rag/api; fi

COPY apps/api apps/api
RUN npm run build -w @rag/api

WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
