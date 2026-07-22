# 混合语义搜索详细 Todo

配套设计：`docs/superpowers/specs/2026-07-21-semantic-search-design.md`  
规则：每完成一项立即勾选并补证据；上下文压缩后先读 Design Spec 和本文件。禁止部署生产。

## A. 基线、语料与安全边界

- [x] 用 CodeGraph 确认现有 `/search -> searchArticleResults -> FTS5` 调用链。
- [x] 核对文章发布、翻译、取消发布、删除与 FTS 同步路径。
- [x] 核对 durable jobs queue、handler、worker、重试和 stale-lock 行为。
- [x] 核对当前迁移 001–008、Dockerfile、Compose、Deploy workflow 与 E2E。
- [x] 读取全部 27 篇已发布中文正文并整理主题/易混淆文章。
- [x] 通过 SQLite Online Backup 创建生产 DB 一致性快照，校验 `integrity_check=ok` 和 27 篇已发布。
- [x] 将 Markdown 同步到 `/root/myblog-semantic-experiment` 与本机安全临时目录；确认不进入 git。
- [x] 核实远端实际 1 vCPU、3.6 GiB、无 swap、AVX2、生产容器内存与数据目录。
- [x] 记录实验前生产容器 ID/digest、Compose checksum、DB checksum、文章数与 `/healthz`；证据在 `benchmarks/semantic-search/measurements/production-before.json`。
- [x] 阅读存在的英文翻译，并为每篇文章编写一题 cross-lingual query 后通过 slug 校验。

## B. 模型 artifact 与单核可行性

- [x] 通过 Hugging Face API 固定 Granite model revision；列全 tokenizer/config/ONNX 必需文件与 SHA-256。
- [x] 固定 mMARCO reranker revision、tokenizer/config/AVX2 ONNX 文件与 SHA-256。
- [x] 获取 BGE-small-zh-v1.5 可复现 CPU artifact，记录 revision/license/大小。
- [x] 获取 Jina v5 nano retrieval 官方 ONNX artifact，记录 revision/license/大小与 retrieval 专用输出。
- [x] 在隔离 Python/glibc 容器安装最小 `onnxruntime + tokenizers + numpy`，不改远端系统 Python。
- [x] 检查各 ONNX input/output 名、dtype、dynamic axes、pooling 和 tokenizer special tokens。
- [x] 用固定中英文 query/passage 验证 Granite CLS pooling、L2 normalize 和相对排序。
- [x] 验证 mMARCO pair tokenization、logit shape、10 passage stable ID 排序。
- [x] 测 embedding 候选批量吞吐、冷启动、RSS、模型磁盘大小；Granite 另完成远端 500 篇全量压力测试。
- [x] 测 reranker 1/5/10 短 passage 延迟、真实 top-10 长 passage 延迟和 RSS，原始结果在 `measurements/reranker-latency-remote.json`。
- [x] 将已完成的索引、查询与生产基线原始测量保存为机器可读 JSON，不只抄终端数字。

## C. 持久化设计文档

- [x] 写入完整 Design Spec，包含约束、架构、模型、schema、生命周期、benchmark 与验收门槛。
- [x] 写入本详细 Todo，并把已完成探索勾选。
- [x] 自审 Design Spec：无 TODO 占位、无互相矛盾的同步/异步边界、无生产部署授权越界。
- [x] 根据真实模型 artifact 检查后更新 revision、SHA、输入上限和初始资源预算。

## D. TDD：数据库与向量基础

- [x] 先写 migration 009 失败测试：空库 0→9、旧库 8→9、旧 jobs 保留、新 `search.embed` 可写、其他类型 constraint 仍拒绝。
- [x] 运行该测试并保存预期 red 证据。
- [x] 实现 `009_semantic_search.sql` 与 migrate registry，跑绿。
- [x] 测 `foreign_key_check`、`integrity_check`、jobs indexes 和 migration idempotency。
- [x] 先写 float32 little-endian encode/decode、维度/长度/finite 校验失败测试。
- [x] 实现最小 vector codec，跑绿。
- [x] 先写 cosine/dot-product、model identity filter、损坏 row 跳过测试。
- [x] 实现 exact scan 与 article max-score aggregation，跑绿。

## E. TDD：chunking 与索引生命周期

- [x] 先写 Markdown 清理测试：标题、段落、列表、引用、代码保留；URL/markup/HTML 噪声移除。
- [x] 先写中文/英文 chunk 目标长度、硬上限、overlap、metadata chunk、空正文测试。
- [x] 实现 deterministic chunker，跑绿并覆盖代表文章 chunks。
- [x] 先写 publish/translation 每 revision 仅入一个 `search.embed` job 的失败测试。
- [x] 先写 stale revision、unpublished、deleted article handler no-op 测试。
- [x] 先写推理成功后原子替换、推理失败保留旧 rows、插入中断回滚测试。
- [x] 实现 outbox job、payload schema、handler 依赖注入与索引 service，逐项跑绿。
- [x] 先写 unpublish/delete 同事务删除向量和残留 job no-op 测试，再实现。
- [x] 先写 backfill 幂等/force/只处理当前 published revision 测试，再实现 `search:backfill`。

