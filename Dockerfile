# syntax = docker/dockerfile:1
FROM node:18.20.8-slim AS base

LABEL fly_launch_runtime="Remix/Prisma"

WORKDIR /app
ENV NODE_ENV=production

# ---- Build stage ----
FROM base AS build

# Install build deps for native modules (Prisma needs OpenSSL)
RUN apt-get update -qq && \
    apt-get install -y build-essential openssl pkg-config python-is-python3

# Install all node_modules (including dev) for the build
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copy app source and build
COPY . .
RUN npm run build

# Prune dev dependencies for the runtime image
RUN npm prune --omit=dev

# ---- Final stage ----
FROM base

# OpenSSL needed at runtime for Prisma
RUN apt-get update -qq && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

COPY --from=build /app /app

EXPOSE 3000
CMD ["npm", "run", "start"]
