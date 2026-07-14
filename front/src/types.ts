export interface Message {
  id: string;
  sender: "user" | "system";
  text: string;
  timestamp: string;
  chips?: string[];
  isThinking?: boolean;
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
  explanation: string;
}

export interface ReviewRecord {
  topicId: string;
  topicName: string;
  score: number;
  total: number;
  accuracy: number;
  date: string;
}

export interface AIModelConfig {
  provider: string;       // "deepseek" | "qwen" | "glm" | "moonshot" | "gemini" | "custom"
  name: string;           // 显示名称
  apiKey: string;         // API Key
  apiBase: string;        // API Base URL
  model: string;          // 模型名称
  isConnected: boolean;   // 是否已连接验证
}

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
