# syntax=docker/dockerfile:1

# ======================
# Build stage: Bot
# ======================
FROM node:20-bookworm-slim AS bot-builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
COPY config ./config
COPY shared ./shared
RUN npm run build:bot

# ======================
# Build stage: Web
# ======================
FROM node:20-bookworm-slim AS web-builder

WORKDIR /app/web

# Install dependencies
COPY web/package*.json ./
RUN npm ci

# Copy source and build
COPY web/ ./
COPY shared /app/shared
RUN npm run build

# ======================
# Production stage
# ======================
FROM node:20-bookworm-slim AS production

# Install tini and build tools (needed for better-sqlite3)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    tini \
    build-essential python3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user
RUN groupadd -g 1001 mate && \
    useradd -u 1001 -g mate -m mate

# Copy and install production dependencies (needs build-essential for better-sqlite3)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Install web dependencies
COPY web/package*.json ./web/
RUN cd web && npm ci --only=production && npm cache clean --force

# Clean up build dependencies to reduce image size
RUN apt-get update && \
    apt-get remove -y build-essential && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Copy built bot application
COPY --from=bot-builder /app/dist ./dist
COPY --from=bot-builder /app/config ./config
COPY --from=bot-builder /app/shared ./shared

# Copy built web application (standalone output)
COPY --from=web-builder /app/web/.next/standalone ./web
COPY --from=web-builder /app/web/.next/static ./web/.next/static
COPY --from=web-builder /app/web/public ./web/public

# Create data directory and startup script
RUN mkdir -p /app/data && \
    echo '#!/bin/sh' > /app/start.sh && \
    echo 'cd /app && node dist/index.js &' >> /app/start.sh && \
    echo 'cd /app/web && DATA_DIR=/app/data node server.js' >> /app/start.sh && \
    chmod +x /app/start.sh && \
    chown -R mate:mate /app

# Switch to non-root user
USER mate

# Environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=1024"
ENV HOME=/home/mate
ENV DATA_DIR=/app/data
ENV PORT=3000

# Expose web port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/config', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Use tini as init
ENTRYPOINT ["/usr/bin/tini", "--"]

# Start both applications
CMD ["/app/start.sh"]
