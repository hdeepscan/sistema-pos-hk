FROM node:20

WORKDIR /app

# Install PostgreSQL client tools (pg_dump, psql) for backup/restore functionality
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies
RUN npm install

# Copy application source code
COPY . .

# Generate Prisma client BEFORE building (required for TypeScript compilation)
RUN npm run prisma:generate -w apps/backend

# Build TypeScript - fail if errors occur
RUN npm run build

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run migrations and start the backend server
CMD sh -c "npm run migrate:deploy -w apps/backend && node apps/backend/dist/server.js"
