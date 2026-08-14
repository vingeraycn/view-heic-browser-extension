# View HEIC 埋点规范与 1.1–1.3 基线审计

更新日期：2026-08-14<br>
埋点协议版本：2

## 结论

旧埋点确实有请求进入当前 GA4 属性，但不适合继续作为产品判断依据：`heic_detected` 与 `conversion_failed` 几乎逐条成对出现，DOM 观察和失败重试被当成了业务事件；客户端还直接包含 Measurement Protocol API Secret，并使用不符合 GA4 严格校验格式的 UUID `client_id`。同时，旧协议没有版本、使用入口和触发方式维度，GA4 里也没有建立自定义定义，因此无法可靠回答 1.1、1.2、1.3 的改版带来了什么。

1.4 的目标不是“把尽可能多的数据都上传”，而是让每条数据都有明确的产品语义，并把采集面控制在解决决策问题所必需的范围内。

## 历史数据基线

下表按版本发布日期切分 GA4 的历史窗口。由于旧事件没有 `extension_version`，它只能视为发布日期附近的混合流量观察，不能当成严格版本队列。

| 观察窗口 | GA4 用户 | `heic_detected` | `conversion_failed` | `conversion_success` | 可得结论 |
| --- | ---: | ---: | ---: | ---: | --- |
| 1.1：2026-07-06 至 07-11 | 105 | 204,249 | 204,164 | 69 | 事件量已被失败循环主导 |
| 1.2：2026-07-13 至 07-31 | 1,471 | 4,385,259 | 4,381,063 | 1,799 | 新功能贡献无法从旧协议拆分；数据污染显著放大 |
| 1.3：2026-08-02 至 08-13 | 63 | 564,850 | 564,815 | 45 | 报告安装量与商店约 3,000 用户严重背离，不能解释为真实用户流失 |

最近 28 天内，GA4 共记录约 896 万事件、1,139 名用户，其中约 448 万次检测与 448 万次失败几乎一一对应，而成功仅 1,485 次。评价提示展示 25 次、关闭 13 次、点击评价 2 次。这个结构说明旧事件更接近“内部尝试次数”，不是“用户完成了什么”。

1.3 窗口只有 63 个报告用户，结合发布包依赖本地环境变量、当前商店版本已有约 3,000 用户，更合理的解释是 1.3 正式包没有启用旧分析配置，少量数据来自仍停留在旧版的用户。它不能用于判断 1.3 的 Popup、Gemini 兼容和失败终态优化是否降低了真实活跃度。

## 核心指标

| 指标 | 定义 | GA4 读取方式 |
| --- | --- | --- |
| 每日活跃安装量 | 某个本地自然日内至少发生一次真实插件活动的假名化安装实例 | `extension_active` 的 Total users；不使用网页语义的全局 Active users 卡片 |
| 转换流程数 | 页面批次、文件选择、拖拽或粘贴的一次完整转换尝试 | `conversion_completed` Event count |
| 转换成功安装量 | 至少完成过一次成功或部分成功转换的安装实例 | `conversion_completed` 过滤 `outcome in (success, partial)` 后的 Total users |
| 转换成功率 | 成功图片数 / 尝试图片数 | `sum(success_count) / sum(attempted_count)` |
| 功能采用率 | 使用某入口的活跃安装量 / 每日活跃安装量 | 按 `surface`、`trigger` 或事件名拆分 Total users |
| 版本健康度 | 每版本的活跃安装量、成功率、失败类型和 P50/P95 耗时 | 按 `extension_version` 分组 |

GA4 原生的 Sessions、Traffic acquisition 和全局 Active users 是网站/应用会话模型。View HEIC 大量工作发生在后台和内容脚本里，Measurement Protocol 又不会自动补齐页面来源、广告点击和浏览器会话上下文，因此这些卡片只作辅助参考。版本归因以显式 `extension_version` 为准。

## 事件协议

所有事件自动携带：

- `extension_version`：扩展版本，例如 `1.4.0`
- `analytics_schema_version`：当前为 `2`
- `session_id`：30 分钟无活动后更新的数字会话标识

| 事件 | 触发时机 | 业务参数 |
| --- | --- | --- |
| `extension_active` | 每个本地自然日首次成功上报其他真实事件时附带一次 | `activity_source`, `engagement_time_msec=1` |
| `extension_installed` | 首次安装 | 无 |
| `extension_updated` | 扩展更新 | 可选 `previous_version` |
| `popup_opened` | Popup 完成状态判断 | `connection_state`, `page_phase`, `site_enabled` |
| `site_preference_changed` | 网站开关成功持久化 | `enabled` |
| `help_opened` | 打开帮助或 FAQ | `surface` |
| `file_converter_opened` | 打开独立文件转换器 | 无 |
| `conversion_completed` | 一个真实转换流程结束，无论成功、部分成功或失败 | `surface`, `trigger`, `outcome`, `attempted_count`, `success_count`, `failure_count`, `duration_ms`, 可选 `error_type` |
| `file_downloaded` | 用户下载转换结果 | 无 |
| `review_prompt_shown` | 评价提示实际展示 | `success_total` |
| `review_prompt_action` | 评价、反馈或关闭 | `action`, `success_total`, `failure_total` |

禁止采集：图片内容、原图或页面 URL、hostname、文件名、页面标题、浏览历史、搜索词、表单内容、用户自定义文本、账户/设备标识和精确位置。

## GA4 自定义定义

事件级自定义维度：

- `extension_version`
- `analytics_schema_version`
- `previous_version`
- `surface`
- `trigger`
- `outcome`
- `error_type`
- `activity_source`
- `connection_state`
- `page_phase`
- `action`
- `enabled`
- `site_enabled`

事件级自定义指标：

- `attempted_count`
- `success_count`
- `failure_count`
- `duration_ms`
- `success_total`
- `failure_total`

自定义定义从创建时开始生效，不会回填历史数据。建议建立一个“版本健康度”探索报告：行使用 `extension_version`，列使用 `surface` 与 `outcome`，值使用活跃安装量、转换流程数、成功率和耗时分位数。发布后先观察 24 小时事件合法性，再观察 7 天同星期结构，至少积累 14 天后再判断版本带来的趋势变化。

## 传输与隐私边界

扩展只向 `WXT_ANALYTICS_ENDPOINT` 指定的第一方代理发送白名单事件。代理检查已发布扩展的 Origin、请求大小、GA 客户端标识格式、事件名、参数名和参数值，再使用服务端 secret 转发到 GA4。扩展包内不得出现 Measurement ID 或 API Secret。

数据共享默认开启，以延续已有产品行为；Popup 提供持久且可见的关闭入口。关闭后不缓存、不补发，并删除本地假名化安装标识、会话和每日活跃状态。重新开启时生成新的标识，无法与关闭前的数据关联。
