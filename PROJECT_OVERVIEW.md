# Quickly AI 学习平台 - 项目概览

## 项目结构

```
Quickly/
├── src/                          # 前端 (React + TypeScript + Vite)
│   ├── components/
│   │   ├── Sidebar.tsx           # 侧边栏导航
│   │   ├── ChatHistoryPanel.tsx  # 右侧可折叠历史对话栏（IndexedDB 持久化）
│   │   ├── AuthPage.tsx          # 网页版登录/注册
│   │   ├── ImasNotes.tsx         # IMA 笔记（列表/搜索/阅读/新建/追加/重命名/导入本地笔记）
│   │   ├── NotesChest.tsx        # 本地笔记管理页面（兼容/迁移）
│   │   ├── ActiveQuiz.tsx        # 测验弹窗组件
│   │   ├── MaterialReview.tsx    # 资料复习页（上传/粘贴 + 题量与题型配置 + 出题目标 + 断点继续/导出）
│   │   ├── MaterialQuiz.tsx      # 混合题型答题弹窗（认知层级、干扰项分析、结果导出）
│   │   ├── ImasKnowledgeBase.tsx # 知识库（IMA 知识库自动列表、浏览/搜索/打开原文）
│   │   ├── MaterialLibrary.tsx   # 本地旧资料（兼容旧版本资料包/文件夹/文件）
│   │   ├── ProgressHub.tsx       # 计划页（笔记掌握度反馈 + 目标计划）
│   │   ├── SettingsPage.tsx      # 设置页面
│   │   └── ToastContainer.tsx    # Toast 通知组件
│   ├── utils/
│   │   ├── materialAnalysis.ts   # 本地估算资料题量与推荐题型结构
│   │   ├── exportQuiz.ts         # 复习题导出（Word 兼容 .doc / 打印为 PDF）
│   │   ├── readTextFile.ts       # 文本资料读取（UTF-8/GB18030 编码兜底）
│   │   └── extractMaterial.ts    # 资料文本提取（PDF / DOCX / 文本）
│   ├── hooks/
│   │   └── useReminder.ts        # 学习提醒 Hook
│   ├── i18n/
│   │   ├── index.tsx             # 国际化 Provider
│   │   ├── zh-CN.ts              # 简体中文
│   │   └── en-US.ts              # English
│   ├── App.tsx                   # 主应用组件
│   ├── main.tsx                  # 入口文件
│   ├── db.ts                     # IndexedDB 数据层 (Dexie.js)
│   ├── types.ts                  # TypeScript 类型定义
│   └── index.css                 # 全局样式
├── server.ts                     # Express 服务 (AI 代理 + 静态文件)
├── package.json                  # 项目依赖
├── vite.config.ts                # Vite 配置
├── tsconfig.json                 # TypeScript 配置
├── .env.example                  # 环境变量示例
└── README.md
```

## 技术栈

- **框架**: React 19 + TypeScript
- **构建**: Vite 6
- **服务端**: Express (Node.js) — 轻量 AI API 代理
- **样式**: Tailwind CSS 4
- **图标**: Lucide React
- **动画**: Motion (Framer Motion)
- **本地存储**: IndexedDB (Dexie.js) — 数据完全存储在浏览器端
- **AI**: Google Gemini API / 兼容 OpenAI 接口的任意模型

## 架构设计

```
浏览器 (React SPA)
  ├── IndexedDB (Dexie.js)  ← 本地缓存 / 旧版本地数据 / 离线可用
  │   ├── notes / folders
  │   ├── conversations / messages
  │   ├── reviewHistory
  │   └── appSettings
  │
  ├── 登录账号 (AuthPage)
  │   └── 账号数据快照（目标、复习记录、对话、设置、本地笔记、资料库文件、答题记录）
  │
  └── Express Server (server.ts)
      ├── SQLite (data/quickly.db)  ← 只存账号与少量元数据，不存 IMA 内容
      ├── POST /api/auth/register|login|logout
      ├── GET  /api/auth/me
      ├── GET/PUT /api/user-data/snapshot   三元合并 + 乐观并发（baseUpdatedAt，冲突返回 409）
      ├── GET  /api/user-data/snapshot/meta 轻量轮询远端版本
      ├── POST /api/chat            AI 问答
      ├── POST /api/quiz            AI 生成测验题
      ├── POST /api/material-quiz   基于上传资料生成混合题型复习题（Bloom 层级 + 干扰项分析）
      ├── POST /api/analyze-note-source  链接/截图 → AI 整理为笔记
      ├── POST /api/ima/test-connection  校验 IMA OpenAPI 凭证并列出知识库
      ├── POST /api/ima/knowledge-bases  自动加载用户的 IMA 知识库
      ├── POST /api/ima/knowledge-list   浏览知识库/文件夹内容
      ├── POST /api/ima/search-knowledge 在 IMA 知识库内搜索
      ├── POST /api/ima/media-info       获取笔记正文 / 判断文件是否可读
      ├── POST /api/ima/file             代理流式读取 IMA 文件原文
      ├── POST /api/ima/create-knowledge-base / create-folder / rename-knowledge / move-knowledge
      ├── POST /api/ima/import-urls / add-note-to-kb / tags / tag-add / tag-remove
      ├── POST /api/ima/notebooks / notes / search-notes / note-content
      ├── POST /api/ima/create-note / append-note / rename-note / rename-notebook
      ├── POST /api/organize-material    多条笔记 → 一份完整资料
      ├── POST /api/mcp/sync        浏览器资料库快照同步给 MCP 桥（登录态或 MCP 令牌）
      ├── GET  /api/mcp/imports     外部 Agent 导入队列（需鉴权）
      ├── GET  /api/mcp/token       获取当前账号的 MCP 访问令牌
      ├── POST /api/mcp/token/rotate 重置 MCP 令牌
      ├── POST /mcp                 MCP Streamable HTTP（需 Bearer 令牌；import_to_library / search_library / list_library_packages）
      ├── POST /api/save-note       AI 整理笔记
      ├── POST /api/test-connection 测试 AI 连接
      └── GET  /api/status          服务状态
```

