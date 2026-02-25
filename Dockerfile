# Stage 1: Build with Bun
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock* ./

# Install all dependencies (including dev for build tooling)
RUN bun install

# Copy source and build assets
COPY src/ src/
COPY tsconfig.json ./
COPY skills/ skills/
COPY templates/ templates/
COPY scripts/ scripts/

# Build the CLI (bun build -> node-compatible output)
RUN bun run build:cli

# Stage 2: Production runtime with Node
FROM node:20-slim

WORKDIR /app

# Copy package.json for production dependency install
COPY --from=builder /app/package.json ./

# Install production dependencies only
RUN npm install --omit=dev && npm cache clean --force

# Copy built CLI output
COPY --from=builder /app/dist/ dist/

# Copy runtime assets (skills and templates are part of the package)
COPY --from=builder /app/skills/ skills/
COPY --from=builder /app/templates/ templates/

# Copy entrypoint
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Configure Engram data directory
ENV ENGRAM_HOME=/data
RUN mkdir -p /data

# Container stays running for docker exec -i access
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["tail", "-f", "/dev/null"]
