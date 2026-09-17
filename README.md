# 触觉导向砖网格校验器（Tactile Grid Validator）

地下换乘厅改造场景的纯前端校验工具：在固定 **12×12** 网格上布置入口、导向砖与避难点，
检查**每个入口是否都能沿导向砖到达每个避难点**。平面图上看似连续、实际只在转角处
**以角点相碰**的导向砖会被正确判为断链——只有**共享一条边**（上 / 下 / 左 / 右）的
格才算连接，对角接触一律不算。

- 技术栈：TypeScript + React 19 + Vite 7
- 单元测试：Vitest（连通路径、行优先挑选规则、单砖失效审计、JSON 严格校验）
- 端到端测试：Playwright（键盘 / 指针编辑、JSON 导入导出、判定主链路）
- 部署：Docker Compose 运行单个静态 Web（nginx），另附一次性 `verify` 验收服务

---

## 一、规则说明

### 格类型（每格恰好一种）

| 类型 | 标识 | 可否通行 |
| --- | --- | --- |
| 空白 | `empty` | 否 |
| 障碍 | `obstacle` | 否 |
| 导向砖 | `guide` | 是 |
| 入口 | `entrance` | 是（端点，数量 1–4 个） |
| 避难点 | `shelter` | 是（端点，数量 1–4 个） |

### 通行与连接

- 仅 `entrance`、`guide`、`shelter` 三类格可通行。
- 两个可通行格必须**共享一条边**才算相连；只在对角方向共享一个角点的两块砖
  **不算连接**（视障乘客无法沿砖面通过）。
- 空白与障碍不可通行、不可穿越。
- 校验目标：**任意入口都能到达任意避难点**（全连通，取每个入口对所有避难点的笛卡尔积）。

### 判定结果与高亮

存在不可达关系时：

1. 将全部入口按**行优先**（先按行号升序，同行按列号升序）排序；
2. 将全部避难点按同样的行优先规则排序；
3. 依上述顺序选出**第一个**“该入口无法到达该避难点”的对；
4. 高亮：
   - 该入口实际可达的**全部格**（青色）；
   - 与这片可达区域**共享边**的全部障碍格（红色，对角相接的障碍不计）。

任何一次编辑（补上一块形成正交连接的导向砖、擦除格等）都会**立即重算**并替换旧结果，
不需要手动点击“校验”。

### 单砖失效审计

连通校验通过后，可启动**单砖失效审计**：判断任意一块**导向砖**损坏后，
是否仍能从每个入口抵达每个避难点。

- 领域层把入口、导向砖、避难点组成**正交无向图**，仅导向砖是可移除顶点；
- 用**一次低链值（low-link）遍历**求出全部关键砖（导向砖子图中的割点）
  及其移除后断开的入口—避难点对，**不逐砖复制网格、不重复完整可达搜索**；
- 关键砖按**行优先**排列；每块砖的受影响关系按**入口行优先、再按避难点行优先**
  排列，同一关系只出现一次；
- 没有关键砖时明确提示“网络可承受任一单砖失效”；
- 结果区可选择一块关键砖，画布会突出该砖（橙色）及对应的受影响入口（蓝框）
  与避难点（绿框）；
- 审计只能在现有连通判定**通过且端点数量合法**（各 1–4 个）时启动；
- 任何编辑、合法导入或清空都会**撤销报告**；导入被整份拒绝时保持原网格，
  且不会生成审计结果。

### 编辑方式

- **指针（鼠标 / 触摸 / 触控笔）**：先在工具栏选择格类型，再点击格子；按住拖动可连续涂画。
- **键盘**：
  - `← ↑ → ↓` 移动焦点；
  - 数字键 `1`–`5` 选择工具并在当前焦点落笔（1 空白 / 2 障碍 / 3 导向砖 / 4 入口 / 5 避难点）；
  - `Enter` 或空格：写入当前工具；`Backspace` / `Delete`：擦除为空白。

### 导入的整份拒绝规则

