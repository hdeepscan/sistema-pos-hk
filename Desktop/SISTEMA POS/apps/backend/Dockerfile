FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN npm install --workspaces --include-workspace-root
RUN npm run prisma:generate -w apps/backend
RUN npm run build -w apps/backend

FROM node:20-slim
# postgresql-client: da pg_dump/psql, usados por el modulo de copias de
# seguridad (/backup/generar y /backup/restaurar).
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/backend/dist/server.js"]
