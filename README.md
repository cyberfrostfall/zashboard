# zashboard

<p align="center">
  <img src="./readme/pc.png" height="300">
  <img src="./readme/mobile.png" height="300">
</p>

---

## 🆕 本 Fork 新增：后台持续监控与历史回看

> 本节为 [cyberfrostfall/zashboard](https://github.com/cyberfrostfall/zashboard) 在原项目基础上新增的功能，原版功能与下方文档不受影响。

### 解决了什么问题

原版 zashboard 是**纯前端面板**：它通过浏览器直连内核（Mihomo/Clash）的 WebSocket 端点拉取数据，**只有打开网页时才采集，关闭标签页就停止**。因此你无法回看「刚才离开的这段时间」发生了什么。

本 Fork 新增了一个**独立的后台采集服务** + 一个**历史回看页面**，实现：

- 🟢 **7×24 后台采集**：采集服务作为独立进程常驻运行，即使没有人打开网页，也持续把数据存档。
- 🟢 **数据存档到 SQLite**：流量速率、连接数、内存占用、内核日志，按秒聚合落库。
- 🟢 **自动清理过期数据**：默认保留最近 **2 小时**（可配置），旧数据自动删除，磁盘占用可控。
- 🟢 **历史回看页面**：在面板侧边栏新增「历史 / History」入口，复用原版 ECharts 图表，支持 **最近 30 分钟 / 1 小时 / 2 小时** 时间范围切换。

### 架构

```
┌─────────────┐   WebSocket   ┌──────────────────┐   写入   ┌──────────┐
│ Mihomo 内核 │ ────────────▶ │  采集服务         │ ──────▶ │  SQLite  │
│  (Clash API)│  traffic       │  (collector/)    │         │  .db 文件 │
└─────────────┘  memory        │  · 连 4 个 WS     │ ◀──读取─┘          │
                 connections    │  · 按秒聚合写库   │                    │
                 logs           │  · 定时清理过期   │                    │
                                │  · 暴露 HTTP API  │                    │
                                └────────┬─────────┘                    │
                                         │ HTTP /history/*               │
                                         ▼                               │
                                ┌──────────────────┐                    │
                                │  zashboard 前端   │ ◀──────────────────┘
                                │  「历史」页面      │
                                └──────────────────┘
```

采集服务与前端**完全解耦**：前端只负责通过 HTTP 读取并展示历史数据，采集服务独立于浏览器运行。

### 改动了哪些文件

| 部分 | 文件 | 说明 |
|------|------|------|
| **采集服务（新增）** | [`collector/`](./collector/) | 独立的 Node.js 服务，详见 [collector/README.md](./collector/README.md) |
| 历史页面 | `src/views/HistoryPage.vue` | 历史回看主页面 |
| 历史图表 | `src/components/history/HistoryChart.vue` | 带时间轴的 ECharts 折线图 |
| 数据 store | `src/store/history.ts` | 对接采集服务的 HTTP API，采集地址可配置并持久化 |
| 路由/图标 | `src/router/index.ts`、`src/constant/index.ts` | 注册 `history` 路由与侧边栏图标 |
| 多语言 | `src/i18n/{en,zh,zh-tw,ru}.ts` | 历史页面的 4 种语言文案 |
| 开发代理 | `vite.config.ts` | dev 模式下 `/collector` 代理到采集服务，避免跨域 |

---

## 📖 使用教程（后台监控功能）

### 前置要求

- **Node.js ≥ 22**（采集服务使用 Node 内置的 `node:sqlite`，**无需任何原生编译**）
- 一个正在运行的 Mihomo / Clash 内核，且已开启 external-controller（即 zashboard 平时连接的那个 API）

### 第 1 步：配置采集服务

编辑 [`collector/config.json`](./collector/config.json)，填入你的内核地址与密钥（字段与 zashboard「后端设置」里完全一致，照抄即可）：

```json
{
  "backend": {
    "protocol": "http",      // http 或 https
    "host": "127.0.0.1",     // 内核地址
    "port": "9090",          // 内核 external-controller 端口
    "secondaryPath": "",     // 若 API 有前缀路径才填，否则留空
    "password": ""           // 内核 secret（密钥）
  },
  "retentionMs": 7200000,    // 数据保留时长，单位毫秒，默认 2 小时
  "logRetentionMs": 7200000, // 日志保留时长
  "port": 8788,              // 采集服务自身的 HTTP 端口
  "bindHost": "127.0.0.1",   // 监听地址，默认仅本机可访问
  "dbPath": "./data/metrics.db",
  "maxLogsPerSecond": 50     // 日志写入限速，防止刷屏撑爆数据库
}
```

> 💡 想存更久？把 `retentionMs` 调大即可。例如保留 12 小时 = `43200000`。

### 第 2 步：启动采集服务

```bash
cd collector
npm install        # 只需一次，安装唯一依赖 ws
npm start          # 或 node src/index.js
```

启动成功后会看到类似输出：

```
[server] history API on http://127.0.0.1:8788
[collector] target http://127.0.0.1:9090, retention 120 min
[collector] connected: traffic
[collector] connected: memory
[collector] connected: connections
[collector] connected: logs
```

看到 4 个 `connected` 即表示已开始持续采集。

### 第 3 步：让采集服务 7×24 守护运行（可选但推荐）

直接 `npm start` 会随终端关闭而停止。要真正常驻后台，任选一种：

**方式 A：nohup（最简单）**

```bash
cd collector
nohup node src/index.js > collector.log 2>&1 &
```

**方式 B：pm2（推荐，带自动重启与开机自启）**

```bash
npm install -g pm2
cd collector
pm2 start src/index.js --name zashboard-collector
pm2 save && pm2 startup   # 配置开机自启
```

**方式 C：macOS launchd / Linux systemd** —— 适合做成系统服务，见 [collector/README.md](./collector/README.md)。

### 第 4 步：在前端查看历史

- **开发模式**：在项目根目录 `pnpm dev`，打开页面，侧边栏会出现「**历史 / History**」入口。dev 模式下前端已自动把 `/collector` 代理到 `127.0.0.1:8788`，开箱即用。
- **生产部署**：`pnpm build` 后部署 `dist/`。此时前端默认请求采集服务地址 `http://127.0.0.1:8788`。如果采集服务在别的地址，进入「历史」页面后，在页面顶部的**采集服务地址**输入框填入正确地址即可（会自动保存）。

进入历史页面后：
- 顶部切换 **最近 30 分钟 / 1 小时 / 2 小时**
- 查看 **速度、内存、连接数** 三张时间曲线图，以及 **历史日志** 列表
- 点「刷新」可手动拉取最新数据

### 验证「关网页仍在采集」

这是本功能的核心价值，可以这样验证：

1. 确保采集服务在后台运行；
2. **关闭浏览器所有 zashboard 标签页**，等待 5 分钟；
3. 重新打开历史页面 → 你会看到这 5 分钟内**连续无断点**的数据曲线，证明采集独立于前端进行。

### 自测采集服务（可选）

```bash
# 服务运行几分钟后：
curl 'http://127.0.0.1:8788/history/range'                         # 查看已存档的数据时间范围
curl 'http://127.0.0.1:8788/history/metrics?from=0&to=9999999999999' # 查看指标数据
```

### ⚠️ 安全提示

采集服务默认只监听 `127.0.0.1`（仅本机）。若你将 `bindHost` 改为 `0.0.0.0` 对外暴露，请**务必自行加上鉴权和防火墙**——历史数据涉及你的网络活动记录。

---

## **Requirement**

Browser support

- Chrome 111 (released March 2023)
- Firefox 128 (released July 2024)
- Safari 16.4 (released March 2023)
- Not supported on iOS 16.4 jailbroken version.

## **Online**

You can access the online zashboard at the following link:

- [Online zashboard](http://board.zash.run.place)

## **Download**

You can download the zashboard files here:

release:

- [dist.zip (7.81 MB)](https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip) – Includes better font-loading experience.
- [dist-no-fonts.zip (1.44 MB)](https://github.com/Zephyruso/zashboard/releases/latest/download/dist-no-fonts.zip) – No fonts included, uses system fonts only.
- [dist-cdn-fonts.zip (1.44 MB)](https://github.com/Zephyruso/zashboard/releases/latest/download/dist-cdn-fonts.zip) – Fonts loaded from unpkg.com, If you have trouble connecting to unpkg.com, **you may experience slow page loading**.
- [dist-firasans-only.zip (1.67 MB)](https://github.com/Zephyruso/zashboard/releases/latest/download/dist-firasans-only.zip) – Only with FiraSans Font
- [dist-misans-only.zip (3.54 MB)](https://github.com/Zephyruso/zashboard/releases/latest/download/dist-misans-only.zip) – Only with MiSans Font
- [dist-pingfang-only.zip (3.25 MB)](https://github.com/Zephyruso/zashboard/releases/latest/download/dist-pingfang-only.zip) – Only with PingFang Font
- [dist-sarasa-only.zip (3.67 MB)](https://github.com/Zephyruso/zashboard/releases/latest/download/dist-sarasa-only.zip) – Only with Sarasa Font

dev:

- [gh-pages.zip (7.81 MB)](https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages.zip)
- [gh-pages-no-fonts.zip (1.44 MB)](https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages-no-fonts.zip)
- [gh-pages-cdn-fonts.zip (1.44 MB)](https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages-cdn-fonts.zip)
- [gh-pages-firasans-only.zip (1.67 MB)](https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages-firasans-only.zip)
- [gh-pages-misans-only.zip (3.54 MB)](https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages-misans-only.zip)
- [gh-pages-pingfang-only.zip (3.25 MB)](https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages-pingfang-only.zip)
- [gh-pages-sarasa-only.zip (3.67 MB)](https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages-sarasa-only.zip)

## **Docker Setup**

To run zashboard via Docker, use the following command:

```
docker run -d -p 80:80 ghcr.io/zephyruso/zashboard:latest
```

## Tips

1. The connection table can be dragged with the left mouse button, and right-clicking can copy cell content.
2. Right-clicking on a node / node group card will perform a speedtest for the node / node group.
3. The proxy group sorting is based on the node order in the GLOBAL group. In Mihomo, it follows the configuration file order, while in sing-box, route.final is placed first, with the rest following the configuration file order. If you need custom ordering, you can specify the order by overriding the GLOBAL group.
4. The dashboard supports PWA (Progressive Web App), which can provide a native app-like experience on mobile devices through "Add to Home Screen".
5. The dashboard's upgrade button and auto-upgrade functionality require proper configuration of the core's UI download path ([mihomo](https://wiki.metacubex.one/config/general/#_9) | [sing-box](https://sing-box.sagernet.org/configuration/experimental/clash-api/#external_ui_download_url)), otherwise clicking update may result in updating to the core's default panel.

## 提示

1. 连接表格可被鼠标左键拖动，右键可复制单元格内容。
2. 右键点击节点/节点组卡片可对节点/节点组进行测速。
3. 面板的节点组排序是根据GLOBAL组中的节点顺序排序的，在Mihomo中会是按配置文件的顺序，在sing-box中会把route.final放到第一位，其余按照配置文件顺序，如果你需要自定义顺序，可通过覆盖GLOBAL组指定顺序
4. 面板支持PWA（Progressive Web App），可以在移动设备上通过"添加到主屏幕"获得类原生app的体验
5. 面板的更新按钮和自动更新功能需要正确的配置核心的ui下载路径 ([mihomo](https://wiki.metacubex.one/config/general/#_9) | [sing-box](https://sing-box.sagernet.org/configuration/experimental/clash-api/#external_ui_download_url)), 否则可能会在点击更新后更新为核心默认面板

## URL params format

#### basic example

http://host:port/#/setup?hostname=ipordomain&port=9090&secret=123456

1. **`http` / `https`**
   - Determines the protocol (`http` or `https`).
   - Default: current page protocol

2. **`hostname`**
   - The Clash API's IP or domain.

3. **`port`**
   - The Clash API port.

4. **`secondaryPath`**
   - Optional path appended to the base URL.
   - Default: An empty string.

5. **`secret`**
   - Password for authentication.

6. **`disableUpgradeCore`**
   - Set '1' to hide upgrade core button

7. **`disableTunMode`**
   - Set '1' to hide tun switch

### I code just for fun, not for money. If you really want to donate, please consider donating to [UNICEF](https://www.unicef.org/) to help hungry children.
