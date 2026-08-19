FROM node:20
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies
RUN npm install

# Copy application source code
COPY . .

# Build TypeScript (ignore errors and generate JS anyway)
RUN npm run build || true

# Install Prisma client and generate types
RUN npm run prisma:generate -w apps/backend || true

EXPOSE 4000

# Use node directly to run the compiled backend
CMD ["node", "apps/backend/dist/server.js"]
