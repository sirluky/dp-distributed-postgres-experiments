# Server Dockerfile - Elysia API on Bun
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS install
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Production stage - run TypeScript directly with Bun
FROM base AS release
COPY --from=install /app/node_modules node_modules
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Bun can run TypeScript directly
CMD ["bun", "run", "src/index.ts"]
