FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY shared ./shared
COPY frontend ./frontend

# Install dependencies and build
RUN npm install
RUN npm run build -w shared
RUN npm run build -w frontend

# Production image
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/frontend/dist ./dist
COPY --from=builder /app/frontend/package.json ./

RUN npm install serve

EXPOSE 3000
CMD ["npx", "serve", "dist", "-s", "-l", "tcp://0.0.0.0:3000"]