## F. TDD：Sidecar

- [x] 建立 `semantic/` 最小 Python 包、固定依赖和 `models.lock.json`。
- [x] 先写 artifact downloader 的 revision、SHA、缺文件、坏 checksum 测试，再实现。
- [x] 先写 tokenizer batching、truncation、CLS pooling、normalize 和 pair logits 测试。
- [x] 实现 ONNX model adapters；runtime image 不含 torch/transformers。
- [x] 先写 `/healthz` 启动中/成功/失败 contract 测试。
- [x] 先写 `/embed` kind、batch、字符数、body size、bad JSON、model failure 测试。
- [x] 先写 `/rerank` max 10、stable candidate ID、duplicate ID、disabled/model failure 测试。
- [x] 实现 HTTP server、单推理 semaphore、bounded queue、结构化无正文日志。
- [x] 写 `semantic.Dockerfile`，模型构建期下载校验、runtime 无网络、非 root 用户、healthcheck。
- [x] real-model container smoke：中文、英文、mixed query；检查 shape、norm、顺序和 health identity。

## G. TDD：Node sidecar client 与混合检索

- [x] 先写 client 对 success、timeout、abort、non-2xx、invalid JSON、wrong identity、wrong dimension、NaN 的测试。
- [x] 实现最小 `SemanticSearchClient`，限制请求大小且不重试在线 query。
- [x] 先写 FTS top 30 distinct published articles 与原有高亮测试。
- [x] 先写 dense top 30 distinct articles、best chunk 和确定 tie-break 测试。
- [x] 先写 RRF `k=60`、缺一路、重复 article、同分 tie-break 测试。
- [x] 先写 rerank 只重排前 10、stable ties、第 11 名不动、failure 保持 RRF 测试。
- [x] 先写 hybrid union pagination、page clamp、total、10/page 测试。
- [x] 先写 semantic-only excerpt、FTS highlight 优先和无 HTML 注入测试。
- [x] 实现 `searchArticleResultsHybrid`；保持 `searchArticles` / `searchArticleResults` 同步兼容。
- [x] 将 `/search` 页面改为 await hybrid；空白/标点查询不访问 sidecar。
- [x] 添加读者不可见但日志可观测的 fallback reasons，并细分 timeout/http/response/network。

## H. 270 题 benchmark

- [x] 定义并测试 benchmark JSON schema、稳定 ID、known slugs、query 去重。
- [x] 为 27 篇文章各写 2 个 lexical query（54 题）。
- [x] 为 27 篇文章各写 5 个 semantic paraphrase（135 题）。
- [x] 为 27 篇文章各写 2 个 contrastive query（54 题）。
- [x] 为 27 篇文章各写 1 个 cross-lingual query（27 题）。
- [x] 标注 primary/relevant slugs、理由、7 dev + 3 held-out/文章。
- [x] 用校验器确认恰好 270 题、类别配额、split 配额、无重复、无失效 slug。
- [x] 人工复读每题对应文章段落；270 题按 27 篇逐组审核，未发现标题抄写冒充语义题、含糊题或需补第二 relevant slug 的多解题，因此不改冻结题集。
- [x] 先写 metric fixtures，验证 Hit@k、MRR@10、nDCG@10 算法。
- [x] 实现可重跑 benchmark CLI、p50/p95/max 和逐 query 原始排名/分数 JSON。
- [x] 跑 FTS-only baseline，保存 dev、冻结后的单次 held-out 与按 kind 报告。
- [x] 跑 Granite dense-only / RRF / RRF+rerank 的 dev 与单次 held-out。
- [x] 跑 BGE challenger 的 dense/RRF dev 与单次 held-out；reranker 效果由最终 Granite 候选单独隔离评估，未重复消耗 held-out。
- [x] 跑 Jina v5 nano retrieval 的 dense/RRF dev、单次 held-out与远端单核索引实测。
- [x] 只用 dev 调 chunk size/overlap、passage composition、RRF 参数候选和 rerank passage。
- [x] 冻结配置后只跑一次 held-out；选择 Granite，并因 MRR +0.0285 且 Hit@10 不降而默认启用 mMARCO。
- [x] 写入 benchmark 原始 JSON、汇总 Markdown、错误分析和最终 lockfile；提交动作留到 L 节统一完成。

