FROM node:22 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
# The frontend imports shared zod contracts via @contracts/* → ../backend/src/contracts.
# Copy them in, and link node_modules so their `import "zod"` resolves to the frontend's copy.
COPY backend/src/contracts /app/backend/src/contracts
RUN ln -s /app/frontend/node_modules /app/backend/node_modules
RUN npm run build

FROM node:22 AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
RUN npx prisma generate
RUN npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/prisma ./prisma
COPY --from=frontend-build /app/frontend/dist/frontend/browser ./public
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js || (echo 'STARTUP FAILED - check DATABASE_URL and other env vars' && exit 1)"]
