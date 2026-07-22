# 博客混合语义搜索 Design Spec

日期：2026-07-21  
状态：已批准执行（Arthur 已明确授权自主决策，但禁止部署到生产）

## 1. 目标

把现有公开搜索从纯 SQLite FTS5 升级为适合中文长文的混合检索：

1. FTS5 召回前 30 篇，负责人名、模型名、代码、专有名词和精确短语。
2. Dense embedding 精确余弦召回前 30 篇，负责改写、概念和跨语言语义。
3. 用 Reciprocal Rank Fusion 合并，`score += 1 / (60 + rank)`，两路等权。
4. 按文章聚合；一个文章的多个 chunk 不能挤占候选名额。
5. 对融合前 10 篇调用跨编码器 reranker；只有博客基准证明有益才默认开启。
6. 保留现有每页 10 篇、查询参数和高亮行为。
7. 模型或 sidecar 不可用时自动退回现有 FTS5，搜索不能跟着模型一起挂掉。

这不是 RAG，不生成答案，也不引入向量数据库。最多约 500 篇文章、几千个 chunk，SQLite BLOB + 进程内精确点积已经绰绰有余。上 ANN/独立向量库只会制造第二套数据真相和更多故障面。

## 2. 已核实约束

### 2.1 语料

- 当前生产库有 27 篇已发布文章；中文正文约 236 KiB，单篇通常一两千字。
- 已完整阅读 27 篇已发布中文正文，主题覆盖社会观察、战争、语言、AI、制度、家庭、道德、劳动和诗歌。
- 部分文章有英文翻译；dense 索引同时纳入存在的英文正文，以支持英文问中文文章。
- 预期上限为 400–500 篇，不为虚构的百万级规模设计。

### 2.2 真实服务器

- 远端 `72.60.195.46` 实际为 1 vCPU（AMD EPYC 9354P 虚拟核），支持 AVX2。
- 内存 3.6 GiB，无 swap；观测时约 1.4 GiB available。
- 生产 app、worker、Caddy 合计常驻内存约 295 MiB。
- 因此真正的约束是单核 CPU 延迟，而不是向量存储或内存。

### 2.3 安全边界

- 生产目录 `/opt/arthurs-review`、生产数据 `/var/www/arthurs-review/data` 和现有容器保持不变。
- 所有远端实验只在 `/root/myblog-semantic-experiment`、独立容器、独立网络、独立端口和生产库一致性快照上运行。
- 本任务可以提交和推送功能分支、运行 GitHub Actions，但不得合并到 `main`，不得运行生产部署步骤。

## 3. 模型决策

### 3.1 首选 embedding

首选 `ibm-granite/granite-embedding-97m-multilingual-r2`：

- 真正的 retrieval embedding bi-encoder，不是只为 sentence similarity 包装的模型。
- 97M 参数、384 维、中文在其 52 个重点训练语言内。
- 官方提供 ONNX/OpenVINO，Apache-2.0。
- 使用 CLS pooling；输出必须 L2 normalize。
- 初始部署使用官方 AVX2 INT8 ONNX，模型 revision 与每个下载文件 SHA-256 固定在镜像中。

模型卡：<https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2>

### 3.2 首选 reranker

首选 `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1`：

- 117M 级 multilingual MiniLM 跨编码器，训练目标是 Information Retrieval 排序。
- mMARCO 覆盖 14 种翻译语言，模型页面标记 15 languages；中文必须由博客基准单独验证，不能仅凭标签相信。
- 官方提供约 119 MB 的 AVX2 UINT8 ONNX，Apache-2.0。
- 每次只重排融合前 10 篇，不参与召回。

模型卡：<https://huggingface.co/cross-encoder/mmarco-mMiniLMv2-L12-H384-v1>

### 3.3 实测挑战者

至少对以下轻量候选做同一基准、同一远端硬件对比；不因发布时间新就自动获胜：

- `BAAI/bge-small-zh-v1.5`：中文老牌小模型，MIT；作为低成本中文基线。
- `jinaai/jina-embeddings-v5-text-nano-retrieval`：239M、768 维、检索专用、CC BY-NC 4.0；质量挑战者可以测，但公开站点的未来用途不应被非商业条款锁死，不能作为无条件生产默认。
- `voyageai/voyage-4-nano` 和 Jina v5 small 只在能得到可复现的本地 CPU artifact 时比较；不把云 API 当生产依赖。

