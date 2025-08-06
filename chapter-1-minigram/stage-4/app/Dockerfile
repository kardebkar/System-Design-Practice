# Multi-stage Dockerfile for optimized production builds
# Stage 4: Cache Layer and CDN Implementation

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies for production
RUN npm install --omit=dev && npm cache clean --force

# Production stage  
FROM node:18-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S minigram -u 1001

# Copy package files
COPY package*.json ./

# Copy production node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=minigram:nodejs . .

# Create necessary directories
RUN mkdir -p uploads && \
    chown -R minigram:nodejs uploads public

# Expose port
EXPOSE 3000

# Switch to non-root user
USER minigram

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set Node.js environment
ENV NODE_ENV=production

# Start the application
CMD ["node", "server.js"]