### 存储分工

| 数据 | 位置 |
|------|------|
| 笔记正文 / 知识库文件 | IMA |
| 账号、学习目标、复习记录、对话、设置、本地笔记、资料库文件、答题记录快照 | 服务端 SQLite（`data/quickly.db`，三元合并同步） |
| 浏览器本地缓存 / 离线数据 / 旧版本地资料 | IndexedDB |
| AI Key / IMA Key | 浏览器 localStorage（按账号隔离，BYOK） |

这样服务器只承担账号和小体积元数据（快照上限 25MB），不承担 IMA 笔记/知识库正文存储。

## 已实现功能

### 前端页面
1. **学习问答页** - AI 聊天、预设问题、知识点标签、自动笔记生成；顶部可选择检索范围（全部笔记、本地笔记文件夹/单篇笔记、IMA 笔记本、IMA 知识库），提问优先在该范围内检索；支持保存到笔记确认弹框（选择本地文件夹或 IMA 笔记本、是否 AI 整理）；右侧可折叠历史对话栏；顶部任务进度条已移除
2. **笔记页** - 默认接入 IMA 笔记：列出笔记本/笔记、按标题或正文搜索、阅读正文、新建笔记、追加内容（支持加粗/斜体/下划线/高亮 Markdown 工具栏，效果在 IMA 客户端查看）、重命名笔记/笔记本、把本地笔记导入 IMA（已存在同标题会跳过）；IMA 暂不支持 API 删除，删除提示到 IMA 客户端操作。同时保留「本地笔记」作为旧数据和迁移来源：卡片式列表、搜索高亮、编辑、导出 Word、导入 Word/PDF 等笔记文件、删除撤销、文件夹管理、多选整理为资料、链接/截图 AI 整理；全部笔记视图显示文件夹卡片，只单独列出未分类笔记
3. **复习页** - 以笔记复习为主：文件夹可折叠，可直接复习整个文件夹或其中单篇笔记；「基于资料复习」区域与笔记复习卡片风格一致，下方可折叠显示账号历史题单，支持继续答题、重新刷题、删除，并在完成时写入复习记录（上传/粘贴复习资料，自动估算题量并推荐题型结构，可自由勾选并调整选择题、判断题、填空题、简答题数量）；支持出题目标（复习巩固/单元测验/综合复习）、Bloom 认知层级标注、选择题干扰项误解分析、自动判分与简答自评；不生成答案解析以节省 token；生成后先展示结果面板，可预览自测卷版式，点击「开始做题」进入答题，关闭答题窗口保留进度可继续；复习题可按自测卷版式导出 Word（.doc）或通过打印另存为 PDF（按题型分节、连续编号、参考答案后置、附认知层级细目表）
4. **知识库页** - 直接连接 IMA：自动加载知识库列表，支持浏览文件夹、搜索、阅读笔记正文、代理打开 PDF/Word 等原文；支持新建知识库、新建文件夹、导入 URL、重命名、移动、添加标签；删除统一提示到 IMA 客户端。本地旧资料保留在「本地旧资料」兼容视图中，不再作为知识库主存储
5. **计划页** - 按笔记查看近期复习正确率、趋势和复习次数，并可为笔记设定目标正确率、复习次数与截止日期；学习时长目标（每日/每周）已从设置页移到这里
6. **设置页** - 提醒、语言、主题、AI 模型配置、知识库连接配置；修改即时生效，不再依赖「保存设置」按钮；AI / IMA API Key 使用 AES-GCM 加密后存储，密钥保存在浏览器 IndexedDB，设置页不可查看、不可复制
7. **网页账号** - 注册/登录；SQLite 保存账号和学习数据快照；服务端不保存 IMA 内容；AI/IMA Key 按账号隔离在浏览器 localStorage（BYOK）。同步采用「基础快照 / 本地 / 远端」三元合并 + 乐观并发：多设备同时编辑会合并，删除可传播，冲突时较新的记录优先；推送前先拉取远端，拉取失败时绝不推送，避免覆盖云端数据

