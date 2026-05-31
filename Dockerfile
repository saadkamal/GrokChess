# GrokChess - Production Dockerfile
# Built by Saad Kamal with xAI's Grok 4.3

FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source and built files
COPY . .

# Build the frontend
RUN npm run build

# Expose port
EXPOSE 3000

# Start the production server
CMD ["npm", "run", "start"]
