FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
WORKDIR /app/apps/backend
RUN npm run build
WORKDIR /app
EXPOSE 4000
CMD ["npm", "run", "backend:dev"]
