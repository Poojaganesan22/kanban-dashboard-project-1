FROM node:22 AS build-stage
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim AS runtime-stage
WORKDIR /app

RUN addgroup --system appgroup \
    && adduser --system --ingroup appgroup --no-create-home appuser \
    && npm install --global serve

COPY --from=build-stage --chown=appuser:appgroup /app/dist ./dist

EXPOSE 3000

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["serve", "-s", "dist", "-l", "3000"]

