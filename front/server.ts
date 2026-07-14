import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

app.use(express.json());

// Lazy-initialized Gemini Client (for env-based fallback)
let aiClient: GoogleGenAI | null = null;
const isProduction = process.env.NODE_ENV === "production";

function getAIClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY" || key === "") {
      console.log("No valid GEMINI_API_KEY found. Quickly is running in high-fidelity simulator mode.");
      return null;
    }
    try {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    } catch (e) {
      console.error("Failed to initialize GoogleGenAI:", e);
      return null;
    }
  }
  return aiClient;
}

// ---- OpenAI-Compatible API Call Helper ----
interface ModelConfig {
  provider: string;
  apiKey: string;
  apiBase: string;
  model: string;
}

async function callOpenAICompatible(config: ModelConfig, messages: Array<{role: string; content: string}>, jsonSchema?: any): Promise<string> {
  const url = `${config.apiBase.replace(/\/$/, "")}/chat/completions`;
  const body: any = {
    model: config.model,
    messages,
    temperature: 0.7,
  };
  if (jsonSchema) {
    body.response_format = { type: "json_object" };
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGeminiAPI(apiKey: string, model: string, prompt: string, responseSchema: any): Promise<string> {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: model || "gemini-2.0-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });
  return response.text || "";
}

// Simulated predefined materials
const simulatedResponses = [
  {
    keywords: ["二分类", "sigmoid", "二", "为什么", "逻辑回归", "logistic"],
    text: `逻辑回归非常适合**二分类问题**，因为它输出的概率值在 **0 到 1** 之间，直接对应两类结果（例如：是/否，垃圾邮件/非垃圾邮件）。

它使用 **Sigmoid 函数** 将原始的线性预测压缩到这个概率范围内：
$$S(z) = \\frac{1}{1 + e^{-z}}$$

然后我们应用一个 **决策边界**（通常是 0.5）来对输出进行分类：
* 如果概率大于 0.5，则属于类别 1（正类）；
* 否则属于类别 0（负类）。

#### 与线性回归的区别
1. **有界输出**：线性回归预测值在 $[-\\infty, +\\infty]$，而逻辑回归输出 $[0, 1]$。
2. **鲁棒性（对异常值不敏感）**：线性回归容易被极值拉偏决策边界，而 Sigmoid 函数具有饱和性，对两端的异常样本非常稳定。`,
    chips: ["逻辑回归", "Sigmoid 函数", "决策边界"],
    autoNote: "使用 sigmoid 曲线将预测值映射到 0-1 范围的概率分类，配合决策边界达成类别预测判定。",
    topicMasteryImpact: {
      logisticRegression: 8,
      gradientDescent: 2,
      regularization: 0
    },
    nextSuggestion: {
      concept: "复习梯度下降",
      detail: "逻辑回归的参数（W和b）需要通过损失函数与梯度下降逐步优化迭代来寻找最优点。"
    }
  },
  {
    keywords: ["梯度", "下降", "优化", "损失", "learning rate", "学习率", "steps"],
    text: `**梯度下降 (Gradient Descent)** 是优化机器学习模型最核心的算法。其核心目标是寻找一组参数（权重和偏置），让损失函数（Loss Function）的值达到最小值。

### 核心计算公式
1. **计算损失梯度**：求解当前参数下的微分向量 $\\nabla J(\\theta)$。
2. **反向更新参数**：逆着梯度的最高上升方向，以学习率（Learning Rate, $\\eta$）为步长移动：
   $$\\theta = \\theta - \\eta \\cdot \\nabla J(\\theta)$$

### 优化参数时的核心要素
- **学习率太大**：会导致步子迈得过大，参数跳来跳去甚至发散，永远无法收敛。
- **学习率太小**：参数更新缓慢，需要极其漫长的算力开销，且容易卡在局部最优点中。

梯度就像是一个在迷雾笼罩的山脉中的旅行者，通过脚底感知地面的倾斜角度（即梯度），每次都向下坡最陡的方向跨出一步，最终摸索下到谷底最优。`,
    chips: ["梯度下降", "学习率", "参数迭代"],
    autoNote: "梯度下降通过求解损失梯度，向着负梯度方向以指定步幅乘积更新权重，实现损失極小化。",
    topicMasteryImpact: {
      logisticRegression: 2,
      gradientDescent: 10,
      regularization: 1
    },
    nextSuggestion: {
      concept: "开始正则化学习",
      detail: "在熟练参数搜索（优化算法）之后，可通过对其添加正则约束项（L1/L2）以防止模型过拟合。"
    }
  },
  {
    keywords: ["正则化", "l1", "l2", "过拟合", "regularization", "惩罚", "过拟"],
    text: `**正则化 (Regularization)** 是一种用于防止模型在训练集上“学得太彻底”，从而失去在新测试数据上推广表现（即**过拟合 Overfitting**）的关键技术。

其原理是在原本的误差损失函数之后强行挂载一个**惩罚项 (Penalty Terms)**，约束特征权重的膨胀。

### 最常见的两种正则化：L1 & L2
| 属性 | L1 正则化 (Lasso) | L2 正则化 (Ridge) |
| :--- | :--- | :--- |
| **惩罚公式** | 权重绝对值之和 $\\lambda \\sum |w_j|$ | 权重平方和之半 $\\frac{\\lambda}{2} \\sum w_j^2$ |
| **数学效果** | 促使权重回归 **0** 向量。自带“特征挑选”效果。 | 促使权重**整体收缩变小**，曲线平滑舒缓。 |
| **主要功能** | 构建高维稀疏特征集，去除无用信息。 | 广泛防备多重共线性，控制大权重对抗噪声。 |

正则化就像是在模型的考卷上面添加“书写整洁加分”，如果模型的代码（公式参数）写得太繁杂庞大，即使全部预测对了也会被严厉扣分。促使它必须寻找更具通用、最简明的方法去解决复杂问题。`,
    chips: ["正则化", "L1/L2 惩罚", "防止过拟合"],
    autoNote: "正则化通过在损失函数上绑定权重大小惩罚挂载，对抗参数失控膨胀，保障测试集泛化度。",
    topicMasteryImpact: {
      logisticRegression: 1,
      gradientDescent: 3,
      regularization: 12
    },
    nextSuggestion: {
      concept: "复习逻辑回归",
      detail: "将正则化约束融入逻辑回归（L-logistic），即可直接部署出一个结构最健壮的高鲁棒二分类应用。"
    }
  }
];

// Helper to provide nice responses
function getSimulatedResponse(question: string) {
  const qLower = question.toLowerCase();
  for (const item of simulatedResponses) {
    if (item.keywords.some(k => qLower.includes(k))) {
      return item;
    }
  }
  return {
    text: `感谢您提出关于机器学习的这一高质量技术问题：**“${question}”**。

这在机器学习知识体系中是一个非常有价值的方向。我们可以将这个概念拆解、提炼如下：

### 核心知识点梳理
- **基本原理解构**：涉及特征加权、基函数映射以及期望损失极小化的理论体系。
- **参数收敛路径**：通过损失函数的凸性偏导及自适应变化速率，稳健逼近全局极小解。
- **泛化边界约束**：通过调整超参数及结构正则因数来平衡模型复杂度，有效防范过拟合。

我们将本次讨论的关键要点整理并同步到了您的右侧自动备忘录中。您可以随时结合下方的交互式练习，对这些理论内容进行实践自测！`,
    chips: ["自主探索", "机器学习脉络", "边界决策分析"],
    autoNote: `关于“${question.substring(0, 10)}”的答疑脉络，核心特征已智能保存至您名下的笔记本中。`,
    topicMasteryImpact: {
      logisticRegression: 3,
      gradientDescent: 3,
      regularization: 3
    },
    nextSuggestion: {
      concept: "针对性小练习",
      detail: "练习是快速巩固新概念的捷径，点击右下角亮黄色按钮，开启10分钟速成突击！"
    }
  };
}

// 0. Test Connection API
app.post("/api/test-connection", async (req, res) => {
  const config: ModelConfig = req.body;
  if (!config || !config.apiKey) {
    return res.json({ success: false, error: "API Key 未填写" });
  }
  try {
    if (config.provider === "gemini") {
      const result = await callGeminiAPI(config.apiKey, config.model, "Say hello in one word.", {
        type: Type.OBJECT,
        properties: { greeting: { type: Type.STRING } },
        required: ["greeting"],
      });
      return res.json({ success: true, model: config.model });
    } else {
      if (!config.apiBase) {
        return res.json({ success: false, error: "API 地址未填写" });
      }
      const result = await callOpenAICompatible(config, [
        { role: "user", content: "Say hello in one word." },
      ]);
      return res.json({ success: true, model: config.model });
    }
  } catch (error: any) {
    console.error("Test connection failed:", error.message);
    return res.json({ success: false, error: error.message || "连接失败" });
  }
});

// 1. Get Status API
app.get("/api/status", (req, res) => {
  const client = getAIClient();
  res.json({
    hasApiKey: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY",
    mode: client ? "gemini" : "simulator",
  });
});

// 2. Chat API - supports user-configured model, env Gemini, or simulator
app.post("/api/chat", async (req, res) => {
  const { question, modelConfig: reqModelConfig } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Question is required." });
  }

  // The chat prompt for structured response
  const chatPrompt = `You are an elite AI learning assistant in Quickly, a high-tech minimalist platform for learning machine learning.
The user is studying machine learning with focus on Logistic Regression (逻辑回归), Gradient Descent (梯度下降), and Regularization (正则化).
They asked the following question: "${question}".

Provide a highly professional, accurate, and structured answer in Chinese. Use elegant markdown formatting. Keep explanations structured, concise, and focused on mathematical or intuitive precision (Swiss high-tech aesthetic).

You MUST respond strictly in the following JSON template format, and nothing else (no extra text outside the JSON block so we can parse it directly):
{
  "text": "Your detailed explanation and answer in Chinese. Use elegant markdown.",
  "chips": ["term1", "term2", "term3"],
  "autoNote": "A very short summary of the core concept. Limit to 15-20 Chinese words.",
  "topicMasteryImpact": {
    "logisticRegression": 5,
    "gradientDescent": 3,
    "regularization": 2
  },
  "nextSuggestion": {
    "concept": "Name of highly relevant next concept to learn",
    "detail": "A very brief, supportive explanation of why this complements their learning."
  }
}`;

  // Priority 1: User-configured model from frontend
  if (reqModelConfig && reqModelConfig.apiKey) {
    try {
      let data: any;
      if (reqModelConfig.provider === "gemini") {
        const chatSchema = {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            chips: { type: Type.ARRAY, items: { type: Type.STRING } },
            autoNote: { type: Type.STRING },
            topicMasteryImpact: {
              type: Type.OBJECT,
              properties: {
                logisticRegression: { type: Type.NUMBER },
                gradientDescent: { type: Type.NUMBER },
                regularization: { type: Type.NUMBER },
              },
              required: ["logisticRegression", "gradientDescent", "regularization"],
            },
            nextSuggestion: {
              type: Type.OBJECT,
              properties: { concept: { type: Type.STRING }, detail: { type: Type.STRING } },
              required: ["concept", "detail"],
            },
          },
          required: ["text", "chips", "autoNote", "topicMasteryImpact", "nextSuggestion"],
        };
        const bodyText = await callGeminiAPI(reqModelConfig.apiKey, reqModelConfig.model, chatPrompt, chatSchema);
        if (!bodyText) throw new Error("Empty Gemini response");
        data = JSON.parse(bodyText.trim());
      } else {
        const bodyText = await callOpenAICompatible(reqModelConfig, [
          { role: "system", content: "You are a learning assistant. Always respond in strict JSON format as instructed." },
          { role: "user", content: chatPrompt },
        ], true);
        if (!bodyText) throw new Error("Empty model response");
        data = JSON.parse(bodyText.trim());
      }
      return res.json(data);
    } catch (error: any) {
      console.error("User-configured model call failed, falling back:", error.message);
      // Fall through to env-based or simulator
    }
  }

  // Priority 2: Environment-variable Gemini client
  const client = getAIClient();
  if (client) {
    try {
      const chatSchema = {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          chips: { type: Type.ARRAY, items: { type: Type.STRING } },
          autoNote: { type: Type.STRING },
          topicMasteryImpact: {
            type: Type.OBJECT,
            properties: {
              logisticRegression: { type: Type.NUMBER },
              gradientDescent: { type: Type.NUMBER },
              regularization: { type: Type.NUMBER },
            },
            required: ["logisticRegression", "gradientDescent", "regularization"],
          },
          nextSuggestion: {
            type: Type.OBJECT,
            properties: { concept: { type: Type.STRING }, detail: { type: Type.STRING } },
            required: ["concept", "detail"],
          },
        },
        required: ["text", "chips", "autoNote", "topicMasteryImpact", "nextSuggestion"],
      };
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: chatPrompt,
        config: { responseMimeType: "application/json", responseSchema: chatSchema },
      });
      const bodyText = response.text;
      if (!bodyText) throw new Error("Empty response text from Gemini");
      const data = JSON.parse(bodyText.trim());
      return res.json(data);
    } catch (error: any) {
      console.error("Gemini API call failed:", error);
    }
  }

  // Priority 3: Simulator Mode
  setTimeout(() => {
    res.json(getSimulatedResponse(question));
  }, 1000);
});

