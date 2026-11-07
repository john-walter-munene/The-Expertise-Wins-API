FROM node:22-bookworm

# npm 12 requires Node ^22.22.2 || ^24.15.0 || >=26 (the base image ships npm 10).
RUN npm install -g npm@12.2.1 \
    && npm --version

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

# Install CLI dependencies in the image so a newly-created cli_node_modules
# volume is initialized with them. The entrypoint also repairs older empty
# volumes that already exist on developer machines.
COPY cli/package.json cli/package-lock.json ./cli/
RUN npm ci --prefix cli

# System libraries required by Puppeteer's downloaded Chrome on Debian.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 \
    libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 \
    libxss1 libxtst6 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json ./backend/package.json
COPY backend/prisma ./backend/prisma
ENV DATABASE_URL="postgresql://tew:tew_local_dev@db:5432/expertise_wins?schema=public"
RUN cd backend && npm install && npx prisma generate

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

# Strip any CRLF line endings so the /bin/sh shebang stays valid when this
# repo is checked out on Windows; a stray \r makes exec fail with
# "No such file or directory" while the container still appears to run.
COPY .devcontainer/entrypoint.sh /usr/local/bin/tekw-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/tekw-entrypoint \
    && chmod +x /usr/local/bin/tekw-entrypoint

ENTRYPOINT ["/usr/local/bin/tekw-entrypoint"]
CMD ["sleep", "infinity"]
