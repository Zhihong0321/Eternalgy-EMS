#############################################
# Multi-stage Dockerfile for EMS Backend
# Builds the frontend and copies dist into backend/public.
#
# IMPORTANT: This Dockerfile assumes the Docker build CONTEXT is the REPO ROOT
# so it can access both `frontend/` and `backend/` directories.
# In Railway, if you switch the backend service to DOCKERFILE builder, set
# the service Root Directory to the repo root and point to backend/Dockerfile.
#############################################

# Stage 1: Build Frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
# Copy only package files first for better caching
COPY frontend/package*.json ./
RUN npm ci
# Copy source and build
COPY frontend .
RUN npm run build

# Stage 2: Backend runtime
FROM node:18-alpine
WORKDIR /app/backend

# Copy backend package files and install production deps
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY backend .

# Copy built frontend assets into backend/public
COPY --from=frontend-builder /app/frontend/dist ./public

# Expose port (Railway will inject PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["npm", "start"]
