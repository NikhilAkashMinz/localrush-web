# LocalRush customer website.
# Three stages keep the final image small: tools used to build never ship.

# Stage 1: install dependencies exactly as recorded in package-lock.json.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: build the site.
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: the image that runs. It holds only the built server and its static files.
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The pipeline passes the commit ID here; /api/health reports it back.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# Run as the unprivileged "node" user (uid 1000) that the base image provides.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