### AI 能力
- **多模型支持**: DeepSeek / 通义千问 / 智谱 GLM / Moonshot / Gemini / 自定义
- **内置模型 API**: 服务端读取 `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL`（Anthropic 兼容接口），无需用户配置 Key 即可使用
- **学习页 AI 开关**: 只有一个「AI 增强」开关；开启时基于所选范围用 AI 回答，关闭时走本地/所选范围检索并展示来源
- **多级降级策略**: 用户配置 API → 环境变量 Gemini → 内置 Anthropic 兼容接口 → 本地模拟
- **结构化输出**: 自动提取知识点标签、生成笔记、计算掌握度影响

### 数据库表 (IndexedDB)
- `folders` - 笔记文件夹
- `notes` - 学习笔记
- `conversations` - 对话会话（标题、消息数、关联笔记、更新时间）
- `messages` - 聊天消息（历史对话持久化，含 AI/本地检索模式与来源片段）
- `reviewHistory` - 复习/测验记录
- `appSettings` - 应用设置 (key-value，包含学习目标计划 `studyGoals`)
- `libraryFolders` - 本地旧资料文件夹（兼容保留，知识库主存储已改为 IMA）
- `materialPackages` - 本地旧资料包（兼容保留）
- `materialFiles` - 本地旧资料文件（兼容保留）
- `materialQuizSessions` - 基于资料复习的历史题单（题目、答题进度、得分）
- `materials` - 旧版平铺资料表（v3 升级时迁移到资料包/文件）
- `syncState` - 每个账号最后一次同步成功的基础快照（三元合并用的共同祖先，用于跨刷新传播删除）

### 数据库表 (服务端 SQLite, `data/quickly.db`)
- `users` - 账号（id、email、name、password_hash、created_at）
- `sessions` - 登录会话（HttpOnly Cookie）
- `user_data` - 每个账号的数据快照（含版本时间戳，用于乐观并发）
- `mcp_tokens` - 每个账号的 MCP 外接访问令牌（可重置，令牌失效即时生效）

### MCP 外部接入
- 服务端提供 Streamable HTTP MCP 端点 `POST /mcp`，工具包括：
  - `import_to_library`：外部 Agent 一键把资料导入资料库（先入队，Quickly 打开/聚焦时自动同步）
  - `search_library`：检索已同步的资料库内容
  - `list_library_packages`：列出资料包
- 目前 MCP 仍面向本地旧资料；IMA 工具可在后续接入（需要为 MCP 配置独立的 IMA 凭证）
- 所有 MCP 端点都需要鉴权：浏览器使用登录 Cookie，外部 Agent 使用 `Authorization: Bearer <token>`；令牌可在新建笔记弹窗的 MCP 区域查看/复制/重置
- 资料库按账号隔离存放在 `data/mcp-store-<userId>.json`（已 gitignore），不同账号互不可见
- 新建笔记弹窗内可直接复制带令牌的 MCP 配置 JSON

## 快速开始

### 环境要求
- Node.js 22.5+（使用内置 `node:sqlite`；推荐 Node 24）
- 首次启动会在 `data/quickly.db` 自动创建账号/元数据表

### 本地启动（开发模式）
```bash
cd Quickly
npm install
npm run dev
# 访问 http://localhost:3000
```

### 服务器部署
```bash
npm install
npm run build
npm start
# 生产模式运行在 http://localhost:3000
```

### 配置 AI 模型
在应用内的设置页面填写任意兼容 OpenAI 接口的 API Key，或通过环境变量配置：

```bash
# .env 文件
GEMINI_API_KEY=your-gemini-api-key
```

支持的模型服务商：DeepSeek、通义千问 (Qwen)、智谱 GLM、Moonshot、Google Gemini、自定义兼容接口。

## 注意事项

1. **数据位置**: 账号元数据（目标、复习记录、对话、设置快照）存在服务端 SQLite；笔记和知识库内容以 IMA 为准；IndexedDB 作为本地缓存和旧数据兼容层
2. **API Key**: AI / IMA 凭证由用户自备（BYOK），按账号隔离保存在浏览器 localStorage（`quickly_ai_config`、`quickly_ima_config`），不上传到服务端
3. **服务器**: `server.ts` 负责账号、元数据快照、AI / IMA 代理和静态文件；不保存笔记或知识库正文
4. **隐私**: 笔记/知识库内容存储在腾讯 IMA；服务端只保存账号邮箱、密码哈希和少量元数据
5. **导出备份**: 笔记支持导出为 Markdown 文件，可手动备份
6. **知识库**: IMA 目前不支持通过 API 删除知识库/文件/笔记，删除需到 IMA 客户端操作
7. **生产部署**: 使用 HTTPS 时设置 `COOKIE_SECURE=true`；SQLite 数据库在 `data/quickly.db`，需要纳入备份
