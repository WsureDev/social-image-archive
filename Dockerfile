FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d

ARG HTTP_PROXY
ARG HTTPS_PROXY
RUN export http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY" \
    && find /etc/apt -type f \( -name '*.sources' -o -name '*.list' \) \
       -exec sed -i 's|http://deb.debian.org|https://deb.debian.org|g' {} + \
    && apt-get -o Acquire::Retries=3 -o Acquire::https::Timeout=30 -o APT::Update::Error-Mode=any update \
    && apt-get -o Acquire::Retries=3 -o Acquire::https::Timeout=30 install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
# Wrangler is needed at runtime to refresh the existing Cloudflare OAuth login.
COPY node_modules ./node_modules
COPY src ./src
COPY scripts ./scripts
COPY share-template ./share-template
RUN bun run build:gallery

ENV NODE_ENV=production
USER bun
ENTRYPOINT ["bun"]
CMD ["src/local/start.ts"]
