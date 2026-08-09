# ============================================
# Ecclesia Church Management System - Backend Dockerfile
# Multi-stage build for optimized production image
# ============================================

# --- Stage 1: Builder Stage ---
# Use Node.js 20 Alpine as base image for building dependencies
FROM node:20-alpine AS builder

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) for dependency installation
# This leverages Docker layer caching - dependencies only reinstall when lockfile changes
COPY package.json package-lock.json* ./

# Copy Prisma schema and migrations for database setup during build
COPY prisma ./prisma/

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Generate Prisma Client based on the schema
# This creates the Prisma client code needed to interact with the database
RUN npx prisma generate

# Push database schema to SQLite database
# This creates/migrates the database structure
RUN npx prisma db push

# Copy all application source code to the container
COPY . .

# Build the application for production
# Compiles TypeScript and bundles the application
RUN npm run build

# Remove devDependencies to reduce image size
RUN npm prune --production


# --- Stage 2: Production Stage ---
# Use a fresh Node.js 20 Alpine image (no build artifacts or dev dependencies)
FROM node:20-alpine AS production

# Set working directory for production
WORKDIR /app

# Create a non-root user for security
# Running as non-root prevents potential privilege escalation attacks
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Copy package.json and production dependencies from builder stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules/

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist/

# Copy Prisma schema and generated client
COPY --from=builder /app/prisma ./prisma/

# Copy Prisma migrations if they exist (optional, for reference)
COPY --from=builder /app/prisma/migrations ./prisma/migrations/

# Copy seed file if it exists (optional, for reference)
COPY --from=builder /app/prisma/seed.js ./prisma/seed.js

# Copy the entrypoint script (if needed) or use default command
# The entrypoint script handles database migrations on container start

# Set proper permissions for the application directory
RUN chown -R appuser:appgroup /app

# Switch to the non-root user
USER appuser

# Expose port 5000 (the backend server port)
EXPOSE 5000

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=5000

# Health check to verify the container is running correctly
# Checks if the server responds on port 5000 every 30 seconds
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Start the application
# Uses the built JavaScript files from the dist directory
CMD ["node", "dist/index.js"]