`cross-encoder/ettin-reranker-68m-v1` 不进入中文生产候选：体积漂亮，但目标语料和训练重点偏英文。TurboVec 明确不使用；几 MB 向量省不了什么，反而增加精度、格式和升级风险。

### 3.4 最终模型门槛

- embedding 最终选择由 held-out 博客基准、1 vCPU 吞吐、峰值 RSS 和镜像可复现性共同决定。
- reranker 只有满足第 12 节的增益门槛才默认开启；若未过门槛，代码和镜像可保留，但生产默认关闭并记录原因。
- 不做自定义 kernel。ONNX Runtime 的 AVX2 INT8 已覆盖此规模最值钱的优化；先测出真实瓶颈再谈别的。

### 3.5 冻结后的实测决定

- Granite held-out RRF：Hit@10 0.9877、MRR@10 0.8272；加入 mMARCO 后 Hit@10 不变、MRR@10 0.8557（+0.0285），因此最终默认启用 reranker。
- Jina nano 的 held-out dense MRR@10 0.8769，质量最高；但 27 篇索引 218.26 秒，按 5,230 chunks 外推单核 67.70 分钟，即使第二核完美线性加速也要 33.85 分钟，因此违反 30 分钟硬门槛。
- BGE held-out RRF MRR@10 0.8252，27 篇索引 21.80 秒；速度最好，但 dev 与跨语言覆盖不如 Granite。
- 最终固定 Granite 97M + FTS/RRF + mMARCO top-10；held-out 后不再调 prompt、chunk、RRF 或 passage。

## 4. 总体架构

```text
发布/翻译成功
    -> 同一 SQLite 事务写入 search.embed durable job
    -> 现有 worker 读取 immutable revision
    -> 文本清理与 chunking
    -> semantic sidecar /embed
    -> 单事务替换该文章的 embedding rows

GET /search?q=...
    -> FTS5 top 30 -------------------+
    -> sidecar /embed(query)           +-> article-level RRF -> top 10 /rerank -> 10/page
       -> SQLite chunks exact cosine --+

sidecar 超时/不健康/索引为空
    -> 原有 FTS5 搜索与分页
```

### 4.1 为什么是单个 Python ONNX sidecar

比较过三条路线：

1. **Node 直接跑 ONNX**：app 基于 Alpine/musl，原生包和模型算子兼容性更脆；还会让 app、worker 分别加载模型，白白翻倍内存。拒绝。
2. **两个通用 Hugging Face/TEI 服务**：成熟，但 embedding 与 reranker 各一套常驻框架，对 1 核小机过重。拒绝。
3. **一个专用 Python ONNX sidecar**：只依赖 `onnxruntime`、`tokenizers`、`numpy`，embedding 常驻；reranker 只有配置启用时才加载，API 极小。采用。

sidecar 使用 Debian slim/glibc，不改现有 Node Alpine 镜像。模型在镜像构建期下载并校验；运行期完全离线。

## 5. Sidecar API 与运行约束

### 5.1 API

- `GET /healthz`
  - 200：embedding 已加载，返回模型 ID、revision、维度、最大输入、进程 RSS，以及 reranker 是否启用；启用时还必须完成 reranker 加载。
  - 503：启动中或模型加载失败。
- `POST /embed`
  - 输入：`{"kind":"query|document","texts":[...]}`。
  - 输出：归一化 float32 vectors、每项 token count、模型 identity。
  - 批量上限、单项字符上限和请求体大小都在服务端硬限制。
- `POST /rerank`
  - 输入：单个 query 与最多 10 个 passages；passage 带稳定 candidate ID。
  - 输出：每个 candidate 的原始 logit；调用者做稳定降序排序。

### 5.2 资源与故障行为

- ONNX Runtime 固定 `intra_op_num_threads=1`、`inter_op_num_threads=1`，避免单核机器线程打架。
- CPU arena、memory pattern 与 prepacking 关闭，glibc 固定单 arena，并在每次推理后主动 `malloc_trim(0)`；索引默认每批 4 个 chunk，避免长批次让 ORT/glibc 高水位把 1.2 GiB 容器顶爆。
- sidecar 只允许 1 个推理请求执行；超额请求排队有上限，满载返回 503。
- Node 查询 embedding 超时后走 FTS；reranker 超时后保留 RRF 顺序。
- worker 的 embed 失败走现有 durable job 指数退避，不损坏旧索引。
- sidecar 不接公网，只暴露给 Compose 内网；实验端口也只绑定远端 `127.0.0.1`，通过 SSH tunnel 访问。

