# GrokChess - Multi-stage Production Dockerfile
# Built by Saad Kamal with xAI's Grok 4.3

# ============================================
# Stage 1: Builder (needs devDependencies)
# ============================================
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install ALL dependencies (including devDeps for build)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the frontend (TypeScript + Vite)
RUN npm run build


# ============================================
# Stage 2: Production (smaller final image)
# ============================================
FROM node:20-slim AS production

WORKDIR /app

# Copy only package files for production install
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy the built frontend from the builder stage
COPY --from=builder /app/dist ./dist

# Copy the production server
COPY server.js ./

# Expose the port Railway will use
EXPOSE 3000

# Start the production server (sets required headers for Stockfish WASM)
CMD ["node", "server.js"]
