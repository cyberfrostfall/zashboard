# zashboard-collector

一个独立的后台采集服务，持续连接 Mihomo/Clash 内核的 WebSocket 端点，把
**流量速率、连接数、内存占用、日志**存档进 SQLite，供 zashboard 的「历史」页面回看。

> 解决的问题：zashboard 是纯前端，只有打开网页时才采集数据。本服务独立运行，
> 即使没人打开网页也持续采集（7x24）。

## 依赖

- **Node.js ≥ 22**（使用内置的 `node:sqlite`，无需任何原生编译）
- 仅一个运行时依赖：`ws`

## 配置

编辑 `config.json`：

```json
{
  "backend": {
    "protocol": "http",     // http 或 https
    "host": "127.0.0.1",    // 内核地址
    "port": "9090",         // 内核 external-controller 端口
    "secondaryPath": "",    // 若内核 API 有前缀路径，填这里
    "password": ""          // 内核 secret
  },
  "retentionMs": 7200000,   // 指标保留时长，默认 2 小时
  "logRetentionMs": 7200000,// 日志保留时长
  "port": 8788,             // 本服务 HTTP API 端口
  "bindHost": "127.0.0.1",  // 监听地址（默认仅本机）
  "dbPath": "./data/metrics.db",
  "maxLogsPerSecond": 50    // 日志写入限速
}
```

> `backend` 的字段与 zashboard 前端「后端设置」里的完全一致，直接照填即可。

## 运行

```bash
cd collector
npm install
npm start          # 或 node src/index.js
```

7x24 守护可用 pm2 / systemd / nohup，例如：

```bash
nohup node src/index.js > collector.log 2>&1 &
```

## HTTP API

- `GET /history/range` → `{ min, max, count }` 当前库内数据的时间范围
- `GET /history/metrics?from=<ms>&to=<ms>` → `{ down, up, conns, memory }`，
  每个是 `{ name: <时间戳>, value: <数值> }[]`，可直接喂给 zashboard 图表
- `GET /history/logs?from=<ms>&to=<ms>&limit=<n>` → `[{ ts, type, payload }]`
- `GET /health` → `{ ok: true }`

## 自测

```bash
# 跑几分钟后：
curl 'http://127.0.0.1:8788/history/range'
curl 'http://127.0.0.1:8788/history/metrics?from=0&to=9999999999999'
```

## 安全提示

默认只监听 `127.0.0.1`。若改成对外监听（`bindHost: "0.0.0.0"`），请自行加鉴权
与防火墙——历史数据涉及你的网络活动。