## 6. 文本切分

### 6.1 清理

- 保留标题、段落、列表文字、引用和代码内容；去掉 Markdown 标记、链接 URL 和 HTML 噪声。
- 绝不修改源 Markdown。
- 中文和英文正文分别切分并记录 `language`。

### 6.2 chunk 规则

- 每篇文章先生成一个 metadata chunk：中英文标题、摘要、分类、标签。
- 正文优先按标题和空行分段，再合并到目标 320–420 Unicode code points；硬上限 520 code points。
- 相邻正文 chunk 保留约 60 code points overlap，避免概念落在边界。
- 送入 embedding 的文本前置文章标题和最近章节标题；数据库 `content` 保存适合摘要/rerank 的干净文本。
- sidecar tokenizer 再做硬 token 截断；实际 token 数写入行，基准报告截断比例。任何 chunk 不得静默超过模型输入上限。

## 7. SQLite 数据模型

新增迁移 `009_semantic_search.sql`：

```sql
article_embedding_chunks(
  id integer primary key,
  article_id integer not null references articles(id) on delete cascade,
  revision_id integer not null references article_revisions(id) on delete cascade,
  model_id text not null,
  model_revision text not null,
  dimension integer not null,
  chunk_index integer not null,
  language text not null,
  content text not null,
  token_count integer not null,
  embedding blob not null,
  created_at text not null,
  unique(article_id, revision_id, model_id, model_revision, chunk_index)
)
```

附加索引按 `(model_id, model_revision, article_id)` 和 `(article_id, revision_id)` 建立。向量以 little-endian float32 BLOB 存储；384 维每个约 1.5 KiB。读取时维度、字节长度和有限数值全部校验，坏行跳过并记录，而不是让公开搜索 500。

迁移同时安全重建 `jobs` 的 CHECK constraint，加入 `search.embed`，完整复制旧任务、索引和自增序列。

不建第二张“模型状态”表：每行已有完整模型 identity，运行配置就是 active identity。模型切换期间未完成的文章仍由 FTS 兜底。

## 8. 索引生命周期

### 8.1 发布和翻译

- `enqueuePublishedRevisionJobs` 在同一事务增加 `search.embed`。
- payload 只含 `articleId`、`revisionId`；dedupe key 为不可变 revision identity。
- handler 调用模型前和落库事务内各检查一次：该文章仍已发布，且 `published_revision_id` 仍等于 payload revision。
- 先在事务外完成 chunk 与推理，再在一个短事务中删除该文章旧向量并插入全套新向量；不会出现半篇索引。
- 旧 revision job 迟到时直接成功退出，不能覆盖新 revision。

### 8.2 取消发布和删除

- 在现有文章事务中同步删除该文章所有 embedding rows。
- 仍在队列中的旧 job 因 published revision 检查而成为 no-op。

### 8.3 backfill

- 新增幂等命令 `pnpm search:backfill`，为当前所有已发布 revision 入队；已成功索引同一模型 identity 的文章跳过。
- 支持 `--force` 重新入队；不直接在命令里做长时间推理。
- worker 中断后可继续，不重做已成功行。

## 9. 在线检索

### 9.1 保留兼容边界

- `searchArticles(query): Article[]` 与现有同步 FTS 行为保持不变。
- `searchArticleResults(...)` 保持同步 FTS 分页行为，作为兼容和降级路径。
- 新增异步 `searchArticleResultsHybrid(...)`，仅公开 `/search` 页面改用它。
- 这样模型网络调用不会偷偷污染现有同步调用者和测试边界。

### 9.2 FTS 路

- 使用现有安全 FTS query builder 和 snippet sentinel。
- 取 BM25 排名前 30 个已发布文章；保留 rank、snippet 和 highlight parts。
- 标点-only、空查询仍直接返回空页，不调用模型。

### 9.3 dense 路

- 查询向量必须与 row 的 `model_id`、`model_revision`、`dimension` 完全一致。
- 对 active model 的全部 chunk 做精确 dot product；因双方 L2 normalize，点积即 cosine。
- 每篇只保留最高分 chunk，再按最高分取 30 个不同文章。
- tie-break 必须确定：dense score、发布时间、article ID。

### 9.4 RRF 与 rerank

