FROM node:24.22.2-alpine AS dependencies
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN npm install -g pnpm@10.15.1 && pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build:standalone

FROM node:24.22.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_PUBLIC_BUILD_MODE=standalone \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    MCP_TASK_STORAGE_FILE=/app/data/tasks.json \
    MCP_RESEARCH_DOCUMENT_STORAGE_DIR=/app/data/documents

RUN apk add --no-cache libc6-compat && install -d -m 0700 -o node -g node /app/data
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