导入 JSON 时执行严格的“整份校验”，出现以下任一情况即**整份拒绝**（画布保持原状、
清除旧判定结论、显示错误，错误信息同时列出全部问题）：

- 网格尺寸不是恰好 12 行 × 12 列（含行 / 列数不符、行不是数组等）；
- 出现五种合法类型之外的**未知格类型**，或格值不是字符串；
- 入口数量不在 **1–4** 范围内；
- 避难点数量不在 **1–4** 范围内；
- JSON 本身存在语法错误。

---

## 二、JSON 结构

导出 / 导入的本地文件结构如下（UTF-8、缩进 2 空格）：

```json
{
  "version": 1,
  "grid": [
    ["entrance", "guide", "guide", "shelter", "empty", "..."],
    ["..."]
  ]
}
```

- `version`：格式版本，当前为 `1`。
- `grid`：二维字符串数组，**固定 12 行，每行固定 12 个元素**，行优先（`grid[row][col]`，行列均从 0 开始）。
- 每个元素必须是 `"empty" | "obstacle" | "guide" | "entrance" | "shelter"` 之一。
- `entrance` 与 `shelter` 各自出现次数必须为 1–4 次。

最小合法示例（其余格均为 `empty`，共 12×12）：

```json
{
  "version": 1,
  "grid": [
    ["entrance", "guide", "shelter", "empty", "..."],
    "..."
  ]
}
```

---

## 三、本地启动

需要 Node.js 22+（20.19+ 亦可）。

```bash
npm install        # 安装依赖
npm run dev        # 开发服务器（默认 http://localhost:5173）
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 本地静态预览构建产物（http://localhost:4173）
```

### 测试与一次性验收

```bash
npm run test:unit  # Vitest：路径连通与行优先排序、JSON 校验
npm run test:e2e   # Playwright：自动起 preview 静态服务器后执行端到端测试
npm run verify     # 单元测试 + 生产构建 + Playwright，全绿才算通过
```

> 首次运行 Playwright 需安装浏览器：`npx playwright install chromium`
> （Linux 还需系统依赖，可在有 root 的环境执行
> `npx playwright install --with-deps chromium`）。

---

## 四、Docker Compose 运行与验收

### 启动单个静态 Web

```bash
# 默认宿主端口 8080
docker compose up -d --build web

# 自定义宿主端口（WEB_PORT 可覆盖）
WEB_PORT=9000 docker compose up -d --build web
```

打开 http://localhost:8080 （或覆盖后的端口）即可使用。容器内仅为 nginx
托管 `dist/` 静态文件，没有任何后端。

### 一次性验收服务 verify

`verify` 是一次性服务：先等待 `web` 健康检查通过，再在独立容器内运行
Vitest 单元测试，并对**正在运行的静态 Web 容器**执行全部 Playwright 端到端用例，
随后容器退出——退出码为 0 即验收通过：

```bash
docker compose up --build verify
docker compose ps   # verify 状态为 Exited(0) 即通过
```

验收结束后停止静态站点：

```bash
docker compose down
```

---

## 五、目录结构

```
.
├── docker/
│   └── nginx.conf            # 静态站点 nginx 配置（gzip、SPA 兜底）
├── src/
│   ├── components/
│   │   └── GridBoard.tsx     # 12×12 画布（指针 + 键盘编辑、结果高亮）
│   ├── App.tsx               # 工具面板、判定结论、导入导出
│   ├── grid.ts               # 核心：类型、正交 BFS、行优先选首不可达对、低链值单砖失效审计
│   ├── io.ts                 # JSON 序列化 / 严格解析（整份拒绝）
│   ├── main.tsx
│   └── styles.css
├── tests/
│   ├── unit/                 # Vitest：grid.test.ts、io.test.ts
│   └── e2e/                  # Playwright：app.test.ts
├── Dockerfile                # 多阶段构建：node 构建 → nginx 静态托管
├── Dockerfile.verify         # 一次性验收镜像
├── docker-compose.yml        # web（WEB_PORT 可覆盖）+ verify
├── playwright.config.ts
├── vite.config.ts
└── tsconfig.json
```