// 2.5 Save Note API - Organize conversation into note + generate review questions
app.post("/api/save-note", async (req, res) => {
  const { messages, noteContext, modelConfig: reqModelConfig } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Messages are required." });
  }

  // Build conversation transcript
  const transcript = messages
    .filter((m: any) => m.sender === "user" || m.sender === "system")
    .map((m: any) => `${m.sender === "user" ? "Student" : "AI"}: ${m.text}`)
    .join("\n\n");

  const savePrompt = `You are an AI learning assistant. Based on the following conversation between a student and AI assistant, create a structured study note and generate 3 review questions.

${noteContext ? `Reference Note Context:\nTopic: ${noteContext.topic}\nContent: ${noteContext.content}\n\n` : ""}Conversation:\n${transcript}

Respond in strict JSON format:
{
  "note": {
    "topic": "A concise topic title for this note (in Chinese)",
    "content": "Well-organized study notes in Chinese using markdown. Include key concepts, formulas if applicable, and important takeaways. Keep it comprehensive but concise."
  },
  "reviewQuestions": [
    {
      "question": "A challenging review question in Chinese",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Brief explanation of why this is correct, in Chinese"
    }
  ]
}`;

  // Priority 1: User-configured model
  if (reqModelConfig && reqModelConfig.apiKey) {
    try {
      let bodyText: string;
      if (reqModelConfig.provider === "gemini") {
        const schema = {
          type: Type.OBJECT,
          properties: {
            note: {
              type: Type.OBJECT,
              properties: { topic: { type: Type.STRING }, content: { type: Type.STRING } },
              required: ["topic", "content"],
            },
            reviewQuestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.NUMBER },
                  explanation: { type: Type.STRING },
                },
                required: ["question", "options", "correctIndex", "explanation"],
              },
            },
          },
          required: ["note", "reviewQuestions"],
        };
        bodyText = await callGeminiAPI(reqModelConfig.apiKey, reqModelConfig.model, savePrompt, schema);
      } else {
        bodyText = await callOpenAICompatible(reqModelConfig, [
          { role: "system", content: "You are a learning assistant. Respond in strict JSON." },
          { role: "user", content: savePrompt },
        ], true);
      }
      if (!bodyText) throw new Error("Empty response");
      const data = JSON.parse(bodyText.trim());
      return res.json(data);
    } catch (error: any) {
      console.error("Save-note with user model failed:", error.message);
    }
  }

  // Priority 2: Env Gemini
  const client = getAIClient();
  if (client) {
    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          note: {
            type: Type.OBJECT,
            properties: { topic: { type: Type.STRING }, content: { type: Type.STRING } },
            required: ["topic", "content"],
          },
          reviewQuestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.NUMBER },
                explanation: { type: Type.STRING },
              },
              required: ["question", "options", "correctIndex", "explanation"],
            },
          },
        },
        required: ["note", "reviewQuestions"],
      };
      const response = await client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: savePrompt,
        config: { responseMimeType: "application/json", responseSchema: schema },
      });
      const bodyText = response.text;
      if (bodyText) {
        const data = JSON.parse(bodyText.trim());
        return res.json(data);
      }
    } catch (error: any) {
      console.error("Gemini save-note failed:", error);
    }
  }

  // Priority 3: Simulator
  res.json({
    note: {
      topic: "机器学习核心概念",
      content: "## 核心概念\n\n本次对话涵盖了以下关键知识点：\n\n- **逻辑回归**：使用 Sigmoid 函数将预测值映射到 [0,1] 范围\n- **决策边界**：通常设置为 0.5 的分类阈值\n- **损失函数**：负对数似然损失用于模型优化\n\n## 重要公式\n\n$$S(z) = \\frac{1}{1 + e^{-z}}$$\n\n## 关键要点\n\n1. 逻辑回归输出概率值而非直接分类\n2. Sigmoid 函数的饱和性使其对异常值鲁棒\n3. 与线性回归相比，输出有界且适合分类任务",
    },
    reviewQuestions: [
      {
        question: "逻辑回归的 Sigmoid 函数输出范围是什么？",
        options: ["(-∞, +∞)", "[0, 1]", "[-1, 1]", "[0, +∞)"],
        correctIndex: 1,
        explanation: "Sigmoid 函数将任意实数映射到 (0,1) 开区间，通常近似为 [0,1] 闭区间用于概率解释。",
      },
      {
        question: "在逻辑回归中，通常使用什么作为决策边界阈值？",
        options: ["0", "0.5", "1", "0.25"],
        correctIndex: 1,
        explanation: "0.5 是标准的决策边界，当概率大于 0.5 时预测为正类，否则为负类。",
      },
      {
        question: "逻辑回归相比线性回归的主要优势是什么？",
        options: ["计算更快", "输出有界且适合分类", "不需要训练数据", "自动处理缺失值"],
        correctIndex: 1,
        explanation: "逻辑回归通过 Sigmoid 函数保证输出在 [0,1] 范围内，天然适合二分类问题。",
      },
    ],
  });
});

