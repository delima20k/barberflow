# =============================================================
# Dockerfile — BarberFlow API
#
# Multi-stage build:
#   Stage 1 (deps):  instala apenas dependências de produção
#   Stage 2 (final): imagem mínima, usuário não-root
#
# A aplicação é 100% stateless — pronta para múltiplas réplicas.
# Secrets (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) são passados
# como variáveis de ambiente em runtime, nunca na imagem.
#
# Build:
#   docker build -t barberflow-api .
#
# Run local:
#   docker run -p 3001:3001 --env-file .env barberflow-api
#
# Múltiplas réplicas (Docker Compose / Kubernetes):
#   docker compose up --scale api=4
# =============================================================

# ── Stage 1: instalar dependências de produção ─────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copiar apenas manifests — camada de cache separada das fontes
COPY package.json package-lock.json ./

# --omit=dev: exclui jest, jimp e outras devDependencies
RUN npm ci --omit=dev --ignore-scripts


# ── Stage 2: imagem final mínima ──────────────────────────────
FROM node:22-alpine AS final

# Metadados OCI
LABEL org.opencontainers.image.title="barberflow-api"
LABEL org.opencontainers.image.source="https://github.com/delima20k/barberflow"

WORKDIR /app

# Variáveis de ambiente padrão (sem secrets — injetados em runtime)
ENV NODE_ENV=production \
    APP_ENV=production  \
    PORT=3001

# Apenas os arquivos necessários para o backend
COPY --from=deps /app/node_modules ./node_modules
COPY api.js        ./
COPY src/          ./src/

# Usuário não-root — princípio de menor privilégio (OWASP)
RUN addgroup -S barber && adduser -S barber -G barber
USER barber

EXPOSE 3001

# Health check nativo do Docker / Kubernetes liveness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "api.js"]
