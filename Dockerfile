# FX Analyzer — Render web service image (engine + backend + static frontend).
#
# Single stage, mirroring the pipeline that previously built cleanly on Render.
# The Next.js frontend is NOT built inside Docker: it is exported as a static
# site (frontend/out) by `scripts/build-frontend.sh` and committed, then
# copied verbatim. The Express backend serves frontend/out from the same
# origin as the engine + APIs (one URL, no Vercel needed).
#
# To rebuild the frontend after changing its source:
#   sh scripts/build-frontend.sh && git add Fx-analyzer/frontend/out && git commit

FROM python:3.11-slim

WORKDIR /app

# Node for the backend; build tools for optional native modules.
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Backend deps (layer-cached separately from source).
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm install || (cd backend && npm install --omit=optional)

# Engine deps (lean Render set — full requirements.txt pulls torch/langchain
# and exceeds the free tier's 512MB disk).
COPY engine/requirements-render.txt engine/
RUN pip install --no-cache-dir -r engine/requirements-render.txt

# Everything else (dockerignore keeps node_modules/.venv/.env out), including
# the committed static frontend export.
COPY . .

ENV PORT=4000
EXPOSE 4000
CMD ["bash", "deploy/render/start.sh"]
