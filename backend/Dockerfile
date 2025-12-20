FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY shared ./shared
COPY backend ./backend

# Install dependencies and build
RUN npm install
RUN npm run build -w shared
RUN npm run build -w backend

# Production image
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared

EXPOSE 8080
CMD ["node", "dist/index.js"]
