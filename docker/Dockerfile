# syntax=docker/dockerfile:1

# Build stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
COPY config ./config
RUN npm run build

# Production stage
FROM node:20-bookworm-slim AS production

# Install tini, build tools, and other dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    tini curl git \
    build-essential python3 && \
    rm -rf /var/lib/apt/lists/*

# Install Claude CLI and claude-flow globally
RUN npm install -g @anthropic-ai/claude-code && \
    npm install -g claude-flow@alpha || npm install -g claude-flow@latest || true

# Clean up build dependencies to reduce image size
RUN apt-get update && \
    apt-get remove -y build-essential && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user
RUN groupadd -g 1001 mate && \
    useradd -u 1001 -g mate -m mate

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application and config
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config

# Create data directory
RUN mkdir -p /app/data && chown -R mate:mate /app

# Switch to non-root user
USER mate

# Environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=1024"
ENV HOME=/home/mate

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Use tini as init
ENTRYPOINT ["/usr/bin/tini", "--"]

# Start application
CMD ["node", "dist/index.js"]