- FTS 和 dense 都使用 1-based article rank。
- `rrf = Σ 1 / (60 + rank)`；缺席某一路不加分。
- 同分依次比较：出现路数、最好单路 rank、发布时间、article ID。
- rerank passage 由标题、摘要、最佳 dense chunk 和 FTS snippet 组成，去重并受字符/token 上限约束。
- reranker 只重排 RRF 前 10，不过滤；第 11 名以后保持 RRF 次序。
- reranker 相同分数按原 RRF rank 稳定排序。

### 9.5 分页与摘要

- hybrid 候选 union 最大 60 篇，按当前 10 条分页。
- `total` 是本次 hybrid 候选文章数；page 继续 clamp。
- FTS 命中优先使用现有安全高亮 snippet。
- 纯 dense 命中使用最佳 chunk 的纯文本摘要，不伪造高亮。
- 若 dense 路完全不可用，调用原 FTS 分页，保持旧搜索可以看到超过 30 条的语义。

## 10. 配置

建议环境变量及默认值：

- `SEMANTIC_SEARCH_URL`：未设置即只用 FTS。
- `SEMANTIC_SEARCH_MODEL_ID`、`SEMANTIC_SEARCH_MODEL_REVISION`：必须与 sidecar `/healthz` 一致。
- `SEMANTIC_SEARCH_TIMEOUT_MS=4000`。
- `SEMANTIC_RERANK_ENABLED=1`（仅在基准过门槛后设为 1）。
- `SEMANTIC_RERANK_TIMEOUT_MS=6000`。
- `SEMANTIC_FTS_LIMIT=30`、`SEMANTIC_DENSE_LIMIT=30`、`SEMANTIC_RRF_K=60` 固定为代码常量；不为不需要的旋钮造配置地狱。

模型 revision、artifact URL 和 SHA-256 固定在 `semantic/models.lock.json`，镜像构建时逐个验证。latest/main 只用于研究，不进入镜像。

## 11. 博客专属 benchmark

### 11.1 数据集

仓库内提交 `benchmarks/semantic-search/questions.json`，严格 270 题，即当前 27 篇每篇 10 题：

- 2 题 lexical：人名、术语、原文短语或模型/产品名。
- 5 题 semantic：不用标题原词复述文章核心论点、例子或因果关系。
- 2 题 contrastive：容易与另一篇主题相近文章混淆，标签说明区分点。
- 1 题 cross-lingual：英文查询中文文章，或中文查询英文专有表达。

每题包含稳定 ID、query、kind、primary slug、可选其他 relevant slugs、标签理由和 `split`。每篇 7 题 dev、3 题 held-out；调 chunk、RRF 和模型只看 dev，held-out 只用于最终一次选择及回归。

禁止把文章标题原样复制进 semantic/contrastive 题；禁止用模型先检索再反向挑“它能答对”的题。基准校验器检查数量、slug、重复 query、split、每篇/每类配额。

### 11.2 报告

评测输出 JSON 与 Markdown：

- Recall/Hit@1、@3、@10
- MRR@10、nDCG@10
- 按 lexical / semantic / contrastive / cross-lingual 和 dev / held-out 分组
- 每种模式（FTS、dense、RRF、RRF+rerank）的查询 p50/p95/max
- 每个错误 query 的完整排名、分数和 relevant slug
- indexing 总耗时、chunk 数、chars/s、峰值 RSS

报告必须能由命令重跑，不能手工美化数字。

## 12. 验收标准

### 12.1 正确性

- [x] 迁移 1→9 与空库 0→9 均成功；旧 FTS、jobs 和文章数不变，`foreign_key_check` 与 `integrity_check` 通过。
- [x] 发布/翻译只入一个对应 revision 的 embed job；重复操作不重复入队。
- [x] stale job、取消发布、删除、推理失败和进程中断都不会留下错误或半套向量。
- [x] 维度错、模型 identity 错、损坏 BLOB、NaN/Infinity 行被安全忽略并有测试。
- [x] FTS top 30、dense top 30 distinct articles、RRF `k=60`、top 10 rerank 与每页 10 条都有确定性单测。
- [x] query sidecar 失败退回完整旧 FTS；reranker 失败只退回 RRF。
- [x] 纯 dense 命中能显示可读摘要；FTS 命中仍安全高亮，无 `dangerouslySetInnerHTML`。
- [x] 空白、标点、超长 Unicode、中文、英文、混合文本和并发请求均有边界测试。

### 12.2 质量

