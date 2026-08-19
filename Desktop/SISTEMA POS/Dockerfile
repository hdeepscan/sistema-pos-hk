FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY packages/shared/package*.json ./packages/shared/
RUN npm install
COPY . .
RUN npm run build
EXPOSE 4000
CMD ["npm", "run", "backend:dev"]
