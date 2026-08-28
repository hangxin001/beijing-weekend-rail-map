# 周末开往：北京周末高铁可达地图

选择周五或周六的出发时间，以及周日或周一的最晚抵京时间，筛选从北京七个主要客运站出发、周日返京的直达 G / C / D 行程。页面会自动采用最近仍可出发且快照有数据的周末，不要求输入具体年月日。

## 架构

```text
RailGo ──串行采集/缓存──> GitHub Actions ──> rail-snapshot.json
                                                    │
用户浏览器 <── GitHub Pages <── Vite 静态资源 <──────┘
```

- Vite + 原生 TypeScript + HTML/CSS，无前端框架、路由和状态管理库。
- 所有可达性计算在浏览器完成，无后端、数据库、定位、高德或公交接口。
- 车次采集只枚举北京站途经车次，再按复车次去重查询详情，不做“北京站 × 全国目的站”遍历。
- GitHub Actions 每周一、周四串行更新，遇到 429/5xx 指数退避，失败不会部署坏快照。
- 中国标准地图作为静态图片，SVG 只画关系示意线，HTML 气泡使用省级锚点。

## 本地运行

需要 Node.js 24+ 和 pnpm 10+。

```bash
pnpm install
pnpm data:update
pnpm dev
```

常用命令：

```bash
pnpm check          # TypeScript + Vitest
pnpm build          # 生产构建
pnpm data:update    # 从 RailGo 完整停站表生成未来六个周末快照
pnpm data:validate  # 拒绝非 live 或结构不完整的快照
```

`rail-snapshot.json` 必须由 `pnpm data:update` 从 RailGo 实际数据生成。项目不提供演示快照；发布流程会拒绝非真实来源或结构不完整的数据。首次运行会串行读取完整车次与停站信息，耗时取决于 RailGo 限速及缓存命中情况。

## RailGo 数据任务

北京站配置在 `config/beijing-stations.json`：北京、北京南、北京西、北京北、北京朝阳、北京丰台、清河。代码已经通过 RailGo 预选词接口核验。

采集步骤：

1. 串行请求七站的 `station/query?telecode=...`。
2. 只保留 G/C/D，按 `numberFull` 复车次关系合并。
3. 每组车次只请求一次 `train/query?train=...`。
4. 利用 rundays、停站 day 偏移和到发时间，为每个周末分别生成周五、周六去程以及周日返程的完整日期时间。
5. 遍历完整停站顺序，将北京之后每个实际停靠站都建立为去程目的地，并将北京之前每个停靠站建立为返京出发地。
6. 通过车站预选词补全省市信息；稳定信息与车次详情存入 `.cache/railgo`。
7. 校验六个周末索引后原子替换快照；任何关键步骤失败都不会覆盖旧文件。

请求最小间隔强制不低于 1 秒，每个请求最多三次尝试。可用 `RAILGO_REQUEST_INTERVAL_MS` 增大间隔，但不能设为小于 1000。车次缓存默认最多复用 96 小时。

RailGo 允许自动化访问，但有速率、非商业、署名和不得公开中转接口等限制。本站只发布裁剪后的时刻表派生快照，不提供 RailGo 代理接口。请在运行或公开部署前再次阅读 [RailGo 使用限制](https://api.railgo.dev/)；若数据量持续触发限速，应评估官方建议的 [RailGo-Parser](https://github.com/RailGoApps/RailGo-Parser)，不要增加并发或使用代理绕过。

## 搜索规则

- 去程星期可选周五或周六，发车时间必须大于或等于用户输入时间。
- 所选出发日 23:59 可以，次日 00:00 不属于前一出发日；去程可以跨日到达。
- 返程发车日期固定为周日；最晚抵京可选择周日或周一的具体时刻。
- 只支持直达 G/C/D；同城不同站可自动配对并明确展示。
- 可选北京车站过滤同时作用于去程出发站与返程到达站。
- 最长单程耗时同时作用于去程与返程。
- 停留时长从目的地到达时刻计算到返程发车时刻。

不计算前往车站、进站、市内交通、余票、晚点或购票。

## 快照格式

生产文件位于 `public/data/rail-snapshot.json`，主要字段：

- `generatedAt`、`source`、`availableWeekends`、`dataWarnings`
- `beijingStations`、`stations`、`cityGroups`
- `trains`
- `outboundIndex[周五日期].friday` 与 `outboundIndex[周五日期].saturday`
- `returnIndex[周日日期]`

索引内每条直达区间使用带 `+08:00` 的完整 ISO 日期时间，避免只存 `HH:mm` 导致跨日错误。前端在加载时检查 `schemaVersion`，不认识的结构会显示友好错误。

## GitHub Pages

工作流位于 `.github/workflows/pages.yml`：

- 推送 `main`：检查、构建并部署仓库中的快照。
- 每周一、周四：先刷新 RailGo 快照，再构建部署。
- `workflow_dispatch`：手动刷新并部署。

在仓库 Settings → Pages → Build and deployment 中选择 **GitHub Actions**。Vite 会从 `GITHUB_REPOSITORY` 自动计算仓库子路径；也可用 `PAGES_BASE_PATH` 显式覆盖。部署任务使用 GitHub 官方 `configure-pages`、`upload-pages-artifact` 和 `deploy-pages` Actions。参考 [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) 与 [Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。

## 地图来源

底图文件为 `public/map/china-standard-map-gs2023-2767.jpg`：

- 名称：中国地图 1∶740万 对开，界线版，无邻国，线划一。
- 来源：[自然资源部标准地图服务系统](http://bzdt.ch.mnr.gov.cn/)。
- 审图号：**GS(2023)2767号**。
- 官方资源 ID：`4o28b0625501ad13015501ad2bfc2187`。
- 仓库内图片只做等比缩放和 JPEG 压缩，地图内容未编辑。

页面会持续显示来源和审图号。气泡及北京连线是独立覆盖层，只表达行程关系，不代表铁路实际线路或精确坐标。

## 测试覆盖

Vitest 覆盖自动选择最近周末、当前分钟边界、周五/周六索引、周日/周一截止时间、完整中间停站展开、同城换站、北京站筛选、最长耗时、跨日车次及非 G/C/D 排除。
## 项目属性

这是个人非商业项目。铁路时刻表快照仅供行程灵感与初步筛选，实际出行请以铁路官方信息为准。
