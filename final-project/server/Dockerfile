# --- Resume Job Match API — production image --------------------------------
# Lightweight Node.js LTS base. Alpine keeps the image small; every runtime
# dependency (express, cors, dotenv, multer, pdf-parse, zod) is pure JS, so no
# native build toolchain is required.
FROM node:20-alpine

# Production defaults. NODE_ENV=production also disables the app's optional
# debug model-output exposure (see orchestrationService.js), keeping raw model
# responses out of API responses in production.
ENV NODE_ENV=production

# All application code lives under /app.
WORKDIR /app

# Copy dependency manifests FIRST so the `npm ci` layer stays cached and only
# re-runs when dependencies actually change — not on every source edit.
COPY package.json package-lock.json ./

# Install ONLY production dependencies (omits vitest, supertest, etc.).
RUN npm ci --omit=dev

# Copy the application source. .dockerignore keeps out node_modules, .env,
# tests, logs, uploads, and git metadata.
COPY . .

# The Express server listens on 5000. app.listen(5000) binds to all
# interfaces (0.0.0.0) by default, so it is reachable from outside the
# container once the port is published.
EXPOSE 5000

# Production entrypoint — plain node, never nodemon / `npm run dev`.
# Env vars (PORT, AI keys, etc.) are supplied at runtime via --env-file or the
# hosting platform, never baked into the image.
CMD ["node", "src/server.js"]