- [x] 270 题 schema/配额校验全绿，held-out 在调参结束前不用于选择。
- [x] held-out RRF 相比 FTS-only：semantic+contrastive MRR@10 至少提升 0.10；lexical Hit@1 下降不超过 0.02。
- [ ] held-out hybrid 总体 Hit@10 ≥ 0.98、Hit@1 ≥ 0.80、MRR@10 ≥ 0.85。实测分别为 0.9877、0.7654、0.8557；Hit@1 未过线，未改题掩盖。
- [x] reranker 默认开启的门槛：不降低 Hit@10，且 held-out 总体 MRR@10 绝对提升 ≥ 0.02；若不达标则默认关闭并在报告列出反例。
- [x] 最终模型选择同时报告 Granite、至少一个挑战者和 FTS-only；不能只报告赢家。

### 12.3 性能与资源

- [x] 在真实 1 vCPU 服务器快照上，27 篇完整 backfill < 5 分钟。
- [x] 在同机用真实文章复制并改 ID 构造 500 篇压力语料，完整索引 < 30 分钟。
- [x] 500 篇索引 exact cosine 扫描本身 p95 < 100 ms；端到端 RRF 搜索 p95 < 4 秒，开启 reranker 后 p95 < 8 秒。
- [x] sidecar 冷启动到健康 < 90 秒；生产默认同时加载 embedding 与 reranker，500 篇索引时 sidecar cgroup 峰值 < 900 MiB 且 swap 使用单独记录；总容器不能 OOM。
- [x] app + worker + sidecar 压测期间无 OOM，主机 available memory 不低于 384 MiB；失败注入时 app 仍健康。

### 12.4 构建、CI 与浏览器

- [x] `pnpm lint`、完整 Vitest、`pnpm build`、完整 Playwright 全绿。
- [x] sidecar Python 单测、模型 smoke test、Docker healthcheck 和两个镜像的 linux/amd64 build 全绿。
- [ ] 非 `main` 功能分支 GitHub Actions 全绿，且 workflow 不接触生产 SSH/部署 secrets。
- [x] 使用 Codex Browser 在隔离实验站点实测至少 12 个代表查询，覆盖精确、语义、易混淆、英文、无结果、模型故障。
- [x] 桌面与移动 viewport 检查搜索框、摘要、高亮、分页、长中英文断行和无布局溢出。

### 12.5 生产隔离

- [x] 实验前后生产容器 ID/image digest、Compose 文件、生产 DB checksum/文章数和公开 `/healthz` 均无非预期变化。
- [x] 不合并 `main`、不运行 deploy workflow、不修改 `/opt/arthurs-review` 或 `/var/www/arthurs-review/data`。
- [x] 最终交付包含未来部署/回滚步骤，但本任务停在可部署状态。

## 13. 测试策略

所有行为改动遵循 TDD：先写最小失败测试，实际运行并确认失败原因正确，再写实现并跑绿。测试层次：

- Python：tokenization/pooling、batch limits、HTTP contract、模型 identity、rerank stable IDs。
- TypeScript unit：chunking、float BLOB、cosine、dense aggregation、RRF、pagination、fallback。
- SQLite integration：migration、job lifecycle、revision races、publish/unpublish/delete/backfill。
- App integration：mock sidecar 的 hybrid search、timeout、bad responses、semantic excerpt。
- Real-model smoke：固定中英文 query/document 对，断言 shape、normalize 和相对排序。
- Benchmark：实际 27/500 article corpus，不 mock 模型。
- Browser：隔离站点真实模型，不只跑 DOM 单测。

## 14. 可观测性与隐私

- sidecar 日志记录 request ID、operation、batch、tokens、duration、status，不记录完整 query/article 文本。
- app 对降级只记结构化原因（timeout、unhealthy、identity mismatch、bad vector），不把异常细节显示给读者。
- 健康检查可显示 active model identity 和 index coverage 数，不暴露文件路径、文章内容或内部错误。
- benchmark 可提交 query 和 slug，因为博客为公开 CC0；生产快照、正文副本和数据库不得进入 git。

## 15. 交付物

- 本 Design Spec 与逐项勾选 Todo。
- 迁移、服务代码、sidecar、Docker/Compose/CI 配置、backfill 和 benchmark CLI。
- 270 题数据集、可重跑评测器、原始 JSON 和汇总 Markdown。
- 单元/集成/E2E/浏览器证据与远端资源报告。
- 模型选择、失败尝试、降级行为、未来部署和回滚说明。
