# 博客混合语义搜索：模型调研与实测报告

日期：2026-07-22  
语料：27 篇已发布文章，主要为中文  
目标机器：2 核 2 GiB；实际保守实验机为 1 vCPU、3.6 GiB、AVX2  
结论：`Granite 97M + FTS5 + RRF(k=60) + mMARCO top-10 rerank`

## 1. 结论

最终 embedding 选择 `ibm-granite/granite-embedding-97m-multilingual-r2`，使用官方 AVX2 UINT8 ONNX、384 维向量和 Apache-2.0 许可。它不是博客 benchmark 中质量最高的模型，但它是唯一同时满足以下条件的候选：

- 真正按 retrieval 训练，而非只做句子相似度；
- 中文和跨语言能力可用；
- artifact 可固定 revision 与 SHA-256，runtime 不依赖远程代码；
- 单核 500 篇完整索引明显低于 30 分钟；
- exact cosine 在 5,230 chunks 规模仍足够快；
- 许可允许未来用途变化。

`cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` 默认开启，只重排 RRF 前 10。冻结配置后的 held-out 上，MRR@10 从 0.8272 提升到 0.8557（+0.0285），Hit@10 保持 0.9877，单核 p95 为 4.78 秒，达到事先写入 Design Spec 的开启门槛。

不使用 TurboVec。500 篇压力库的 5,230 个 384 维 float32 向量原始 payload 只有 7.66 MiB；在这个规模上增加压缩格式、量化误差和迁移路径，收益几乎为零。

## 2. “Embedding，不是 sentence similarity”的判定

Hugging Face 的 pipeline tag 不是训练目标。部分真正的 retrieval 模型同时带 `sentence-similarity` 标签；反过来，一个模型能输出向量，也不表示它适合 query-to-document 检索。本次只有满足至少一项下列证据的模型才进入候选：

- 模型卡明确写明 text retrieval / passage retrieval；
- 训练数据包含 query-document 或检索对；
- 官方要求区分 query/document prompt；
- 官方报告 retrieval、MIRACL、BEIR 或 C-MTEB retrieval 指标。

因此 `nomic-embed-text-v1.5` 仍算 retrieval embedding：官方要求 `search_query:` 与 `search_document:` 前缀。它被排除是因为偏英文且已较旧，不是因为 HF 页面把它归到 sentence similarity。

## 3. 2026-07-22 候选调研