// 3. Quiz API - supports user-configured model, env Gemini, or simulator
app.post("/api/quiz", async (req, res) => {
  const { topic, modelConfig: reqModelConfig } = req.body;

  const simulatorQuizzes: Record<string, any[]> = {
    "logistic-regression": [
      {
        question: "逻辑回归的激活函数 Sigmoid，其输出值最大可能到达多少？",
        options: ["0.5", "1.0", "无限大", "等于输入的偏置权重"],
        correctIndex: 1,
        explanation: "Sigmoid 函数值域为 (0, 1)，因此输出绝对小于且无限无限逼近 1.0。"
      },
      {
        question: "如果在逻辑回归中决策边界设为 0.7，有什么实际影响？",
        options: ["模型分类更加倾向于正类", "分类要求更加苛刻，正类召回率降低但精度通常提升", "参数将无法正常梯度更新", "Sigmoid 公式完全失效"],
        correctIndex: 1,
        explanation: "决策边界提高到 0.7，意味着模型要极具把握（概率>=0.7）才会判断为正类，从而降低正类召回，但通常会筛选出极高置信度的正样本，提升 precision。"
      },
      {
        question: "逻辑回归是一种线性分类模型还是非线性分类模型？",
        options: ["纯粹的非线性分类器", "带有线性决策边界的模型，在超平面上是线性的", "纯回归预测模型，不具备分类特性"],
        correctIndex: 1,
        explanation: "逻辑回归的决策边界 w'x + b = 0 实质上是一个平面/超平面，其划分空间是线性的。"
      }
    ],
    "gradient-descent": [
      {
        question: "若在优化过程中出现 Loss 函数值忽高忽低大幅波动的现象，最可能的原因是：",
        options: ["学习率 (Learning Rate) 过大", "正则化强度太弱", "损失函数求导计算出错", "数据噪声过多"],
        correctIndex: 0,
        explanation: "学习率偏大会导致参数在最优解两端'激烈横跳'而无法收敛，产生振荡。"
      },
      {
        question: "关于小批量梯度下降 (Mini-batch GD) 与全量梯度下降 (Batch GD) 的说法，正确的是：",
        options: ["Batch GD 因为使用全数据，所以比 Mini-batch 迭代速度快得多", "Mini-batch 引入了部分样本随机性，有助于跳出局部低谷", "两者更新参数方向绝对完全百分百一致"],
        correctIndex: 1,
        explanation: "小批量梯度下降使用局部切片数据，既保障了运算开销较小，又引入了震荡随机性，便于跳出极窄局部凹陷。"
      }
    ],
    "regularization": [
      {
        question: "L1 正则化 (Lasso) 比 L2 正则化 (Ridge) 明显的数学特点是：",
        options: ["使得模型参数绝对不可能降低到 0", "将带来稀疏权重性，部分非主导权重会精确归零", "计算速度慢十倍", "一定发生极度严重欠过拟合"],
        correctIndex: 1,
        explanation: "L1 正则约束在截距处存在尖点，极易在微分点处将无关或低相关权重降至精确的0，实现特征自动过滤。"
      }
    ]
  };

  const chosenTopic = topic || "logistic-regression";

  const quizPrompt = `Create a 3-question Multiple Choice Quiz about "${chosenTopic}" in Machine Learning (suitable for evaluation/recall check).
The language MUST be Chinese.

Return STRICTLY JSON format:
{
  "quiz": [
    {
      "question": "Question text in Chinese?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Brief clear explanation in Chinese why this is correct."
    }
  ]
}`;

  // Priority 1: User-configured model
  if (reqModelConfig && reqModelConfig.apiKey) {
    try {
      let data: any;
      if (reqModelConfig.provider === "gemini") {
        const quizSchema = {
          type: Type.OBJECT,
          properties: {
            quiz: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ["question", "options", "correctIndex", "explanation"],
              },
            },
          },
          required: ["quiz"],
        };
        const bodyText = await callGeminiAPI(reqModelConfig.apiKey, reqModelConfig.model, quizPrompt, quizSchema);
        if (!bodyText) throw new Error("Empty Gemini response");
        data = JSON.parse(bodyText.trim());
      } else {
        const bodyText = await callOpenAICompatible(reqModelConfig, [
          { role: "system", content: "You are a quiz generator. Always respond in strict JSON format as instructed." },
          { role: "user", content: quizPrompt },
        ], true);
        if (!bodyText) throw new Error("Empty model response");
        data = JSON.parse(bodyText.trim());
      }
      return res.json(data);
    } catch (error: any) {
      console.error("User-configured model quiz failed, falling back:", error.message);
    }
  }

  // Priority 2: Environment-variable Gemini client
  const client = getAIClient();
  if (client) {
    try {
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: quizPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              quiz: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                  },
                  required: ["question", "options", "correctIndex", "explanation"],
                },
              },
            },
            required: ["quiz"],
          },
        },
      });
      const bodyText = response.text;
      if (!bodyText) throw new Error("Empty response text from Gemini in Quiz");
      const data = JSON.parse(bodyText.trim());
      return res.json(data);
    } catch (error: any) {
      console.error("Quiz API generation failed, supplying simulator quizzes:", error);
    }
  }

  // Priority 3: Simulator Mode
  const quizList = simulatorQuizzes[chosenTopic] || simulatorQuizzes["logistic-regression"];
  res.json({ quiz: quizList });
});

// Vite & Static file configurations
async function initServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Quickly AI] Server running at http://localhost:${PORT}`);
  });
}

initServer().catch(err => {
  console.error("Failed to start server", err);
});
