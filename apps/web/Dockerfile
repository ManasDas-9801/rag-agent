# syntax=docker/dockerfile:1
FROM node:20-bookworm
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/

RUN if [ -f package-lock.json ]; then npm ci -w @rag/web; else npm install -w @rag/web; fi

COPY apps/web apps/web

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build -w @rag/web

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
