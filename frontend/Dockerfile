# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies required for the build)
RUN npm ci --legacy-peer-deps --include=dev

# Copy source code
COPY . .

# Set production environment variables
ENV VITE_API_URL=https://eternalgy-ems-production.up.railway.app
ENV VITE_WS_URL=wss://eternalgy-ems-production.up.railway.app

# Build application
RUN npm run build

# Stage 2: Production
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
