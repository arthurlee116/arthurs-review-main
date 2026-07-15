# Arthur's Review 改进实施清单

目标：把现有博客补成一套可可靠恢复、写入崩溃安全、公开页面更好读、更好逛、发布存证更透明的个人出版系统；保留 Next.js canary、TypeScript 7、SQLite + Markdown、FTS5 与现有英语查询参数方案。

## 全局约束

- [ ] 全部行为改动遵循 TDD：先写能说明目标行为的测试，确认按预期失败，再写最小实现并跑绿。
- [ ] 不公开标签体系；不做正式国际化；不删除 OpenRouter 翻译；不引入 CMS、PostgreSQL 或新的搜索系统。
- [ ] 首页最多展示 12 篇文章（包含 featured），每个分类页最多展示 8 篇，全部历史文章由 `/archive` 承接。
- [ ] 统一使用 Node.js 26；保留 Next.js 16.3 canary、React 19、TypeScript 7 与 Cache Components。
- [ ] 完成标准不是本地能编译：单测、类型检查、构建、E2E、容器配置、浏览器视觉与交互检查、GitHub Actions、线上页面和响应头必须全部有证据。

## 1. 可靠备份与恢复验证（第一优先级）

- [ ] 使用 `better-sqlite3` Online Backup API 生成一致的 SQLite 快照，不再直接压缩运行中的 WAL 数据库主文件。
- [ ] 每份归档必须包含数据库快照、`markdown/`、`uploads/`、`proofs/` 和 SHA-256 manifest。
- [ ] 归档先写临时文件，校验成功后再原子重命名；失败不得留下伪装成成功备份的归档。
- [ ] 增加可独立运行的备份验证脚本：解包、核对 manifest、执行 SQLite `integrity_check`、确认三个内容目录存在。
- [ ] 保留 VPS 每日备份与 30 天轮转，并增加定时 GitHub Actions：从 VPS 生成并拉取备份，验证后保存为异地 Artifact。
- [ ] 更新 bootstrap、README 和部署测试；部署完成后手动触发一次异地备份工作流并确认成功。

## 2. Markdown 与数据库崩溃安全写入（第一优先级）

- [ ] Markdown 正文改为内容哈希版本文件，先写同目录临时文件、`fsync`、原子重命名，再用数据库事务切换指针。
- [ ] 新建失败时数据库不得残留空正文记录；更新失败或进程在提交前退出时旧正文仍然可读。
- [ ] 删除文章先提交数据库/FTS 删除，再清理正文文件；文件清理失败只能留下无害孤儿文件，不能留下坏数据库指针。
- [ ] 中文正文、英文正文、发布、取消发布与 FTS 同步覆盖真实失败场景测试。

## 3. 删除弹窗并加强读者反馈（第一优先级）

- [ ] 删除 `ContactPromptModal` 文件及所有挂载、样式和旧测试。
- [ ] 保留非阻塞的联系提示，在文章结尾增加明显但不打断阅读的反馈卡片。
- [ ] 反馈卡给出具体问题提示，并提供带文章标题的预填邮件链接与可复制微信号；复制结果可被屏幕阅读器读到。
- [ ] 桌面与移动端都验证：首次访问不再出现遮罩，正文结束后能顺畅反馈。

## 4. Markdown 编辑与公开排版（第一优先级）

- [ ] Studio 编辑器接入 CodeMirror 6 Markdown 内核，保留现有导入 Markdown、图片上传/拖放、检查和实时预览能力。
- [ ] CodeMirror 只进入 Studio 客户端包；公开文章继续使用服务端 `react-markdown + remark-gfm + rehype-sanitize`，不把编辑器运行时发给读者。
- [ ] 统一预览与公开文章的语义样式：链接、列表、引用、行内代码、代码块、表格、分隔线、图片和标题层级。
- [ ] 正文链接具备清晰的常态、键盘焦点和悬停样式；表格和代码在手机上可横向滚动而不撑破页面。

## 5. 缓存与健康检查（第一优先级）

- [ ] 建立单一 `public-content` 缓存标签/失效入口，发布、取消发布、增删改文章、精选变化、设置变化和存证完成都从这里失效。
- [ ] `/healthz` 实际检查数据库查询、数据目录可读写和已发布文章计数；失败返回 503，部署脚本不能把空壳进程当成健康。
- [ ] 为每种公开内容变更写缓存失效测试，并为健康/失败响应写路由测试。

## 6. Archive 与列表上限

- [ ] 新增 `/archive`，按年份分组展示全部已发布文章，保留分类、日期和文章链接。
- [ ] 首页总数严格限制为 12；分类页严格限制为 8；空状态与少量文章状态保持正常。
- [ ] 导航、页脚和 sitemap 加入 Archive；E2E 验证第 13 篇只在 Archive 出现、第 9 篇分类文章不在分类页出现。

## 7. Proofs 透明度档案

- [ ] 新增 `/proofs` 公共页面，说明存证含义并展示文章数、修订数、完整/待处理/失败状态概览。
- [ ] 按文章分组列出全部修订：时间、SHA-256、原文 JSON、OTS、Wayback 与各服务状态。
- [ ] Proofs 加入导航、页脚和 sitemap；页面只展示公开文章对应记录，不泄露内部错误细节或文件系统路径。

## 8. 页脚、RSS 自动发现与动态社交卡片

- [ ] 新增全站页脚，包含 Archive、Proofs、About、RSS、邮件和微信反馈入口。
- [ ] 根 metadata 输出 `application/rss+xml` alternate，让浏览器和阅读器自动发现 `/feed.xml`。
- [ ] 新增 1200×630 动态 OG 图片路由；无封面页面和文章自动使用报刊风格卡片，有封面文章继续优先使用封面。
- [ ] metadata 同时补齐 Open Graph 与 Twitter card，并测试标题、图片 URL 和 content type。

## 9. Node 26 与安全部署配置

- [ ] Docker 三个阶段、GitHub Actions、`package.json` engines 与本地版本文件统一 Node.js 26。
- [ ] `next.config.ts` 关闭 `X-Powered-By`；Caddy 再移除上游该响应头作为边界保证。
- [ ] Caddy 增加 HSTS、`X-Content-Type-Options: nosniff` 与 `Referrer-Policy: strict-origin-when-cross-origin`，并通过官方镜像配置校验。
- [ ] 删除 CI 重复类型检查，但保留 TypeScript 7 实际执行一次；不改变 OpenRouter 超时和翻译功能。

## 10. 最终验收与上线

- [ ] `pnpm lint`、`pnpm typecheck`、全部 Vitest、Playwright 桌面/移动端 E2E、`pnpm build` 全绿。
- [ ] Docker Node 26 镜像能构建，Compose 与 Caddy 配置通过校验；备份生成和恢复验证真实运行一次。
- [ ] 使用 Codex Browser 检查首页、三个分类、Archive、Proofs、文章反馈、Markdown 复杂样例、RSS metadata、OG 图片和手机布局。
- [ ] 提交并推送到 `main`，持续观察 GitHub Actions 直到部署成功；失败则定位并修复后重跑。
- [ ] 线上核对文章数据未丢、首页/分类数量上限、Proofs、Archive、反馈、RSS、OG 图片、healthz 与安全响应头。

