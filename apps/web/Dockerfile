# ── Stage 1: Build ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /workspace

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
COPY nx.json tsconfig.base.json ./
COPY tailwind.config.js postcss.config.js ./

# Install ALL dependencies (need devDeps for building)
ENV NX_DAEMON=false
RUN npm ci

# Copy source
COPY apps/web/ apps/web/
COPY libs/ libs/

# Build the Angular app in production mode
RUN npx nx build web --configuration=production

# ── Stage 2: Serve ────────────────────────────────────────────
FROM nginx:alpine
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built Angular app from builder stage
COPY --from=builder /workspace/dist/apps/web/browser /usr/share/nginx/html

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
