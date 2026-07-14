# Quickly AI 学习平台 - 项目概览

## 项目结构

```
Quickly/
├── src/                          # 前端 (React + TypeScript + Vite)
│   ├── components/
│   │   ├── Sidebar.tsx           # 侧边栏导航
│   │   ├── RightPanel.tsx        # 右侧信息面板
│   │   ├── NotesChest.tsx        # 笔记管理页面
│   │   ├── ActiveQuiz.tsx        # 测验弹窗组件
│   │   ├── SettingsPage.tsx      # 设置页面
│   │   └── ToastContainer.tsx    # Toast 通知组件
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
  ├── IndexedDB (Dexie.js)  ← 所有用户数据本地存储
  │   ├── folders          (笔记文件夹)
  │   ├── notes             (学习笔记)
  │   ├── conversations     (对话记录)
  │   ├── messages          (聊天消息)
  │   ├── reviewHistory     (复习/测验历史)
  │   └── appSettings       (用户偏好设置)
  │
  └── Express Server (server.ts)  ← 仅转发 AI API 请求，无状态
      ├── POST /api/chat            AI 问答
      ├── POST /api/quiz            AI 生成测验题
      ├── POST /api/save-note       AI 整理笔记
      ├── POST /api/test-connection 测试 AI 连接
      └── GET  /api/status          服务状态
```

### 为什么选择 IndexedDB？

| 优点 | 说明 |
|------|------|
| **零服务器存储** | 所有学习数据在用户浏览器中，服务器无需数据库 |
| **隐私安全** | 用户的学习笔记、对话记录只存在于自己的电脑上 |
| **离线可用** | 无网络时仍可查看已保存的笔记和复习历史 |
| **一键部署** | `npm install && npm run dev` 即可启动 |
| **零运维** | 无需数据库维护、备份、迁移 |

## 已实现功能

### 前端页面
1. **学习问答页** - AI 聊天、预设问题、知识点标签、自动笔记生成
2. **笔记页** - 笔记列表、搜索、编辑、Markdown 导出、文件夹管理
3. **掌握度页** - 复习统计、掌握度可视化
4. **学习路径页** - 4 级通关路线
5. **复习页** - 基于笔记的智能测验生成
6. **设置页** - 学习目标、提醒、语言、主题、AI 模型配置

### AI 能力
- **多模型支持**: DeepSeek / 通义千问 / 智谱 GLM / Moonshot / Gemini / 自定义
- **三级降级策略**: 用户配置 API → 环境变量 → 内置模拟器
- **结构化输出**: 自动提取知识点标签、生成笔记、计算掌握度影响

### 数据库表 (IndexedDB)
- `folders` - 笔记文件夹
- `notes` - 学习笔记
- `conversations` - 对话会话
- `messages` - 聊天消息
- `reviewHistory` - 复习/测验记录
- `appSettings` - 应用设置 (key-value)

## 快速开始

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

1. **数据位置**: 所有数据存储在浏览器 IndexedDB 中，清除浏览器缓存会丢失数据
2. **API Key**: 用户在设置页面自行配置 API Key，存储在浏览器 localStorage
3. **服务器**: `server.ts` 仅负责转发 AI API 请求和托管静态文件，不存储任何数据
4. **隐私**: 不收集任何用户数据，适合开源和自部署
5. **导出备份**: 笔记支持导出为 Markdown 文件，可手动备份
