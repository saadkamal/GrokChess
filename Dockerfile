# GrokChess - Production Dockerfile
# Built by Saad Kamal with xAI's Grok 4.3

# Stage 1: Build
FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for build)
RUN npm ci

COPY . .

# Build the frontend (requires typescript and vite from devDependencies)
RUN npm run build

# Stage 2: Production
FROM node:20-slim

WORKDIR /app

COPY package*.json ./

# Install only production dependencies for the final image
RUN npm ci --omit=dev

# Copy built output from the build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js

EXPOSE 3000

CMD ["npm", "run", "start"]
