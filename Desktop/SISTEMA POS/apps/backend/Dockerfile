FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN npm install --workspaces --include-workspace-root
RUN npm run prisma:generate -w apps/backend
RUN npm run build -w apps/backend

FROM node:20-slim
WORKDIR /app
COPY --from=build /app .
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/backend/dist/server.js"]