当天 [Hugging Face Feature Extraction Trending](https://huggingface.co/models?pipeline_tag=feature-extraction&sort=trending) 前列包括 Qwen3 Embedding、Granite R2、Voyage 4 nano、Jina v5、NVIDIA 1B 等。大榜排名主要衡量热度，不等于适合 2 GiB CPU。

| 模型 | Retrieval 证据 | 规模 / 上下文 / 维度 | 中文与许可 | 本项目判断 |
|---|---|---|---|---|
| [Granite 97M multilingual R2](https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2) | 明确按 retrieval、跨语言检索训练 | 97M；原生 32K；384d | 200+ 语言、52 个重点语言含中文；Apache-2.0 | **最终选择**；官方 CPU ONNX，实测通过 |
| [BGE-small-zh-v1.5](https://huggingface.co/BAAI/bge-small-zh-v1.5) | 官方中文检索 instruction | 约 24M；512 tokens；512d | 中文；MIT | 最快最省；质量挑战者 |
| [Jina v5 text nano retrieval](https://huggingface.co/jinaai/jina-embeddings-v5-text-nano-retrieval) | retrieval 专用变体，要求 `Query:` / `Document:` | 239M；8K；768d | 119+ 语言；CC-BY-NC-4.0 | 质量最好，但索引超时限；当前非商业可用，未来用途受限 |
| [Jina v5 text small](https://huggingface.co/jinaai/jina-embeddings-v5-text-small) | retrieval 任务变体与官方 ONNX | 677M；32K；1024d/MRL | 119+ 语言；CC-BY-NC-4.0 | 对 2 GiB CPU 明显过重，不进入实测 |
| [Voyage 4 nano](https://huggingface.co/voyageai/voyage-4-nano) | 明确 retrieval；query/document prompt | 约 0.3B；32K；2048→256d MRL | 多语言；Apache-2.0 | 模型很强，但本地 CPU 路径依赖 custom code，缺少本项目可接受的固定 AVX2 ONNX |
| [Qwen3 Embedding 0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) | 官方定义为 text embedding，覆盖 retrieval | 0.6B；32K；1024→32d MRL | 100+ 语言；Apache-2.0 | Trending 强，但 2 GiB CPU 预算不合适 |
| [Nomic Embed v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) | `search_query` / `search_document` | 约 0.1B；8K；768→64d MRL | 主要英文；Apache-2.0 | 是 embedding，但不适合中文主语料 |
| [Nomic Embed v2 MoE](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe) | 多语言 retrieval，1.6B 训练对 | 475M 总参数、305M active；512 tokens；768→256d | 101 语言；Apache-2.0 | 比 v1.5 更合题，但 custom code 与活跃参数量仍太重 |
| [EmbeddingGemma 300M](https://huggingface.co/google/embeddinggemma-300m) | 官方定位 search/retrieval | 300M；2K；768→128d MRL | 100+ 语言；Gemma 条款、需接受访问条件 | 能跑端侧不等于适合这台 VPS；许可与 artifact 流程不如 Granite 干净 |

Granite 311M 也在 Trending 前列，但 97M 版本已经取得 0.9877 held-out Hit@10，并以较大余量通过索引时限；继续扩大模型只会挤压 reranker 和宿主机余量。

### Reranker

- [Ettin reranker 68M v1](https://huggingface.co/cross-encoder/ettin-reranker-68m-v1) 是真正的 cross-encoder reranker，不是假 embedding；但模型卡语言为英文，中文博客不采用。
- [mMARCO MiniLM L12 multilingual](https://huggingface.co/cross-encoder/mmarco-mMiniLMv2-L12-H384-v1) 是 IR 排序模型，提供约 119 MB AVX2 UINT8 ONNX，Apache-2.0。本博客自己的中文 benchmark 已证明它有效，因此采用。

## 4. 固定 artifact

所有生产候选均固定 model revision、每个文件大小与 SHA-256；镜像构建期下载并校验，运行期不联网。

| 用途 | ID | Revision | 维度 | 锁定文件总量 |
|---|---|---|---:|---:|
| embedding | `ibm-granite/granite-embedding-97m-multilingual-r2` | `835ad14087e140460703cf0fae09f97d469d65c2` | 384 | 123,564,497 B |
| reranker | `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` | `1427fd652930e4ba29e8149678df786c240d8825` | — | 135,704,241 B |
| BGE challenger | `onnx-community/bge-small-zh-v1.5-ONNX` | `9507db33464b5da99a532ac26b2a251767cbc62b` | 512 | 24,306,131 B |
| Jina challenger | `jinaai/jina-embeddings-v5-text-nano-retrieval` | `ac5d898c8d382b17167c33e5c8af644a3519b47d` | 768 | 140,845,494 B |

生产锁文件为 `semantic/models.lock.json`；挑战者锁文件保存在 `benchmarks/semantic-search/models/`。

## 5. 博客专属 benchmark

### 5.1 数据集

完整读取 27 篇已发布文章后，构造 270 题：

- lexical：54 题，每篇 2 题；
- semantic paraphrase：135 题，每篇 5 题；
- contrastive：54 题，每篇 2 题；
- cross-lingual：27 题，每篇 1 题。

每篇 7 题 dev、3 题 held-out，总计 dev 189、held-out 81。cross-lingual 全部在 dev；held-out 每篇各含一题 lexical、semantic、contrastive。semantic/contrastive 不允许照抄标题；每题保存 primary slug、其他 relevant slugs 和理由。

dev 用于选择 query prompt、document prompt、chunking、RRF 与 rerank 开关。配置冻结后，held-out 对每个候选只运行一次，没有看答案后改题、补 relevant slug 或调参。冻结后又按 27 篇、每篇 10 题逐题复读，没有发现标题抄写冒充语义题、失效 slug 或需要补第二 relevant slug 的多解题，因此未修改题集。

### 5.2 检索模式

1. FTS5 取 distinct published articles 前 30；
2. 对 query 做 embedding，SQLite 中逐 chunk exact cosine，按文章最大 chunk score 聚合前 30；
3. 文章级 RRF，`score = Σ 1 / (60 + rank)`；
4. top 10 组成 `标题 + 摘要 + 最佳 dense chunk + FTS snippet`，mMARCO 重新排序；
5. 结果仍按每页 10 篇分页。

### 5.3 Dev（189 题）

| 模式 | Hit@1 | Hit@3 | Hit@10 | MRR@10 | nDCG@10 | query p95 |
|---|---:|---:|---:|---:|---:|---:|
| FTS | 0.180 | 0.180 | 0.180 | 0.180 | 0.180 | — |
| Granite dense | 0.725 | 0.873 | 0.989 | 0.814 | 0.857 | 41 ms |
| Granite RRF | 0.714 | 0.884 | 0.989 | 0.813 | 0.856 | 51 ms |
| Granite RRF + mMARCO | 0.762 | 0.884 | 0.989 | 0.838 | 0.874 | 4,628 ms |
| BGE dense + 中文 query instruction | 0.683 | 0.810 | 0.937 | 0.759 | 0.801 | 本机旧跑次未分位统计 |
| BGE RRF | 0.667 | 0.820 | 0.937 | 0.756 | 0.799 | 本机旧跑次未分位统计 |
| Jina dense + Query/Document prompt | **0.862** | **0.989** | **1.000** | **0.924** | **0.943** | 134 ms |
| Jina RRF | 0.836 | 0.984 | **1.000** | 0.909 | 0.933 | 139 ms |

### 5.4 Held-out（81 题，只跑一次）

| 模式 | Hit@1 | Hit@3 | Hit@10 | MRR@10 | nDCG@10 | query p95 |
|---|---:|---:|---:|---:|---:|---:|
| FTS | 0.321 | 0.321 | 0.321 | 0.321 | 0.321 | 2.8 ms |
| Granite dense | 0.704 | 0.840 | 0.975 | 0.793 | 0.837 | 33 ms |
| Granite RRF | 0.741 | 0.877 | 0.988 | 0.827 | 0.866 | 51 ms |
| **Granite RRF + mMARCO** | **0.765** | **0.914** | **0.988** | **0.856** | **0.889** | 4,780 ms |
| BGE dense | 0.753 | 0.889 | 0.988 | 0.829 | 0.867 | 23 ms |
| BGE RRF | 0.741 | 0.889 | 0.988 | 0.825 | 0.864 | 44 ms |
| Jina dense | **0.790** | **0.963** | 0.988 | **0.877** | **0.905** | 132 ms |
| Jina RRF | 0.765 | **0.963** | 0.988 | 0.865 | 0.896 | 120 ms |

### 5.5 按题型看最终方案

| Held-out 类别 | FTS MRR@10 | Granite RRF MRR@10 | + mMARCO MRR@10 |
|---|---:|---:|---:|
| lexical | 0.889 | 0.981 | 0.972 |
| semantic | 0.074 | 0.735 | 0.828 |
| contrastive | 0.000 | 0.765 | 0.767 |

RRF 对 semantic+contrastive 的平均 MRR 提升约 0.713，同时 lexical Hit@1 从 0.889 提到 0.963。mMARCO 的主要收益来自 semantic：再增加 0.093 MRR；它让 lexical MRR 小降 0.009，但 lexical Hit@1 不变、总体 Hit@10 不变。

## 6. 性能与资源

实际远端为 AMD EPYC 9354P KVM、1 vCPU、3.6 GiB、无硬件加速、AVX2。它比目标少一个 CPU，因此索引吞吐是保守测量；内存比目标多，但 sidecar 用 1,200 MiB cgroup 单独限额。

| 模型 / 语料 | 文章 | chunks | 完整索引 | sidecar cgroup peak |
|---|---:|---:|---:|---:|
| BGE | 27 | 281 | 21.80 s | 208 MiB |
| Granite，最终 batch 4、reranker 不加载 | 27 | 281 | 40.88 s | — |
| Granite，500 篇压力库、reranker 不加载 | 500 | 5,230 | 822.24 s（13m42s） | 406 MiB |
| **Granite 最终生产形态，reranker 常驻** | **500** | **5,230** | **1,763.28 s（29m23.3s）** | **681 MiB，sidecar swap 0** |
| Jina nano retrieval | 27 | 281 | 218.26 s | 431 MiB |

Jina 按相同压力库 chunk 数线性外推为 67.70 分钟/单核；即使第二核取得不现实的完美 2× 加速，下界仍为 33.85 分钟，因此违反 30 分钟硬门槛。

500 篇最终生产形态距离 30 分钟上限只剩 36.7 秒，但它是在只有 1 vCPU 的真实主机上完成；目标是 2 核。它在 1,200 MiB cgroup 下无 OOM，sidecar 内存峰值 714,481,664 B（681.4 MiB），sidecar `memory.swap.peak=0`，实验期观测到的主机 available memory 低点仍为 914,259,968 B（871.9 MiB）。

500 篇 Granite RRF dev 查询：p50 124 ms、p95 182 ms、max 326 ms。这个数字包含 query embedding、FTS、5,230-chunk exact scan、RRF 和结果组装，不含 reranker。独立分阶段计时的 exact cosine scan 为 p50 41.7 ms、p95 58.1 ms、max 92.2 ms；加上 query embedding 后 dense 端到端 p95 为 110.9 ms。

mMARCO 的短 passage 微测：1/5/10 candidates p50 分别为 30/138/356 ms；真实博客 chunk 更长，最终 81 题 held-out top-10 端到端 p50 3.36 s、p95 4.78 s、max 5.24 s。

## 7. 内存问题与修复

最初的“能启动”不代表能跑完 backfill，连续推理暴露了 ORT/glibc 高水位：

1. batch 16，同时加载 embedding 与 reranker：1.2 GiB cgroup OOM；
2. 关闭 reranker、关闭 CPU arena/memory pattern，但仍 batch 16：再次 OOM；
3. batch 4、`MALLOC_ARENA_MAX=1`、`MALLOC_TRIM_THRESHOLD_=131072`，每次推理后 `malloc_trim(0)`：500 篇跑完，峰值 406 MiB；
4. 首次默认开启 reranker 的压测时，未清理的 4 个旧实验 sidecar 与新容器同时抢内存，导致主机压力和 exit 137；该跑次作废，不当作模型结论。
5. 清理旧 sidecar 后，按 [ONNX Runtime 官方的低内存选项](https://onnxruntime.ai/docs/performance/model-optimizations/ort-format-models.html) 设置 `session.disable_prepacking=1`，并保留 batch 4 与 trim；reranker 常驻时 500 篇成功跑完，峰值 681.4 MiB、sidecar swap 0、耗时 29m23.3s。

Sidecar 的生产约束为单推理 semaphore、单线程 ORT、关闭 CPU arena/memory pattern/prepacking、glibc 单 arena、显式 trim。超出并发队列会返回 503，不允许内存无界增长。用户允许用空闲磁盘做虚拟内存，因此实验临时开了 2 GiB、不写入 `fstab` 的 swap 作整机保险；sidecar cgroup 全程未使用它。实验结束后已执行 `swapoff` 并删除该精确 swap 文件，宿主机恢复为 0 个 active swap entry。

## 8. 实现行为

- Migration 009 增加带 model ID、revision、dimension 与 revision FK 的 chunk 向量表，并扩展 durable job 类型；
- 发布或翻译在同一 SQLite 事务中入 `search.embed` job；
- worker 只读取 immutable published revision；stale/unpublished/deleted job 是 no-op；
- 新向量全部推理成功后才在事务内原子替换，失败保留旧索引；
- unpublish/delete 同事务移除派生向量；
- sidecar HTTP 边界限制 batch、字符数、请求体、rerank 候选数，日志不记录正文和 query；
- query embedding 的 timeout/http/invalid-response/model-identity 错误全部退回完整旧 FTS；
- reranker 失败只保留 RRF 顺序；
- FTS 高亮优先，纯 dense 命中使用安全纯文本 chunk 摘要；
- sidecar image 非 root、read-only、内网 only，模型构建期校验，runtime 不含 torch/transformers。

## 9. 实际站点、故障与生产隔离验收

不是只测函数。最终 app、worker、Granite embedding 和 mMARCO reranker 在远端独立 Docker network、独立数据副本、仅绑定 `127.0.0.1` 的端口中启动，再通过 SSH local tunnel 交给 Codex Browser 和 Playwright。

- Codex Browser 跑了 12 个代表查询：4 lexical、4 semantic、2 contrastive、1 English、1 无结果。11 个有目标文章的查询全部在前 10，其中 8 个第 1；5 个直接来自冻结 benchmark 的查询，浏览器排名与 raw JSON 完全一致：`1, 9, 6, 2, 1`。
- lexical 命中保留真实 `<mark>` 高亮；纯 dense 命中没有伪造高亮。第二页实际点击后显示 10 条和 `Page 2 of 3`，Previous/Next URL 稳定；结果文章链接实际打开并读到正文。
- 393×956 手机 viewport 重跑中文语义和长英文查询，10 张卡片、图片、搜索框和分页都正常，`scrollWidth === clientWidth === 393`。
- 浏览器发现并修复了一个原单测漏掉的真实 bug：有向量数据时，`!!!` 会绕过空 FTS 结果触发 dense 检索。新增带真实 embedding row 的回归测试后，标点-only 查询现在不访问 sidecar并显示无结果。
- 真实 sidecar stop 后，同一语义-only 页面仍返回 HTTP 200 并安全退回 FTS；重启并恢复 health 后目标文章回到第 1。另测了 200 ms timeout、HTTP 200 坏 JSON、worker restart 和 revision 999999 stale job；旧向量数始终为 281，没有半套索引。
- 锁定真实模型的完整 Playwright 运行结果为 31 passed、1 条既有移动端条件 skip；桌面和 mobile 项目都通过“FTS 无命中但 dense 找回文章”的新增 E2E。

浏览器机器证据在 `measurements/browser-acceptance-final.json`，桌面/手机截图在 `measurements/screenshots/`；故障证据在 `measurements/failure-injection-final.json`。

实验结束后已移除全部 `myblog-*` 实验容器、两个实验 network、实验 image tags、压力数据目录和 SSH tunnels。生产 app/worker/Caddy 的 container ID 与 image digest、Compose SHA-256、生产 DB SHA-256、27 篇文章数及公开 `/healthz` 在实验前后逐字节相同；对比见 `measurements/production-before.json` 与 `measurements/production-after.json`。没有部署生产。

## 10. 诚实的限制

- 最终 held-out Hit@1 为 0.765，没有达到 Design Spec 中主动设定的 0.80 目标；Hit@3 为 0.914、Hit@10 为 0.988。没有为过线篡题或补标签。
- 270 题由同一个实现者阅读文章后编写，覆盖面强于通用 leaderboard，但仍可能存在作者偏差；原始 query、理由、排名和分数全部提交，便于人工审查。
- mMARCO 在单核上不是“秒开”：中位约 3.36 秒。低 QPS 个人博客可接受；若更重视即时响应，把 `SEMANTIC_RERANK_ENABLED=0` 即可保留 RRF 的 51 ms p95。
- exact scan 是刻意选择：当前只有 5,230 chunks。到数万篇或查询 p95 明显恶化时再引入 ANN；现在上向量数据库只会增加运维面。

## 11. 复现入口

```bash
rtk pnpm search:benchmark:index
rtk pnpm search:benchmark -- --mode rrf --split dev
rtk pnpm search:benchmark -- --mode rerank --split held_out
rtk pnpm search:benchmark:stress -- --articles 500 --confirm-isolated
```

原始数据位于：

- `benchmarks/semantic-search/questions.json`
- `benchmarks/semantic-search/results/`
- `benchmarks/semantic-search/measurements/`
- `benchmarks/semantic-search/models/`

本任务只完成代码、隔离服务器实验、测试和可部署准备；没有修改或部署生产应用。
