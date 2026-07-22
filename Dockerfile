# Dockerfile - Production version for Render Starter
# sharp ships prebuilt libvips (includes SVG rasterization); heic-convert is
# pure WASM. No ghostscript/graphicsmagick/poppler needed on this site.

FROM node:18-alpine

# Environment variables
# Heap capped at 320MB: sharp/libvips allocate native memory OUTSIDE the Node
# heap, and the whole container only gets 512MB on the Starter plan.
ENV NODE_OPTIONS="--max-old-space-size=320"
ENV HOME=/tmp
ENV TMPDIR=/tmp

# Fonts so SVGs containing text rasterize correctly
RUN apk add --no-cache fontconfig ttf-dejavu && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install exact locked production dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Build the production CSS
RUN npm run build:css

# Create directories
RUN mkdir -p uploads output public && \
    chmod 777 uploads output

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run with garbage collection enabled
CMD ["node", "--expose-gc", "server.js"]
