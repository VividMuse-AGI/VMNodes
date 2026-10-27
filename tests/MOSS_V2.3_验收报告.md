# VM MOSS Layout Studio · V2.3 修复后验收报告

验收日期：2026-10-27。结论：**V2.3 通过本报告范围内的完整验收**。独立复核提出的三个问题均已修复，设计第六章的 3 组、8 个编号验收子项通过；完整现有浏览器、全仓单元、前端及真实 ComfyUI API 套件无失败。此结论替代修复前报告的结论和统计。

## 对象、环境与证据

- 对象：本地 ComfyUI 安装中的 VMNodes，源码与本次提交一致。
- 依据：《moss_image_layout_node_design.md》 第六章，兼跑此前版本全部现有自动化用例。
- 实测环境：ComfyUI **0.43.0**、实际前端包 **1.57.4**、Python **3.11.9**、Node **22.22.2**、Playwright 独立无头 Chrome；独立 CPU 测试实例 `127.0.0.1:8207`，加载本机安装代码。
- 随仓证据：[moss_v23_20261027](evidence/moss_v23_20261027)。包含逐项结果、执行日志、实际输出、审核截图及 [源码 SHA256 和验收摘要](evidence/moss_v23_20261027/verification_summary.json)。修复前源码与完整原始截图保留在本地验收归档。
- 本次提交包含 V2.3 实现、复核修复、测试和文档；其余本地工作区改动保留。

## 三项问题及回归闭环

| 问题 | 修复 | 回归证据 |
| --- | --- | --- |
| F01 / P1：执行回填替换状态后，已打开抽屉继续编辑仍写旧对象，导致文字/描述不保存 | 输入时通过稳定框 ID 查找当前 `S.state.boxes` 对象；目标已删除时忽略旧输入事件 | 单元覆盖回填、连续替换、删除目标；真实浏览器连线执行 → 保持抽屉打开 → 修改多行文字和样式 → 再次真实排队执行，最终 `layout_prompt` 含手动编辑 |
| F02 / P2：顶部 `global_prompt` 太小且不能拖高 | 保留原生 STRING 控件，默认实际高度 84px、最小 64px、纵向拖高；高度存节点 properties 并重载恢复；按原生控件 margin 预留上下空间 | 实际鼠标拖动从 84px 到 216px，节点高度从 1027px 到 1159px；输入框完全位于 DOM 分配区内，下一行同步选项可见；重载高度和多行文本不丢失 |
| F03 / P3：参考线默认状态偏离设计 | 无已存配置时三分线开、黄金线关；显式保存的 false 不被默认值覆盖 | 新建、旧工作流无配置、用户关闭后保存/重载均覆盖 |

首轮新增回归曾对修复前源码运行：135 项中 129 通过、6 项失败，命中旧实现缺陷（见 [baseline_regressions.txt](evidence/moss_v23_20261027/baseline_regressions.txt)）。随后截图复核发现顶部 textarea 超出原生布局边距的问题，补足 margin 计算与两条检查，最终前端 136 项、浏览器 146 项全部通过。该负对照是修复前证据，不计入最终通过项。

## 最终执行结果与计数口径

| 套件 | 完整执行入口 | 最终结果 | 证据 |
| --- | --- | --- | --- |
| 全仓 Python 单元 | `python -m unittest discover -s tests` | **110 / 110**，退出码 0 | [unittest_final.log](evidence/moss_v23_20261027/unittest_final.txt) |
| MOSS 前端 | `node tests/moss_frontend.cjs` | **136 / 136**，退出码 0 | [frontend_final.log](evidence/moss_v23_20261027/frontend_final.txt) |
| 通用前端 | `node tests/frontend.cjs` | **9 / 9**，退出码 0 | [frontend_general_final.log](evidence/moss_v23_20261027/frontend_general_final.txt) |
| 完整浏览器 E2E | `node tests/moss_ui_e2e.js` | **146 / 146**，退出码 0 | [result.json](evidence/moss_v23_20261027/browser_result.json)、[browser_final.log](evidence/moss_v23_20261027/browser_final.txt) |
| 真实 ComfyUI API | `python tests/moss_live_api.py` | **41 / 41**，退出码 0 | [checks.json](evidence/moss_v23_20261027/api_checks.json)、[api_final.log](evidence/moss_v23_20261027/api_final.txt) |

**不把这些数字相加作为独立验收条目总数**：Python 套件包含调用 MOSS 前端套件的测试，浏览器/API 也覆盖相同功能。全仓执行未设置 `PYTHONUTF8`；Node 子进程输出由测试脚本显式按 UTF-8 解码，避免依赖 Windows 默认 GBK。部分 Python 控制台中文在 PowerShell 重定向日志中仍有显示乱码，以退出码、英文汇总和 UTF-8 结构化 JSON 为准。

