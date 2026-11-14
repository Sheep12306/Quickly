export interface MessageSource {
  noteId: string;
  topic: string;
  snippet: string;
}

export interface Message {
  id: string;
  sender: "user" | "system";
  text: string;
  timestamp: string;
  chips?: string[];
  isThinking?: boolean;
  isScopeNotice?: boolean;
  mode?: "ai" | "local";
  sources?: MessageSource[];
}

export interface MasteryScores {
  logisticRegression: number;
  gradientDescent: number;
  regularization: number;
}

export interface NoteFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface NoteItem {
  id: string;
  topic: string;
  content: string;
  timestamp: string;
  folderId?: string; // Optional folder association
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface ReviewRecord {
  id?: string;
  topicId: string;
  topicName: string;
  score: number;
  total: number;
  accuracy: number;
  date: string;
}

// ─── Material Review (upload a study material and generate mixed-type questions) ───

export type QuestionType = "choice" | "truefalse" | "fill" | "short";

export type MaterialQuizPurpose = "formative" | "exam" | "review";

export type BloomLevel = "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";

export interface QuestionTypeCounts {
  choice: number;
  truefalse: number;
  fill: number;
  short: number;
}

export interface MaterialQuestion {
  id: string;
  type: QuestionType;
  question: string;
  cognitiveLevel?: BloomLevel;
  // choice
  options?: string[];
  correctIndex?: number;
  // Parallel to options: what misconception each option represents.
  distractorNotes?: string[];
  // truefalse
  correctBool?: boolean;
  // fill
  acceptableAnswers?: string[];
  // short
  referenceAnswer?: string;
  keywords?: string[];
}

export interface MaterialAnalysis {
  fileName: string;
  charCount: number;
  sentenceCount: number;
  headingCount: number;
  estimatedTotal: number;
  estimatedMinutes: number;
  recommended: QuestionTypeCounts;
  difficulty: "easy" | "medium" | "hard";
}

export interface MaterialQuizResult {
  score: number;
  total: number;
  accuracy: number;
  breakdown: Record<QuestionType, { correct: number; total: number }>;
}

export interface MaterialQuizProgress {
  currentIndex: number;
  graded: boolean;
  finished: boolean;
  choiceSelected: number | null;
  boolSelected: boolean | null;
  fillInput: string;
  shortInput: string;
  selfGrade: number | null;
  score: number;
  correctByType: Record<QuestionType, number>;
  seconds: number;
  completedResult?: MaterialQuizResult | null;
}

export interface MaterialQuizSession extends MaterialQuizProgress {
  id: string;
  materialName: string;
  questions: MaterialQuestion[];
  createdAt: string;
  updatedAt: string;
}

export const EMPTY_MATERIAL_PROGRESS: MaterialQuizProgress = {
  currentIndex: 0,
  graded: false,
  finished: false,
  choiceSelected: null,
  boolSelected: null,
  fillInput: "",
  shortInput: "",
  selfGrade: null,
  score: 0,
  correctByType: { choice: 0, truefalse: 0, fill: 0, short: 0 },
  seconds: 0,
  completedResult: null,
};

export interface ConversationSummary {
  id: string;
  title: string;
  topicTags: string[];
  createdAt: string;
  updatedAt: string;
  noteId?: string;
  messageCount: number;
}

export interface LibraryFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface MaterialPackage {
  id: string;
  name: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialFile {
  id: string;
  packageId: string;
  name: string;
  content: string;
  format: string;
  createdAt: string;
  updatedAt: string;
}

export interface CloudUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AIModelConfig {
  provider: string;       // "deepseek" | "qwen" | "glm" | "moonshot" | "gemini" | "custom"
  name: string;           // 显示名称
  apiKey: string;         // API Key
  apiBase: string;        // API Base URL
  model: string;          // 模型名称
  isConnected: boolean;   // 是否已连接验证
}

export interface IMAKnowledgeBase {
  id: string;
  name: string;
  description?: string;
  contentCount?: number;
}

export interface IMAKnowledgeItem {
  id: string;
  mediaId: string;
  folderId: string;
  title: string;
  parentFolderId: string;
  mediaType: number;
  isFolder: boolean;
  fileNumber?: number;
  folderNumber?: number;
  highlightContent?: string;
}

export interface IMAKnowledgeListResult {
  items: IMAKnowledgeItem[];
  isEnd: boolean;
  nextCursor: string;
}

export type KnowledgeProvider = "ima" | "notion" | "custom";

export interface IMAConfig {
  provider: KnowledgeProvider;
  enabled: boolean;           // 是否启用知识库连接
  mcpUrl: string;             // 自建 / 社区 MCP 服务地址
  clientId: string;           // IMA OpenAPI Client ID / 其他服务的集成 ID
  apiKey: string;             // IMA OpenAPI API Key / 其他服务的集成令牌
  knowledgeBaseId: string;    // 默认知识库 ID
  knowledgeBaseName: string;  // 默认知识库名称
  isConnected: boolean;       // 是否已通过连接测试
}

export const DEFAULT_IMA_CONFIG: IMAConfig = {
  provider: "ima",
  enabled: false,
  mcpUrl: "",
  clientId: "",
  apiKey: "",
  knowledgeBaseId: "",
  knowledgeBaseName: "",
  isConnected: false,
};

export const AI_MODEL_PRESETS: AIModelConfig[] = [
  {
    provider: "deepseek",
    name: "DeepSeek",
    apiKey: "",
    apiBase: "https://api.deepseek.com",
    model: "deepseek-chat",
    isConnected: false
  },
  {
    provider: "qwen",
    name: "通义千问",
    apiKey: "",
    apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-turbo",
    isConnected: false
  },
  {
    provider: "glm",
    name: "智谱 GLM",
    apiKey: "",
    apiBase: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    isConnected: false
  },
  {
    provider: "moonshot",
    name: "Moonshot",
    apiKey: "",
    apiBase: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    isConnected: false
  },
  {
    provider: "gemini",
    name: "Google Gemini",
    apiKey: "",
    apiBase: "",
    model: "gemini-2.0-flash",
    isConnected: false
  },
  {
    provider: "custom",
    name: "自定义接口",
    apiKey: "",
    apiBase: "",
    model: "",
    isConnected: false
  }
];