## I. Compose、CI 与部署准备（不部署）

- [x] 先写 deployment/Compose 测试：semantic image 必须 immutable digest、内网 only、healthcheck、app/worker URL 一致。
- [x] 更新 `deploy/docker-compose.yml` 增加 semantic service、app/worker env 和资源约束。
- [x] 更新 bootstrap/backup/restore/deploy 脚本所需 schema/image 参数；保持旧数据备份兼容。
- [x] 新增非 main 的 CI workflow：install、lint、Vitest、Python tests、app build、两个 amd64 image build、real-model smoke、Playwright。
- [x] 更新 main Deploy workflow 以构建/测试/推送两个 digest，但本任务不触发。
- [x] 确认 workflow_dispatch 的生产路径仍需已有 secrets，feature branch CI 无部署权限。
- [x] 更新 README/运维文档：模型许可、资源、backfill、健康、故障降级、部署、回滚与 swap 观测。

## J. 本地与隔离远端验证

- [x] 本地运行 Python 29 tests、完整 Vitest 268 tests、lint/typecheck 与 Next build 全绿；最终提交前还会独立重跑。
- [x] 在真实 linux/amd64 远端构建 app 与 semantic images，检查 revision label、架构和全部锁定模型 checksum；本机 Docker Desktop daemon 未能启动，最终 CI 另做独立 amd64 build。
- [x] 本地 Playwright 经 SSH tunnel 对 real sidecar + seeded app 跑完：31 passed、1 个既有条件 skip。
- [x] rsync feature tree 到 `/root/myblog-semantic-experiment`，排除 `.git/node_modules/.next/生产数据`。
- [x] 在隔离 Docker network/volume 构建并启动 sidecar 与一次性 app 任务；只映射远端 localhost 实验端口。
- [x] 对快照跑 migration、27 篇完整索引、coverage、integrity 和检索 benchmark。
- [x] 构造 500 篇独立 ID 压力库，完成 5,230 chunks 全量索引与 189 个 dev query latency/RSS 测量。
- [x] 做 sidecar stop/timeout/bad response/worker restart/stale job 故障注入，确认 FTS 和恢复；证据在 `measurements/failure-injection-final.json`。
- [x] 记录容器 stats、host memory、p50/p95/max、日志和最终 benchmark；500 篇最终跑次 29m23.3s、681.4 MiB、sidecar swap 0。

## K. Browser 实际验收

- [x] 用 SSH local tunnel 暴露隔离站点；远端端口只绑定 `127.0.0.1`，从未公开到公网。
- [x] 使用 Codex Browser 打开实验 `/search` 并确认真实 Granite + mMARCO 生效。
- [x] 桌面跑 12 个查询：4 lexical、4 semantic、2 contrastive、1 English、1 no-result。
- [x] 检查每个结果排名、摘要来源、高亮、链接与分页；5 个冻结 benchmark 查询的页面/raw 排名均为 `1,9,6,2,1`。
- [x] 393×956 手机 viewport 重跑中文与长英文查询，检查搜索框、卡片、图片、分页和横向溢出。
- [x] 停 sidecar 后用 Browser 确认同页面退回 FTS 且无 500；恢复健康后 dense/rerank 再生效。
- [x] 保存桌面/手机截图和 `measurements/browser-acceptance-final.json` 观察记录。

## L. GitHub Actions 与最终审计

- [x] `git diff --check`，确认只改预期文件且保留用户 `graphify-out/`。
- [x] 审查 secret、绝对路径、生产快照、模型大文件未进入 git；仅提交哈希/统计证据和小型 lockfile，未提交 DB、正文快照或模型二进制。
- [x] 提交到 `codex/audit-remediation` 并推送 commit `c099e9f3d6ada3de5b82e129657b9d8b0da4a67a`；未推 `main`。
- [x] 非部署 [GitHub Actions run 29885331253](https://github.com/arthurlee116/arthurs-review-main/actions/runs/29885331253) 全部 green，用时 9m0s。
- [x] 独立重跑验收命令，不复用旧输出：Python 29、Vitest 268、lint/typecheck、Next build、real-model Playwright 31 passed。
- [x] 对照 Design Spec 第 12 节逐项勾选；唯一未满足的是自设 Hit@1 ≥ 0.80，实测 0.7654，明确保留未勾选并写入限制，没有篡题。
- [x] 核对实验后生产容器 ID/digest、Compose checksum、DB checksum/文章数、`/healthz`，全部与 before 一致。
- [x] 停止并移除隔离实验容器/tunnel、临时 swap、实验 images 和 runs；保留仓库 benchmark 报告与可复现实验脚本。
- [x] 写最终详细报告：代码、模型、benchmark、性能、资源、降级、测试、CI、未部署证明、未来部署/回滚。