相较修复前脚本，Python 108 → 110；MOSS 前端 130 → 136；浏览器 136 → 146；API 38 → 41。通用前端仍为 9。此前基础浏览器 62 项及 V2.1/V2.2/V2.3 已有场景均保留在完整脚本内执行，未以局部新增检查替代完整复跑。

## 第六章增量清单：3 组、8 个编号子项

| 编号 | 设计要求 | 最终核验 |
| --- | --- | --- |
| 1.1 | 两个独立参考线按钮，状态随工作流保存 | 通过：新建默认值、各自切换、同时启用/关闭、保存重载；兼验拖动磁吸 |
| 1.2 | 顶层白色虚线、三分/黄金比例及四个焦点 | 通过：不透明框覆盖下像素采样、分割位置、焦点十字、缩放绘制 |
| 1.3 | 参考线不进入 layout_prompt / draft_json | 通过：前端导出不变、layout_data 无参考线状态，后端输出契约通过 |
| 2.1 | 每行展开按钮、单一全宽多行抽屉 | 通过：文字/描述字段、角色/物体字段差异、选中跟随、展开收起及拖高 |
| 2.2 | 编辑双向同步，不异常撑坏节点 | 通过：行输入/抽屉/状态同步；新增真实执行回填后编辑及再次输出验证 |
| 3.1 | global_prompt_in 接外部字符串，执行输出和前端回填 | 通过：真实 STRING 连线、summary.caption、WebSocket onExecuted 更新 |
| 3.2 | box_texts_in 标签/顺序语法及实时回填 | 通过：标签、顺序、换行、样式、未知标签、外部布局优先级及真实回填 |
| 3.3 | 中英文词条与 locales 对齐 | 通过：I18N.zh / I18N.en **各 143 键**，键集合一致；端口名称/tooltip 注册检查通过 |

顶部全局描述的默认加高、可拖高属于第六章正文要求，已额外验证，不将其误写成清单只有 6 条。

## 测试脚本与文档修正

1. 弹窗“关闭”定位限定在 `.vmmoss-modal`，避免与 ComfyUI minimap 的关闭按钮重名而中断完整浏览器测试。
2. Python 中两处 Node 子进程调用显式 `encoding="utf-8"`，消除默认 GBK 下原先的解码错误。
3. 参考线用例分别验证“新建默认开启”和“用户可关闭”，不再用手动关闭后的状态冒充默认值检查。
4. 新增全局描述真实拖高、原生控件分配区边界、持久化，以及真实排队回填后编辑/再输出测试；前端补多次替换、目标删除及 margin 变化回归。
5. 修正原报告 `412/412` 的混合统计、109 键及 6 子项错误；实际前端版本据 `/system_stats` 与安装包更新为 1.57.4。
6. 同步修正中英文节点文档、CHANGELOG 和 `apply_box_texts` 注释，说明外部文本实际覆盖语义。

## 外部文案的实际使用语义

`box_texts_in` 仍保持连接时，每次执行都以外部传入内容覆盖其对应字段。外部文本没有变化，不代表节点内的手动改字会被保留；仅当当前字段已经与外部值相同，才无需再发送同步更新。想长期保留手动改字，应断开该文案输入或同步修改上游文本。

本轮浏览器验证手动编辑可保存并进入下一次真实输出时，仅保留 `global_prompt_in`，避免把预期的外部文案覆盖误判为 F01。API 另行验证保留 `box_texts_in` 时外部内容仍具有优先权。

## 证据与验收边界

- [再次真实执行的 layout_prompt](evidence/moss_v23_20261027/execution_edit_output.json)：包含执行后手动修改的两行文字及样式。
- [最终完整节点截图](evidence/moss_v23_20261027/ui_full.jpg)、[画布与抽屉截图](evidence/moss_v23_20261027/ui_node.jpg)；缩放原始截图保留于本地归档。审核使用单张压缩预览，原图保留；最终可见 textarea 与下一行无遮挡。
- 本轮浏览器/API 使用真实本地 ComfyUI、真实连线和执行输出，未运行扩散模型生成图片，结论不等于保证模型逐像素遵循布局或所有 ComfyUI 前端版本兼容。
- V2.2 原生系统 EyeDropper 的桌面全屏拾色/Esc 人工操作沿用 2026-10-25 的历史验收，本轮自动化覆盖入口、取消/降级及内建取色，没有将历史桌面操作计为本轮新通过项目。
- 修复已落在本地安装目录。使用正在打开的 ComfyUI 页面时刷新以加载最新前端脚本；本次代码推送不额外创建版本标签或 GitHub Release。
