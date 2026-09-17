# syntax=docker/dockerfile:1

# ---------- 构建阶段 ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# 先复制依赖清单以利用层缓存
COPY package.json package-lock.json ./
RUN npm ci

# 复制源码并产出纯静态文件到 /app/dist
COPY . .
RUN npm run build

# ---------- 运行阶段：单个静态 Web 服务器 ----------
FROM nginx:1.27-alpine AS runtime

# 单页应用的静态站点配置
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
