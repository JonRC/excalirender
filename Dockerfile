# Multi-stage build for excalirender
# Stage 1: Build the binary with all native dependencies
FROM oven/bun:alpine AS builder

# Install canvas native dependencies (python3/make/g++/pkgconfig needed for node-canvas compilation on musl)
RUN apk add --no-cache \
    python3 make g++ pkgconfig \
    cairo-dev pango-dev libjpeg-turbo-dev giflib-dev librsvg-dev

WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build the binary
RUN bun run build

# Stage 2: Runtime image with native libraries
FROM alpine:3.20

# Install runtime dependencies for canvas
RUN apk add --no-cache \
    cairo pango libjpeg-turbo giflib librsvg pixman

# Copy the compiled binary
COPY --from=builder /app/excalirender /excalirender

# Make binary executable
RUN chmod +x /excalirender

ENTRYPOINT ["/excalirender"]
