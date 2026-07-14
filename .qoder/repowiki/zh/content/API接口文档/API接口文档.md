# API接口文档

<cite>
**本文档引用的文件**
- [backend/app/main.py](file://backend/app/main.py)
- [backend/app/api/__init__.py](file://backend/app/api/__init__.py)
- [backend/app/api/auth.py](file://backend/app/api/auth.py)
- [backend/app/api/chat.py](file://backend/app/api/chat.py)
- [backend/app/api/notes.py](file://backend/app/api/notes.py)
- [backend/app/api/knowledge.py](file://backend/app/api/knowledge.py)
- [backend/app/api/mastery.py](file://backend/app/api/mastery.py)
- [backend/app/api/review.py](file://backend/app/api/review.py)
- [backend/app/api/settings.py](file://backend/app/api/settings.py)
- [backend/app/core/config.py](file://backend/app/core/config.py)
- [backend/app/core/security.py](file://backend/app/core/security.py)
- [backend/app/models/user.py](file://backend/app/models/user.py)
- [backend/app/models/conversation.py](file://backend/app/models/conversation.py)
- [backend/app/models/note.py](file://backend/app/models/note.py)
- [backend/app/models/mastery.py](file://backend/app/models/mastery.py)
- [backend/app/schemas/user.py](file://backend/app/schemas/user.py)
- [backend/app/schemas/conversation.py](file://backend/app/schemas/conversation.py)
- [backend/app/schemas/note.py](file://backend/app/schemas/note.py)
- [backend/app/schemas/mastery.py](file://backend/app/schemas/mastery.py)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介

Quickly是一个基于FastAPI构建的AI学习平台后端服务，提供了完整的RESTful API接口，支持用户认证、智能问答、笔记管理、知识掌握度跟踪、复习提醒和用户设置等功能。该系统采用异步数据库连接和JWT令牌认证机制，为前端应用提供稳定可靠的服务接口。

## 项目结构

后端采用模块化设计，按照功能领域组织代码结构：

```mermaid
graph TB
subgraph "应用入口"
Main[main.py<br/>应用入口点]
Config[config.py<br/>配置管理]
Security[security.py<br/>安全工具]
end
subgraph "API路由"
Auth[auth.py<br/>认证API]
Chat[chat.py<br/>聊天API]
Notes[notes.py<br/>笔记API]
Knowledge[knowledge.py<br/>知识API]
Mastery[mastery.py<br/>掌握度API]
Review[review.py<br/>复习API]
Settings[settings.py<br/>设置API]
end
subgraph "数据模型"
User[user.py<br/>用户模型]
Conversation[conversation.py<br/>对话模型]
Note[note.py<br/>笔记模型]
MasteryModel[mastery.py<br/>掌握度模型]
end
subgraph "数据验证"
UserSchema[user.py<br/>用户Schema]
ChatSchema[conversation.py<br/>聊天Schema]
NoteSchema[note.py<br/>笔记Schema]
MasterySchema[mastery.py<br/>掌握度Schema]
end
Main --> Auth
Main --> Chat
Main --> Notes
Main --> Knowledge
Main --> Mastery
Main --> Review
Main --> Settings
Auth --> User
Chat --> Conversation
Chat --> Note
Chat --> MasteryModel
Notes --> Note
Mastery --> MasteryModel
Review --> MasteryModel
Auth --> UserSchema
Chat --> ChatSchema
Notes --> NoteSchema
Mastery --> MasterySchema
```

**图表来源**
- [backend/app/main.py:1-66](file://backend/app/main.py#L1-L66)
- [backend/app/api/__init__.py:1-8](file://backend/app/api/__init__.py#L1-L8)

**章节来源**
- [backend/app/main.py:1-66](file://backend/app/main.py#L1-L66)
- [backend/app/api/__init__.py:1-8](file://backend/app/api/__init__.py#L1-L8)

## 核心组件

### 应用配置与启动

应用采用FastAPI框架，支持异步数据库连接和CORS跨域访问。主要配置包括：

- **应用信息**: 名称、版本、描述
- **安全配置**: JWT密钥、过期时间、算法
- **数据库配置**: SQLite数据库连接
- **CORS配置**: 允许的源、方法和头部
- **AI配置**: Gemini API密钥支持

### 认证系统

实现基于JWT的用户认证机制，支持密码哈希存储和令牌验证。

**章节来源**
- [backend/app/main.py:26-31](file://backend/app/main.py#L26-L31)
- [backend/app/core/config.py:10-45](file://backend/app/core/config.py#L10-L45)
- [backend/app/core/security.py:54-80](file://backend/app/core/security.py#L54-L80)

## 架构概览

```mermaid
graph LR
subgraph "客户端层"
Frontend[前端应用]
Mobile[移动端应用]
end
subgraph "API网关层"
AuthAPI[认证API]
ChatAPI[聊天API]
NotesAPI[笔记API]
KnowledgeAPI[知识API]
MasteryAPI[掌握度API]
ReviewAPI[复习API]
SettingsAPI[设置API]
end
subgraph "业务逻辑层"
AuthService[认证服务]
ChatService[聊天服务]
NotesService[笔记服务]
KnowledgeService[知识服务]
MasteryService[掌握度服务]
ReviewService[复习服务]
SettingsService[设置服务]
end
subgraph "数据持久层"
Database[(SQLite数据库)]
Redis[(Redis缓存)]
end
Frontend --> AuthAPI
Mobile --> AuthAPI
Frontend --> ChatAPI
Mobile --> ChatAPI
Frontend --> NotesAPI
Mobile --> NotesAPI
AuthAPI --> AuthService
ChatAPI --> ChatService
NotesAPI --> NotesService
KnowledgeAPI --> KnowledgeService
MasteryAPI --> MasteryService
ReviewAPI --> ReviewService
SettingsAPI --> SettingsService
AuthService --> Database
ChatService --> Database
NotesService --> Database
KnowledgeService --> Database
MasteryService --> Database
ReviewService --> Database
SettingsService --> Database
ChatService --> Redis
MasteryService --> Redis
```

**图表来源**
- [backend/app/main.py:42-49](file://backend/app/main.py#L42-L49)
- [backend/app/core/config.py:23-37](file://backend/app/core/config.py#L23-L37)

## 详细组件分析

### 认证API (Authentication)

提供用户注册、登录、个人信息查询和登出功能。

#### 接口规范

**用户注册**
- 方法: POST
- 路径: `/api/auth/register`
- 认证: 无需
- 请求体: 用户注册信息
- 响应: 用户信息

**用户登录**
- 方法: POST
- 路径: `/api/auth/login`
- 认证: 无需
- 请求体: OAuth2密码凭证
- 响应: JWT访问令牌

**获取当前用户信息**
- 方法: GET
- 路径: `/api/auth/me`
- 认证: 需要JWT令牌
- 响应: 用户信息

**用户登出**
- 方法: POST
- 路径: `/api/auth/logout`
- 认证: 需要JWT令牌
- 响应: 成功消息

#### 数据模型

```mermaid
classDiagram
class User {
+int id
+string email
+string username
+string hashed_password
+bool is_active
+datetime created_at
+datetime updated_at
+datetime last_login
}
class UserCreate {
+string email
+string username
+string password
}
class UserResponse {
+int id
+string email
+string username
+string avatar_url
+string bio
+bool is_active
+bool is_verified
+datetime created_at
+datetime last_login
}
class Token {
+string access_token
+string token_type
}
UserCreate --> User : creates
User --> UserResponse : converts to
User --> Token : generates
```

**图表来源**
- [backend/app/models/user.py:11-39](file://backend/app/models/user.py#L11-L39)
- [backend/app/schemas/user.py:16-50](file://backend/app/schemas/user.py#L16-L50)

**章节来源**
- [backend/app/api/auth.py:22-99](file://backend/app/api/auth.py#L22-L99)

### 聊天API (Chat)

实现智能问答功能，支持对话历史管理和自动笔记生成功能。

#### 接口规范

**发送消息**
- 方法: POST
- 路径: `/api/chat/chat`
- 认证: 需要JWT令牌
- 请求体: 聊天请求
- 响应: AI回复和相关数据

**获取对话列表**
- 方法: GET
- 路径: `/api/chat/conversations`
- 认证: 需要JWT令牌
- 查询参数: 无
- 响应: 对话历史列表

**获取对话消息**
- 方法: GET
- 路径: `/api/chat/conversations/{conversation_id}/messages`
- 认证: 需要JWT令牌
- 路径参数: conversation_id
- 响应: 消息列表

#### 智能问答流程

```mermaid
sequenceDiagram
participant Client as 客户端
participant API as Chat API
participant DB as 数据库
participant AI as AI引擎
Client->>API : POST /api/chat/chat
API->>API : 验证用户身份
API->>DB : 查找或创建对话
API->>DB : 保存用户消息
API->>API : 生成AI响应
API->>DB : 保存AI回复
API->>DB : 更新掌握度分数
API->>DB : 提交事务
API-->>Client : 返回AI回复
Note over API,AI : 在模拟模式下使用预定义响应
Note over API,DB : 实际部署时调用外部AI服务
```

**图表来源**
- [backend/app/api/chat.py:78-151](file://backend/app/api/chat.py#L78-L151)

**章节来源**
- [backend/app/api/chat.py:78-252](file://backend/app/api/chat.py#L78-L252)

### 笔记API (Notes)

提供完整的笔记管理系统，支持CRUD操作、搜索功能和分页查询。

#### 接口规范

**获取笔记列表**
- 方法: GET
- 路径: `/api/notes/`
- 认证: 需要JWT令牌
- 查询参数:
  - search: 搜索关键词
  - skip: 跳过数量 (默认0)
  - limit: 限制数量 (默认50, 最大100)
- 响应: 笔记列表

**获取单个笔记**
- 方法: GET
- 路径: `/api/notes/{note_id}`
- 认证: 需要JWT令牌
- 路径参数: note_id
- 响应: 笔记详情

**创建笔记**
- 方法: POST
- 路径: `/api/notes/`
- 认证: 需要JWT令牌
- 请求体: 笔记创建信息
- 响应: 新建笔记

**更新笔记**
- 方法: PUT
- 路径: `/api/notes/{note_id}`
- 认证: 需要JWT令牌
- 路径参数: note_id
- 请求体: 笔记更新信息
- 响应: 更新后的笔记

**删除笔记**
- 方法: DELETE
- 路径: `/api/notes/{note_id}`
- 认证: 需要JWT令牌
- 路径参数: note_id
- 响应: 删除确认

#### 笔记搜索流程

```mermaid
flowchart TD
Start([开始搜索]) --> ValidateParams["验证查询参数"]
ValidateParams --> BuildQuery["构建基础查询"]
BuildQuery --> CheckSearch{"是否有搜索关键词?"}
CheckSearch --> |是| AddSearchFilter["添加搜索过滤条件"]
CheckSearch --> |否| OrderQuery["添加排序条件"]
AddSearchFilter --> OrderQuery
OrderQuery --> AddPagination["添加分页限制"]
AddPagination --> ExecuteQuery["执行数据库查询"]
ExecuteQuery --> ReturnResults["返回搜索结果"]
ReturnResults --> End([结束])
```

**图表来源**
- [backend/app/api/notes.py:20-42](file://backend/app/api/notes.py#L20-L42)

**章节来源**
- [backend/app/api/notes.py:20-133](file://backend/app/api/notes.py#L20-L133)

### 知识API (Knowledge)

管理知识要点信息，支持分类查询和详情获取。

#### 接口规范

**获取知识要点列表**
- 方法: GET
- 路径: `/api/knowledge/`
- 认证: 需要JWT令牌
- 查询参数: category (可选)
- 响应: 知识要点列表

**获取单个知识要点**
- 方法: GET
- 路径: `/api/knowledge/{kp_id}`
- 认证: 需要JWT令牌
- 路径参数: kp_id
- 响应: 知识要点详情

**创建知识要点**
- 方法: POST
- 路径: `/api/knowledge/`
- 认证: 需要JWT令牌
- 请求体: 知识要点创建信息
- 响应: 新建知识要点

**章节来源**
- [backend/app/api/knowledge.py:20-69](file://backend/app/api/knowledge.py#L20-L69)

### 掌握度API (Mastery)

跟踪用户对知识要点的掌握程度，提供测验功能和进度统计。

#### 接口规范

**获取掌握度概览**
- 方法: GET
- 路径: `/api/mastery/overview`
- 认证: 需要JWT令牌
- 响应: 掌握度概览

**获取所有掌握度记录**
- 方法: GET
- 路径: `/api/mastery/`
- 认证: 需要JWT令牌
- 响应: 掌握度记录列表

**获取特定知识要点的掌握度**
- 方法: GET
- 路径: `/api/mastery/{knowledge_point_id}`
- 认证: 需要JWT令牌
- 路径参数: knowledge_point_id
- 响应: 掌握度详情

**提交测验结果**
- 方法: POST
- 路径: `/api/mastery/quiz/{knowledge_point_id}`
- 认证: 需要JWT令牌
- 路径参数: knowledge_point_id
- 查询参数: correct (布尔值)
- 响应: 更新后的掌握度统计

#### 掌握度计算流程

```mermaid
flowchart TD
Start([提交测验结果]) --> LoadRecord["加载掌握度记录"]
LoadRecord --> RecordExists{"记录是否存在?"}
RecordExists --> |否| CreateNew["创建新记录"]
RecordExists --> |是| UpdateExisting["更新现有记录"]
CreateNew --> UpdateStats["更新统计数据"]
UpdateExisting --> UpdateStats
UpdateStats --> CalcScore["计算分数变化"]
CalcScore --> CalcAccuracy["计算准确率"]
CalcAccuracy --> UpdateTimestamp["更新时间戳"]
UpdateTimestamp --> CommitTransaction["提交事务"]
CommitTransaction --> ReturnResult["返回结果"]
ReturnResult --> End([结束])
```

**图表来源**
- [backend/app/api/mastery.py:94-140](file://backend/app/api/mastery.py#L94-L140)

**章节来源**
- [backend/app/api/mastery.py:20-140](file://backend/app/api/mastery.py#L20-L140)

### 复习API (Review)

基于SM-2间隔重复算法的复习提醒系统。

#### 接口规范

**获取今日复习任务**
- 方法: GET
- 路径: `/api/review/tasks`
- 认证: 需要JWT令牌
- 响应: 复习任务列表

**完成复习任务**
- 方法: POST
- 路径: `/api/review/tasks/{task_id}/complete`
- 认证: 需要JWT令牌
- 路径参数: task_id
- 响应: 复习完成信息和下次复习日期

#### 复习调度流程

```mermaid
sequenceDiagram
participant Client as 客户端
participant API as Review API
participant DB as 数据库
participant SM2 as SM-2算法
Client->>API : GET /api/review/tasks
API->>DB : 查询今日未完成任务
DB-->>API : 返回任务列表
API-->>Client : 返回复习任务
Client->>API : POST /api/review/tasks/{task_id}/complete
API->>DB : 标记任务为完成
API->>SM2 : 计算下次复习日期
SM2-->>API : 返回新的复习日期
API->>DB : 创建新复习任务
API-->>Client : 返回完成结果
```

**图表来源**
- [backend/app/api/review.py:21-91](file://backend/app/api/review.py#L21-L91)

**章节来源**
- [backend/app/api/review.py:21-91](file://backend/app/api/review.py#L21-L91)

### 设置API (Settings)

管理用户个人设置和偏好配置。

#### 接口规范

**获取用户设置**
- 方法: GET
- 路径: `/api/settings/`
- 认证: 需要JWT令牌
- 响应: 用户设置

**更新用户设置**
- 方法: PUT
- 路径: `/api/settings/`
- 认证: 需要JWT令牌
- 请求体: 设置更新信息
- 响应: 更新后的设置

**章节来源**
- [backend/app/api/settings.py:19-65](file://backend/app/api/settings.py#L19-L65)

## 依赖关系分析

```mermaid
graph TB
subgraph "外部依赖"
FastAPI[FastAPI框架]
SQLAlchemy[SQLAlchemy ORM]
JWT[jose JWT库]
bcrypt[passlib bcrypt]
Pydantic[Pydantic验证]
end
subgraph "内部模块"
Main[main.py]
Auth[auth.py]
Chat[chat.py]
Notes[notes.py]
Knowledge[knowledge.py]
Mastery[mastery.py]
Review[review.py]
Settings[settings.py]
Security[security.py]
Config[config.py]
end
FastAPI --> Main
SQLAlchemy --> Auth
SQLAlchemy --> Chat
SQLAlchemy --> Notes
SQLAlchemy --> Knowledge
SQLAlchemy --> Mastery
SQLAlchemy --> Review
SQLAlchemy --> Settings
JWT --> Security
bcrypt --> Security
Pydantic --> Auth
Pydantic --> Chat
Pydantic --> Notes
Pydantic --> Knowledge
Pydantic --> Mastery
Main --> Auth
Main --> Chat
Main --> Notes
Main --> Knowledge
Main --> Mastery
Main --> Review
Main --> Settings
Security --> Auth
Security --> Chat
Security --> Notes
Security --> Mastery
Security --> Review
Security --> Settings
```

**图表来源**
- [backend/app/main.py:6-12](file://backend/app/main.py#L6-L12)
- [backend/app/core/security.py:7-16](file://backend/app/core/security.py#L7-L16)

**章节来源**
- [backend/app/main.py:6-12](file://backend/app/main.py#L6-L12)
- [backend/app/core/security.py:1-80](file://backend/app/core/security.py#L1-L80)

## 性能考虑

### 数据库优化

- **异步连接**: 使用aiofiles和异步SQLAlchemy减少I/O等待
- **连接池**: 配置适当的连接池大小和超时设置
- **索引优化**: 为常用查询字段建立索引
- **查询优化**: 使用select()和join()优化复杂查询

### 缓存策略

- **Redis集成**: 支持Redis作为缓存层
- **会话缓存**: 缓存用户会话信息
- **查询结果缓存**: 缓存频繁访问的数据

### API性能

- **分页查询**: 默认限制查询结果数量，防止内存溢出
- **批量操作**: 支持批量数据处理
- **压缩传输**: 支持Gzip压缩减少网络传输

## 故障排除指南

### 常见错误类型

**认证相关错误**
- 401 未授权: 无效的JWT令牌或令牌过期
- 403 禁止访问: 用户权限不足
- 400 错误请求: 认证凭据无效

**数据访问错误**
- 404 未找到: 请求的资源不存在
- 409 冲突: 数据库约束冲突
- 500 服务器内部错误: 服务器异常

**验证错误**
- 422 参数验证失败: 请求数据格式不正确
- 字段长度限制: 用户名、密码等字段长度不符合要求

### 调试建议

1. **检查JWT令牌**: 确保令牌有效且未过期
2. **验证请求格式**: 确认JSON格式正确
3. **检查数据库连接**: 验证数据库连接字符串
4. **查看日志**: 分析服务器日志获取详细错误信息

**章节来源**
- [backend/app/api/auth.py:28-73](file://backend/app/api/auth.py#L28-L73)
- [backend/app/api/chat.py:94-95](file://backend/app/api/chat.py#L94-L95)
- [backend/app/api/notes.py:60-61](file://backend/app/api/notes.py#L60-L61)

## 结论

Quickly API提供了一个完整、健壮的RESTful接口集合，涵盖了现代学习平台所需的核心功能。系统采用模块化设计，具有良好的可扩展性和维护性。通过JWT认证、异步数据库操作和合理的错误处理机制，确保了系统的安全性、性能和可靠性。

## 附录

### API版本控制

系统当前版本为1.0.0，采用语义化版本控制：

- **主版本**: 重大API变更
- **次版本**: 新功能添加
- **修订版本**: Bug修复和小改进

### 向后兼容性

- 新增字段时保持向后兼容
- 不破坏现有API行为
- 提供迁移指南

### 安全最佳实践

- 使用HTTPS传输
- JWT令牌过期管理
- 输入数据验证
- SQL注入防护
- XSS防护措施