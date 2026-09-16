# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
# VITE feature flags — build-time (Vite bake vào bundle; KHÔNG đọc lúc runtime).
# Mặc định AN TOÀN: EE/Broadcast/Sequence TẮT, dry-run BẬT. Bật module Marketing bằng
# cách set các biến này = true khi build (qua docker-compose build.args / .env server).
ARG VITE_MARKETING_ENTERPRISE_ENABLED=false
ARG VITE_BROADCAST_ENABLED=false
ARG VITE_SEQUENCE_ENABLED=false
ARG VITE_MARKETING_DRY_RUN=true
ENV VITE_MARKETING_ENTERPRISE_ENABLED=$VITE_MARKETING_ENTERPRISE_ENABLED \
    VITE_BROADCAST_ENABLED=$VITE_BROADCAST_ENABLED \
    VITE_SEQUENCE_ENABLED=$VITE_SEQUENCE_ENABLED \
    VITE_MARKETING_DRY_RUN=$VITE_MARKETING_DRY_RUN
RUN npm run build

# ── Stage 2: Build backend ───────────────────────────────────────────────────
FROM node:22-alpine AS backend-builder
WORKDIR /app/backend
# sharp (nén ảnh + watermark Media): dùng binary prebuilt @img/sharp-linuxmusl-x64 (đã bundle libvips).
# KHÔNG cài vips-dev ở builder: nếu có, sharp phát hiện "globally-installed libvips" → cố build
# from source → chết vì VPS không tải được node headers từ unofficial-builds.nodejs.org (ETIMEDOUT).
# Bỏ vips-dev → sharp buộc dùng prebuilt binary → build ok. build-base + python3 giữ cho các
# native dep khác nếu cần.
RUN apk add --no-cache build-base python3
COPY backend/package.json backend/package-lock.json ./
# Dùng `npm install` thay `npm ci` vì lock file đôi khi out of sync với package.json.
RUN npm install --no-audit --no-fund
COPY backend/ ./
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
RUN npm run build

# ── Stage 3: Production image ────────────────────────────────────────────────
FROM node:22-alpine
# tzdata = zoneinfo data cho Asia/Ho_Chi_Minh (memory feedback_timezone_vietnam.md).
# Trước đây alpine không có → Node process fallback UTC → log + new Date() lệch 7h vs giờ VN.
# vips = thư viện nền runtime cho sharp (nén ảnh + watermark Media). THIẾU vips → sharp
# crash lúc require → upload ảnh 500. Phải có cả ở image production, không chỉ builder.
RUN apk add --no-cache tini ffmpeg tzdata vips && \
    cp /usr/share/zoneinfo/Asia/Ho_Chi_Minh /etc/localtime && \
    echo "Asia/Ho_Chi_Minh" > /etc/timezone
ENV TZ=Asia/Ho_Chi_Minh
WORKDIR /app

# Copy built artefacts
COPY --from=backend-builder /app/backend/dist       /app/dist
COPY --from=backend-builder /app/backend/node_modules /app/node_modules
COPY --from=backend-builder /app/backend/prisma     /app/prisma
COPY --from=backend-builder /app/backend/prisma.config.ts /app/prisma.config.ts
COPY --from=backend-builder /app/backend/package.json /app/package.json
# Scripts dev/ops (seed demo, migrate helpers) — chạy bằng `docker exec ... npx tsx scripts/...`.
COPY --from=backend-builder /app/backend/scripts    /app/scripts
COPY --from=frontend-builder /app/frontend/dist     /app/static

RUN mkdir -p /var/lib/zalo-crm/files

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
# 2026-06-02: Bỏ "prisma db push --accept-data-loss" — pattern này DROP cột mới
# (vd scheduled_at) khi schema image cũ hơn DB. Migrations chạy qua "prisma migrate deploy"
# ở deploy step thay vì auto khi container start.
CMD ["node", "dist/app.js"]
