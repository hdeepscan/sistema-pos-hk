FROM node:20

WORKDIR /app

# Install PostgreSQL client tools (pg_dump, psql) for backup/restore functionality
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package*.json ./
COPY ["Desktop/SISTEMA POS/package*.json", "./"]
COPY ["Desktop/SISTEMA POS/apps/backend/package*.json", "./apps/backend/"]
COPY ["Desktop/SISTEMA POS/apps/desktop/package*.json", "./apps/desktop/"]
COPY ["Desktop/SISTEMA POS/packages/shared/package*.json", "./packages/shared/"]

# Install ALL dependencies (including devDependencies needed for build)
RUN npm install --include=dev

# Copy application source code
COPY ["Desktop/SISTEMA POS/apps", "./apps"]
COPY ["Desktop/SISTEMA POS/packages", "./packages"]

# Generate Prisma client BEFORE building (required for TypeScript compilation)
# Remove cached Prisma types to ensure clean generation
RUN rm -rf /app/node_modules/.prisma /app/apps/backend/node_modules/.prisma
WORKDIR /app/apps/backend
RUN npx prisma generate
WORKDIR /app

# Build TypeScript backend
RUN npm run build

# Build web frontend (compiles directly to backend/dist/public)
RUN npm run build:web -w apps/desktop

# Verify frontend was built
RUN ls -la apps/backend/dist/public/index.html || echo "WARNING: index.html not found!"

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the backend server
CMD ["node", "apps/backend/dist/server.js"]
