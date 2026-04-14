FROM oven/bun:latest

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY src/ ./src/

RUN bun install --production

ENV NODE_ENV=production

# Default command can be overridden
CMD ["bun", "run", "src/index.ts", "core", "up"]
