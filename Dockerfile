FROM node:24-alpine AS builder

# Install dependencies for node-media-server
RUN apk add --no-cache python3 make g++ ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Final stage
FROM node:24-alpine

# Install runtime dependencies
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

# Create directories
RUN mkdir -p ssl temp

# Expose ports
EXPOSE 3000 3443 1935 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/stream/status', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start application
CMD ["node", "server.js"]
