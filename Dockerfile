# syntax=docker/dockerfile:1
# Production image for Plan4JU. Targets:
#   runner  (default) - the app, runs as an unprivileged user
#   migrate           - Prisma CLI + admin scripts, used for `prisma migrate deploy` and admin:create-family

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The build imports modules that read env at load time; throwaway values, not part of the image.
RUN BETTER_AUTH_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
    BETTER_AUTH_URL=http://localhost:3000 \
    DATABASE_URL=postgresql://build@localhost:5432/build \
    DATABASE_ADMIN_URL=postgresql://build@localhost:5432/build \
    sh -c 'npx prisma generate && npm run build'

# Migrations and administration: needs the dev dependencies (prisma, tsx), runs as non-root as well.
FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/anmelden').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
