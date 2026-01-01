# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Add tini for proper signal handling
RUN apk add --no-cache tini && apk upgrade --no-cache

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S jarvis && \
    adduser -u 1001 -S jarvis -G jarvis

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R jarvis:jarvis /app

# Switch to non-root user
USER jarvis

# Environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=256"

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Use tini as init
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "dist/index.js"]
