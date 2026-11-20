# ---- dependencias ----
# Imagen completa (no slim): ya incluye OpenSSL, que necesita el motor de Prisma.
FROM node:22-bookworm AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

# ---- build ----
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime ----
FROM node:22-bookworm AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src/domain ./src/domain
COPY --from=build /app/next.config.ts ./
EXPOSE 3000
# Aplica migraciones, siembra usuarios de prueba/presupuesto (idempotente) y arranca.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm run start"]
