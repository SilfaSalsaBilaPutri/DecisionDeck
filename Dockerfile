# -------------------------------------------------------------
# Dockerfile – builds DecisionDeck with Node 22
# -------------------------------------------------------------
# 1️⃣  Use the official Node 22 LTS image (Alpine is small)
FROM node:22.12-alpine AS builder

# Set a working directory inside the container
WORKDIR /app

# Copy only the files needed for install & build.
# This avoids sending large caches to the image.
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY .npmrc ./
COPY src/ ./src/
COPY public/ ./public/
COPY drizzle/ ./drizzle/
COPY .gitignore ./

# Install **exact** versions from the lockfile.
# `npm ci` is deterministic and does not try to download
# packages that are already satisfied.
RUN npm ci

# ----------------------------------------------------------------
# 2️⃣  Build the production bundle
# ----------------------------------------------------------------
RUN npm run build   # resolves to `vite build`

# ----------------------------------------------------------------
# 3️⃣  Runtime stage – a tiny image that only serves the built files
# ----------------------------------------------------------------
FROM node:22.12-alpine AS runtime
WORKDIR /app

# Install a static file server (you can replace it with any server you prefer)
RUN npm i -g serve

# Copy the compiled assets from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the port that `serve` uses by default (3000)
EXPOSE 3000

# Start the static server
CMD ["serve", "-s", "dist", "-l", "3000"]

