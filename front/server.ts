import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createRequire } from "module";
import { Readable } from "stream";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// Study materials can be large (pasted text / uploaded files / MCP snapshots).
app.use(express.json({ limit: "30mb" }));

// Basic hardening: no MIME sniffing, no framing of the app.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// API clients expect JSON errors, not Express' HTML stack pages.
app.use((err: any, req: any, res: any, next: any) => {
  if (res.headersSent) return next(err);
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "请求内容过大" });
  }
  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ error: "请求体格式不正确" });
  }
  return next(err);
});

// ---- Accounts + cloud metadata (web version) ----
// Content (notes / knowledge base files) lives in IMA. This SQLite database
// only stores small account metadata: profile, settings, goals, review history,
// conversations and sync mappings.
const nodeRequire = typeof require === "function"
  ? require
  : createRequire(path.join(process.cwd(), "server.ts"));
const { DatabaseSync } = nodeRequire("node:sqlite");
const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const authDb = new DatabaseSync(path.join(dataDir, "quickly.db"));

authDb.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_data (
    user_id TEXT NOT NULL,
    data_key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, data_key)
  );
  CREATE TABLE IF NOT EXISTS mcp_tokens (
    user_id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
`);

interface AccountUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

const SESSION_COOKIE = "quickly_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function publicAccountUser(row: any): AccountUser {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    createdAt: String(row.created_at),
  };
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function createSession(userId: string): string {
  authDb.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  authDb.prepare(
    "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).run(token, userId, expiresAt, new Date().toISOString());
  return token;
}

function setSessionCookie(res: any, token: string) {
  const secure = process.env.COOKIE_SECURE === "true";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax${secure ? "; Secure" : ""}`,
  );
}

function clearSessionCookie(res: any) {
  const secure = process.env.COOKIE_SECURE === "true";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure ? "; Secure" : ""}`,
  );
}

function getSessionUser(req: any): AccountUser | null {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const row = authDb.prepare(`
    SELECT u.id, u.email, u.name, u.created_at, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token) as any;
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    authDb.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return publicAccountUser(row);
}

function requireAuth(req: any, res: any, next: any) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "请先登录" });
  res.locals.user = user;
  next();
}

function normalizeEmail(value: any): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---- MCP access tokens ----
// Browser requests use the session cookie; external agents use a per-account
// bearer token. The library bridge store is scoped per user.

function getOrCreateMcpToken(userId: string): string {
  const row = authDb.prepare("SELECT token FROM mcp_tokens WHERE user_id = ?").get(userId) as any;
  if (row) return String(row.token);
  const token = `qk_${crypto.randomBytes(24).toString("hex")}`;
  authDb.prepare(
    "INSERT INTO mcp_tokens (user_id, token, created_at) VALUES (?, ?, ?)",
  ).run(userId, token, new Date().toISOString());
  return token;
}

function rotateMcpToken(userId: string): string {
  const token = `qk_${crypto.randomBytes(24).toString("hex")}`;
  authDb.prepare(`
    INSERT INTO mcp_tokens (user_id, token, created_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at
  `).run(userId, token, new Date().toISOString());
  return token;
}

function userForMcpToken(token: string): AccountUser | null {
  if (!token) return null;
  const row = authDb.prepare(`
    SELECT u.id, u.email, u.name, u.created_at
    FROM mcp_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token = ?
  `).get(token) as any;
  return row ? publicAccountUser(row) : null;
}

function getMcpUser(req: any): AccountUser | null {
  const header = String(req.headers?.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return userForMcpToken(match[1].trim());
  return getSessionUser(req);
}

function requireMcpAuth(req: any, res: any, next: any) {
  const user = getMcpUser(req);
  if (!user) {
    return res.status(401).json({
      error: "MCP 请求需要访问令牌",
      errorCode: "unauthorized",
    });
  }
  res.locals.user = user;
  next();
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkLoginRateLimit(key: string): boolean {
  const now = Date.now();
  if (loginAttempts.size > 5000) {
    for (const [entryKey, entry] of loginAttempts) {
      if (entry.resetAt < now) loginAttempts.delete(entryKey);
    }
  }
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 10;
}

app.get("/api/auth/me", (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "未登录" });
  res.json({ user });
});

app.post("/api/auth/register", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 40) : "";

  if (!validEmail(email)) return res.status(400).json({ error: "邮箱格式不正确" });
  if (password.length < 6) return res.status(400).json({ error: "密码至少 6 位" });

  const existing = authDb.prepare("SELECT id FROM users WHERE email = ?").get(email) as any;
  if (existing) return res.status(409).json({ error: "该邮箱已注册" });

  const id = `usr_${crypto.randomBytes(8).toString("hex")}`;
  const createdAt = new Date().toISOString();
  authDb.prepare(
    "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, email, name || email.split("@")[0], hashPassword(password), createdAt);

  const token = createSession(id);
  setSessionCookie(res, token);
  const row = authDb.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?").get(id);
  res.json({ user: publicAccountUser(row) });
});

app.post("/api/auth/login", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const rateKey = `${req.ip || "unknown"}:${email}`;

  if (!checkLoginRateLimit(rateKey)) {
    return res.status(429).json({ error: "登录尝试过多，请稍后再试" });
  }

  const row = authDb.prepare(
    "SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?",
  ).get(email) as any;
  if (!row || !verifyPassword(password, String(row.password_hash))) {
    return res.status(401).json({ error: "邮箱或密码不正确" });
  }

  loginAttempts.delete(rateKey);
  const token = createSession(String(row.id));
  setSessionCookie(res, token);
  res.json({ user: publicAccountUser(row) });
});

app.post("/api/auth/logout", (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) authDb.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// MCP token: shown once in the notes page and used by external agents.
app.get("/api/mcp/token", requireAuth, (req: any, res: any) => {
  const user = res.locals.user as AccountUser;
  res.json({ token: getOrCreateMcpToken(user.id) });
});

app.post("/api/mcp/token/rotate", requireAuth, (req: any, res: any) => {
  const user = res.locals.user as AccountUser;
  res.json({ token: rotateMcpToken(user.id) });
});

app.get("/api/user-data/snapshot", requireAuth, (req: any, res: any) => {
  const user = res.locals.user as AccountUser;
  const row = authDb.prepare(
    "SELECT value, updated_at FROM user_data WHERE user_id = ? AND data_key = 'snapshot'",
  ).get(user.id) as any;

  if (!row) return res.json({ data: null, updatedAt: null });
  try {
    return res.json({ data: JSON.parse(String(row.value)), updatedAt: String(row.updated_at) });
  } catch {
    return res.json({ data: null, updatedAt: null });
  }
});

// Lightweight change check: lets clients poll without downloading the snapshot.
app.get("/api/user-data/snapshot/meta", requireAuth, (req: any, res: any) => {
  const user = res.locals.user as AccountUser;
  const row = authDb.prepare(
    "SELECT updated_at FROM user_data WHERE user_id = ? AND data_key = 'snapshot'",
  ).get(user.id) as any;
  res.json({
    exists: Boolean(row),
    updatedAt: row ? String(row.updated_at) : null,
  });
});

app.put("/api/user-data/snapshot", requireAuth, (req: any, res: any) => {
  const user = res.locals.user as AccountUser;
  const data = req.body?.data;
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "快照数据格式不正确" });
  }

  const json = JSON.stringify(data);
  if (json.length > 25_000_000) {
    return res.status(413).json({ error: "账号数据过大" });
  }

  // Optimistic concurrency: when the client tells us which revision it based
  // its write on, reject the write if another device changed it in between.
  const hasBase = Object.prototype.hasOwnProperty.call(req.body, "baseUpdatedAt");
  const baseUpdatedAt = typeof req.body?.baseUpdatedAt === "string" ? req.body.baseUpdatedAt : null;

  let now = new Date().toISOString();
  if (now === baseUpdatedAt) {
    // Keep revisions unique even for two writes in the same millisecond.
    now = new Date(Date.now() + 1).toISOString();
  }

  if (!hasBase) {
    authDb.prepare(`
      INSERT INTO user_data (user_id, data_key, value, updated_at)
      VALUES (?, 'snapshot', ?, ?)
      ON CONFLICT(user_id, data_key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(user.id, json, now);
  } else if (baseUpdatedAt === null) {
    // Client believes no snapshot exists; the insert must be the first write.
    try {
      authDb.prepare(
        "INSERT INTO user_data (user_id, data_key, value, updated_at) VALUES (?, 'snapshot', ?, ?)",
      ).run(user.id, json, now);
    } catch {
      return res.status(409).json({ error: "数据已在其它设备更新", updatedAt: null });
    }
  } else {
    const result = authDb.prepare(
      "UPDATE user_data SET value = ?, updated_at = ? WHERE user_id = ? AND data_key = 'snapshot' AND updated_at = ?",
    ).run(json, now, user.id, baseUpdatedAt);
    if (Number(result.changes) === 0) {
      const current = authDb.prepare(
        "SELECT updated_at FROM user_data WHERE user_id = ? AND data_key = 'snapshot'",
      ).get(user.id) as any;
      return res.status(409).json({
        error: "数据已在其它设备更新",
        updatedAt: current ? String(current.updated_at) : null,
      });
    }
  }

  res.json({ ok: true, updatedAt: now });
});

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

// ---- Built-in Agent AI (Anthropic-compatible endpoint from environment) ----
// The agent environment exposes a built-in model through these variables.
// They stay server-side only and are never sent to the browser.
const BUILTIN_AI_BASE = (process.env.ANTHROPIC_BASE_URL || "").replace(/\/+$/, "");
const BUILTIN_AI_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || "";
const BUILTIN_AI_MODEL = process.env.ANTHROPIC_MODEL || "deepseek-chat";

function hasBuiltinAI(): boolean {
  return Boolean(BUILTIN_AI_BASE && BUILTIN_AI_TOKEN);
}

async function callBuiltinAI(
  prompt: string,
  options?: {
    system?: string;
    maxTokens?: number;
    image?: { mimeType: string; data: string };
  },
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const content = options?.image
      ? [
          { type: "text", text: prompt },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: options.image.mimeType,
              data: options.image.data,
            },
          },
        ]
      : prompt;

    const response = await fetch(`${BUILTIN_AI_BASE}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        Authorization: `Bearer ${BUILTIN_AI_TOKEN}`,
      },
      body: JSON.stringify({
        model: BUILTIN_AI_MODEL,
        max_tokens: options?.maxTokens || 2048,
        ...(options?.system ? { system: options.system } : {}),
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Built-in AI error ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data: any = await response.json();
    if (Array.isArray(data.content)) {
      const text = data.content
        .filter((block: any) => block?.type === "text" && typeof block.text === "string")
        .map((block: any) => block.text)
        .join("\n")
        .trim();
      if (text) return text;
    }
    throw new Error("Built-in AI returned no text content");
  } finally {
    clearTimeout(timeout);
  }
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

async function callGeminiVision(
  apiKey: string,
  model: string,
  prompt: string,
  image: { mimeType: string; data: string },
  responseSchema: any,
): Promise<string> {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: model || "gemini-2.0-flash",
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType: image.mimeType, data: image.data } },
      ],
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });
  return response.text || "";
}

async function callOpenAICompatibleVision(
  config: ModelConfig,
  prompt: string,
  dataUrl: string,
): Promise<string> {
  const url = `${config.apiBase.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 3000,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You analyze study sources and write structured notes. Always respond with a single valid JSON object." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API error ${response.status}: ${errorText.slice(0, 300)}`);
  }
  const data: any = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function metaContent(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]).trim();
  }
  return "";
}

function isBlockedLinkHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "169.254.169.254"
  ) {
    return true;
  }
  return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

async function fetchLinkContent(link: string): Promise<{
  url: string;
  title: string;
  description: string;
  text: string;
}> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error("链接格式无效");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("只支持 http/https 链接");
  }
  if (isBlockedLinkHost(url.hostname)) {
    throw new Error("出于安全考虑，不能读取本地或内网地址");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; QuicklyStudyBot/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`页面返回 HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();
    if (!contentType.includes("html")) {
      return { url: url.toString(), title: url.hostname, description: "", text: raw.slice(0, 15000) };
    }

    const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = decodeHtmlEntities(titleMatch?.[1] || "").trim() || metaContent(raw, "og:title");
    const description = metaContent(raw, "description") || metaContent(raw, "og:description");

    // Video pages often expose the description inside embedded JSON.
    let videoDescription = "";
    const videoMatch = raw.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
    if (videoMatch?.[1]) {
      try {
        videoDescription = JSON.parse(`"${videoMatch[1]}"`);
      } catch {
        // ignore malformed JSON
      }
    }

    const text = decodeHtmlEntities(
      raw
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 15000);

    return {
      url: url.toString(),
      title: title || url.hostname,
      description: [description, videoDescription].filter(Boolean).join("\n").slice(0, 4000),
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
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

// ---- IMA OpenAPI helper ----
interface IMACredentials {
  clientId: string;
  apiKey: string;
}

function readImaCredentials(body: any): IMACredentials | null {
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  return clientId && apiKey ? { clientId, apiKey } : null;
}

async function callImaApi(
  apiPath: string,
  body: Record<string, unknown>,
  credentials: IMACredentials,
  timeoutMs = 20000,
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://ima.qq.com/${apiPath.replace(/^\/+/, "")}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ima-openapi-clientid": credentials.clientId,
        "ima-openapi-apikey": credentials.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await response.text();
    let data: any = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.msg || `IMA 接口返回 HTTP ${response.status}`);
    }
    if (data.code !== 0) {
      throw new Error(data.msg || `IMA 接口返回错误 ${data.code}`);
    }

    return data.data || {};
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("连接 IMA 超时，请稍后重试");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeImaKnowledgeItem(item: any) {
  const mediaId = String(item?.media_id || "");
  const folderId = String(item?.folder_id || "");
  const isFolder = Number(item?.media_type) === 99 || (Boolean(folderId) && !mediaId);
  const id = mediaId || folderId;
  if (!id) return null;

  return {
    id,
    mediaId,
    folderId,
    title: String(item?.title || item?.name || ""),
    parentFolderId: String(item?.parent_folder_id || ""),
    mediaType: Number(item?.media_type) || (isFolder ? 99 : 0),
    isFolder,
    fileNumber: Number(item?.file_number) || 0,
    folderNumber: Number(item?.folder_number) || 0,
    highlightContent: typeof item?.highlight_content === "string" ? item.highlight_content : "",
  };
}

// 0.1 IMA connection test - validates IMA OpenAPI credentials and lists knowledge bases
app.post("/api/ima/test-connection", async (req, res) => {
  const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";
  const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";

  if (!clientId || !apiKey) {
    return res.json({ success: false, error: "请填写 IMA Client ID 和 API Key" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("https://ima.qq.com/openapi/wiki/v1/search_knowledge_base", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ima-openapi-clientid": clientId,
        "ima-openapi-apikey": apiKey,
      },
      body: JSON.stringify({ query: "", cursor: "", limit: 20 }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let data: any = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    if (!response.ok || data.code !== 0) {
      return res.json({
        success: false,
        error: data.msg || `IMA 接口返回 HTTP ${response.status}`,
      });
    }

    const knowledgeBases = (Array.isArray(data.data?.info_list) ? data.data.info_list : [])
      .map((item: any) => ({
        id: String(item.kb_id || ""),
        name: String(item.kb_name || ""),
        description: String(item.description || ""),
        contentCount: Number(item.content_count) || 0,
      }))
      .filter((item: { id: string }) => item.id);

    return res.json({ success: true, knowledgeBases });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return res.json({ success: false, error: "连接 IMA 超时，请检查网络后重试" });
    }
    return res.json({ success: false, error: error?.message || "连接 IMA 失败" });
  } finally {
    clearTimeout(timeout);
  }
});

// 0.2 IMA knowledge bases - auto-load the user's knowledge bases
app.post("/api/ima/knowledge-bases", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) {
    return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  }

  const query = typeof req.body?.query === "string" ? req.body.query : "";
  const cursor = typeof req.body?.cursor === "string" ? req.body.cursor : "";
  const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 20);

  try {
    const data = await callImaApi(
      "openapi/wiki/v1/search_knowledge_base",
      { query, cursor, limit },
      credentials,
    );

    const knowledgeBases = (Array.isArray(data.info_list) ? data.info_list : [])
      .map((item: any) => ({
        id: String(item.kb_id || item.id || ""),
        name: String(item.kb_name || item.name || ""),
        description: String(item.description || ""),
        contentCount: Number(item.content_count) || 0,
      }))
      .filter((item: { id: string }) => item.id);

    return res.json({
      success: true,
      knowledgeBases,
      isEnd: Boolean(data.is_end),
      nextCursor: String(data.next_cursor || ""),
    });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "加载 IMA 知识库失败" });
  }
});

// 0.3 Browse a knowledge base / folder
app.post("/api/ima/knowledge-list", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) {
    return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  }

  const knowledgeBaseId = typeof req.body?.knowledgeBaseId === "string" ? req.body.knowledgeBaseId.trim() : "";
  if (!knowledgeBaseId) {
    return res.json({ success: false, error: "缺少知识库 ID" });
  }

  const folderId = typeof req.body?.folderId === "string" ? req.body.folderId.trim() : "";
  const cursor = typeof req.body?.cursor === "string" ? req.body.cursor : "";
  const limit = Math.min(Math.max(Number(req.body?.limit) || 50, 1), 50);

  try {
    const body: Record<string, unknown> = {
      knowledge_base_id: knowledgeBaseId,
      cursor,
      limit,
    };
    if (folderId) body.folder_id = folderId;

    const data = await callImaApi("openapi/wiki/v1/get_knowledge_list", body, credentials);
    const items = (Array.isArray(data.knowledge_list) ? data.knowledge_list : [])
      .map(normalizeImaKnowledgeItem)
      .filter(Boolean);

    return res.json({
      success: true,
      data: {
        items,
        isEnd: Boolean(data.is_end),
        nextCursor: String(data.next_cursor || ""),
      },
    });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "加载知识库内容失败" });
  }
});

// 0.4 Search inside a knowledge base
app.post("/api/ima/search-knowledge", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) {
    return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  }

  const knowledgeBaseId = typeof req.body?.knowledgeBaseId === "string" ? req.body.knowledgeBaseId.trim() : "";
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!knowledgeBaseId || !query) {
    return res.json({ success: false, error: "缺少知识库 ID 或搜索关键词" });
  }

  const cursor = typeof req.body?.cursor === "string" ? req.body.cursor : "";

  try {
    const data = await callImaApi(
      "openapi/wiki/v1/search_knowledge",
      { query, knowledge_base_id: knowledgeBaseId, cursor },
      credentials,
    );
    const items = (Array.isArray(data.info_list) ? data.info_list : [])
      .map(normalizeImaKnowledgeItem)
      .filter(Boolean);

    return res.json({
      success: true,
      data: {
        items,
        isEnd: data.is_end === undefined ? true : Boolean(data.is_end),
        nextCursor: String(data.next_cursor || ""),
      },
    });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "搜索知识库失败" });
  }
});

// 0.5 Get a knowledge item's content (notes are returned inline; files are streamed separately)
app.post("/api/ima/media-info", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) {
    return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  }

  const mediaId = typeof req.body?.mediaId === "string" ? req.body.mediaId.trim() : "";
  if (!mediaId) {
    return res.json({ success: false, error: "缺少媒体 ID" });
  }

  try {
    const data = await callImaApi("openapi/wiki/v1/get_media_info", { media_id: mediaId }, credentials);
    const mediaType = Number(data.media_type) || 0;

    if (mediaType === 11) {
      const notebookId = data.notebook_ext_info?.notebook_id;
      if (!notebookId) {
        return res.json({ success: true, data: { type: "unavailable", mediaType } });
      }
      const note = await callImaApi(
        "openapi/note/v1/get_doc_content",
        { note_id: String(notebookId), target_content_format: 0 },
        credentials,
      );
      return res.json({
        success: true,
        data: { type: "note", mediaType, content: String(note.content || "") },
      });
    }

    if (data.url_info?.url) {
      return res.json({ success: true, data: { type: "file", mediaType } });
    }

    return res.json({ success: true, data: { type: "unavailable", mediaType } });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "获取原文失败" });
  }
});

// 0.6 Stream a knowledge file through the server (keeps signed URLs and IMA headers server-side)
app.post("/api/ima/file", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) {
    return res.status(400).json({ error: "请先在设置中填写 IMA Client ID 和 API Key" });
  }

  const mediaId = typeof req.body?.mediaId === "string" ? req.body.mediaId.trim() : "";
  if (!mediaId) {
    return res.status(400).json({ error: "缺少媒体 ID" });
  }
  const fileName = typeof req.body?.fileName === "string"
    ? req.body.fileName.replace(/[\r\n]/g, "").slice(0, 200)
    : "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);

  try {
    const data = await callImaApi("openapi/wiki/v1/get_media_info", { media_id: mediaId }, credentials);
    const url = data.url_info?.url;
    if (!url) {
      return res.status(404).json({ error: "该文件无法直接打开，请使用 IMA 客户端查看" });
    }

    const headers: Record<string, string> = {};
    if (data.url_info.headers && typeof data.url_info.headers === "object") {
      for (const [key, value] of Object.entries(data.url_info.headers)) {
        if (typeof value === "string") headers[key] = value;
      }
    }

    const upstream = await fetch(String(url), { headers, signal: controller.signal });
    if (!upstream.ok || !upstream.body) {
      return res.status(upstream.status || 502).json({ error: "无法获取 IMA 文件内容" });
    }

    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");

    const disposition = upstream.headers.get("content-disposition");
    const riskyInline = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)/i.test(contentType);
    const encodedName = encodeURIComponent(fileName || "ima-file");

    if (riskyInline) {
      // Never render uploaded HTML/SVG/XML with the app's origin; download it instead.
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedName}`);
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    } else if (disposition) {
      res.setHeader("Content-Disposition", disposition);
    } else if (fileName) {
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodedName}`);
    }

    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (error: any) {
    if (!res.headersSent) {
      if (error?.name === "AbortError") {
        return res.status(504).json({ error: "获取 IMA 文件超时" });
      }
      return res.status(500).json({ error: error?.message || "获取 IMA 文件失败" });
    }
    res.end();
  } finally {
    clearTimeout(timeout);
  }
});

// 0.7 IMA notes: notebooks, notes, search, read, create, append, rename
function normalizeImaNote(item: any) {
  const info = item?.note_book_info || item || {};
  const ext = info.note_ext_info || {};
  return {
    id: String(info.note_id || ""),
    title: String(info.title || ""),
    summary: String(info.summary || ""),
    folderId: String(ext.folder_id || ""),
    folderName: String(ext.folder_name || ""),
    createdAt: Number(info.create_time) || 0,
    updatedAt: Number(info.modify_time) || 0,
    highlight: typeof item?.highlightInfo?.doc_title === "string"
      ? item.highlightInfo.doc_title
      : "",
  };
}

app.post("/api/ima/notebooks", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });

  const cursor = typeof req.body?.cursor === "string" ? req.body.cursor : "0";
  const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 20);

  try {
    const data = await callImaApi("openapi/note/v1/list_notebook", { cursor, limit }, credentials);
    const notebooks = (Array.isArray(data.note_folder_infos) ? data.note_folder_infos : [])
      .map((item: any) => ({
        id: String(item.folder_id || ""),
        name: String(item.name || ""),
        noteCount: Number(item.note_number) || 0,
        parentId: String(item.parent_folder_id || ""),
        folderType: Number(item.folder_type) || 0,
      }))
      .filter((item: { id: string }) => item.id);
    return res.json({
      success: true,
      notebooks,
      isEnd: Boolean(data.is_end),
      nextCursor: String(data.next_cursor || ""),
      nextVersion: String(data.next_version || ""),
    });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "加载 IMA 笔记本失败" });
  }
});

app.post("/api/ima/notes", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });

  const folderId = typeof req.body?.folderId === "string" ? req.body.folderId.trim() : "";
  const cursor = typeof req.body?.cursor === "string" ? req.body.cursor : "";
  const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 20);

  try {
    const body: Record<string, unknown> = { sort_type: 0, cursor, limit };
    if (folderId) body.folder_id = folderId;
    const data = await callImaApi("openapi/note/v1/list_note", body, credentials);
    const notes = (Array.isArray(data.note_book_list) ? data.note_book_list : [])
      .map(normalizeImaNote)
      .filter((note: { id: string }) => note.id);
    return res.json({
      success: true,
      notes,
      isEnd: Boolean(data.is_end),
      nextCursor: String(data.next_cursor || ""),
    });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "加载 IMA 笔记失败" });
  }
});

app.post("/api/ima/search-notes", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });

  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) return res.json({ success: false, error: "请输入搜索关键词" });

  const searchBodies = [
    { search_type: 0, sort_type: 0, query_info: { title: query }, start: 0, end: 20 },
    { search_type: 1, sort_type: 0, query_info: { content: query }, start: 0, end: 20 },
  ];

  try {
    const results = await Promise.allSettled(
      searchBodies.map(body => callImaApi("openapi/note/v1/search_note", body, credentials)),
    );
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<any> => result.status === "fulfilled",
    );
    if (fulfilled.length === 0) {
      const firstError = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      throw firstError?.reason || new Error("搜索 IMA 笔记失败");
    }

    const merged = new Map<string, any>();
    for (const result of fulfilled) {
      const infos = Array.isArray(result.value?.search_note_infos)
        ? result.value.search_note_infos
        : [];
      for (const info of infos) {
        const note = normalizeImaNote(info);
        if (note.id && !merged.has(note.id)) merged.set(note.id, note);
      }
    }

    const notes = Array.from(merged.values()).slice(0, 20);
    return res.json({
      success: true,
      notes,
      isEnd: fulfilled.every(result => result.value?.is_end !== false),
      total: notes.length,
    });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "搜索 IMA 笔记失败" });
  }
});

app.post("/api/ima/note-content", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const noteId = typeof req.body?.noteId === "string" ? req.body.noteId.trim() : "";
  if (!noteId) return res.json({ success: false, error: "缺少笔记 ID" });

  try {
    const data = await callImaApi("openapi/note/v1/get_doc_content", {
      note_id: noteId,
      target_content_format: 0,
    }, credentials);
    return res.json({ success: true, content: String(data.content || "") });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "读取 IMA 笔记失败" });
  }
});

app.post("/api/ima/create-note", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  const folderId = typeof req.body?.folderId === "string" ? req.body.folderId.trim() : "";
  const folderName = typeof req.body?.folderName === "string" ? req.body.folderName.trim() : "";
  if (!content) return res.json({ success: false, error: "笔记内容不能为空" });

  const markdown = title && !content.startsWith("#")
    ? `# ${title}\n\n${content}`
    : content;

  try {
    const body: Record<string, unknown> = { content_format: 1, content: markdown };
    if (folderId) body.folder_id = folderId;
    else if (folderName) body.folder_name = folderName;
    const data = await callImaApi("openapi/note/v1/import_doc", body, credentials);
    return res.json({ success: true, noteId: String(data.note_id || ""), title });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "创建 IMA 笔记失败" });
  }
});

app.post("/api/ima/append-note", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const noteId = typeof req.body?.noteId === "string" ? req.body.noteId.trim() : "";
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!noteId || !content) return res.json({ success: false, error: "缺少笔记 ID 或内容" });

  try {
    const data = await callImaApi("openapi/note/v1/append_doc", {
      note_id: noteId,
      content_format: 1,
      content,
    }, credentials);
    return res.json({ success: true, noteId: String(data.note_id || noteId) });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "追加 IMA 笔记失败" });
  }
});

app.post("/api/ima/rename-note", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const noteId = typeof req.body?.noteId === "string" ? req.body.noteId.trim() : "";
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!noteId || !title) return res.json({ success: false, error: "缺少笔记 ID 或标题" });

  try {
    await callImaApi("openapi/note/v1/rename_note", { note_id: noteId, title }, credentials);
    return res.json({ success: true });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "重命名 IMA 笔记失败" });
  }
});

app.post("/api/ima/rename-notebook", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const folderId = typeof req.body?.folderId === "string" ? req.body.folderId.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!folderId || !name) return res.json({ success: false, error: "缺少笔记本 ID 或名称" });

  try {
    await callImaApi("openapi/note/v1/rename_notebook", { folder_id: folderId, name }, credentials);
    return res.json({ success: true });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "重命名 IMA 笔记本失败" });
  }
});

// 0.8 IMA knowledge base management
app.post("/api/ima/create-knowledge-base", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  if (!name) return res.json({ success: false, error: "知识库名称不能为空" });

  try {
    const data = await callImaApi("openapi/wiki/v1/create_knowledge_base", { name, description }, credentials);
    return res.json({
      success: true,
      knowledgeBaseId: String(data.kb_id || data.id || data.knowledge_base_id || ""),
    });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "创建 IMA 知识库失败" });
  }
});

app.post("/api/ima/update-knowledge-base", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const knowledgeBaseId = typeof req.body?.knowledgeBaseId === "string" ? req.body.knowledgeBaseId.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  if (!knowledgeBaseId || (!name && !description)) {
    return res.json({ success: false, error: "缺少知识库 ID 或更新内容" });
  }

  const updateFields: string[] = [];
  const body: Record<string, unknown> = { knowledge_base_id: knowledgeBaseId };
  if (name) { body.name = name; updateFields.push("name"); }
  if (description) { body.description = description; updateFields.push("description"); }
  body.update_fields = updateFields;

  try {
    await callImaApi("openapi/wiki/v1/update_knowledge_base_basic_info", body, credentials);
    return res.json({ success: true });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "更新 IMA 知识库失败" });
  }
});

app.post("/api/ima/create-folder", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const knowledgeBaseId = typeof req.body?.knowledgeBaseId === "string" ? req.body.knowledgeBaseId.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const parentFolderId = typeof req.body?.parentFolderId === "string" ? req.body.parentFolderId.trim() : "";
  if (!knowledgeBaseId || !name) return res.json({ success: false, error: "缺少知识库 ID 或文件夹名称" });

  try {
    const body: Record<string, unknown> = { knowledge_base_id: knowledgeBaseId, name };
    if (parentFolderId) body.parent_folder_id = parentFolderId;
    const data = await callImaApi("openapi/wiki/v1/create_folder", body, credentials);
    return res.json({ success: true, folderId: String(data.folder_id || data.media_id || "") });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "创建 IMA 文件夹失败" });
  }
});

app.post("/api/ima/rename-knowledge", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const knowledgeBaseId = typeof req.body?.knowledgeBaseId === "string" ? req.body.knowledgeBaseId.trim() : "";
  const mediaId = typeof req.body?.mediaId === "string" ? req.body.mediaId.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!knowledgeBaseId || !mediaId || !name) {
    return res.json({ success: false, error: "缺少知识库 ID、媒体 ID 或新名称" });
  }

  try {
    await callImaApi("openapi/wiki/v1/rename_knowledge", {
      knowledge_base_id: knowledgeBaseId,
      media_id: mediaId,
      name,
    }, credentials);
    return res.json({ success: true });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "重命名 IMA 内容失败" });
  }
});

app.post("/api/ima/move-knowledge", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const sourceKnowledgeBaseId = typeof req.body?.sourceKnowledgeBaseId === "string" ? req.body.sourceKnowledgeBaseId.trim() : "";
  const targetKnowledgeBaseId = typeof req.body?.targetKnowledgeBaseId === "string" ? req.body.targetKnowledgeBaseId.trim() : "";
  const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.map(String).filter(Boolean) : [];
  const targetFolderId = typeof req.body?.targetFolderId === "string" ? req.body.targetFolderId.trim() : "";
  if (!sourceKnowledgeBaseId || !targetKnowledgeBaseId || mediaIds.length === 0) {
    return res.json({ success: false, error: "缺少源/目标知识库 ID 或媒体 ID" });
  }

  try {
    const body: Record<string, unknown> = {
      src_knowledge_base_id: sourceKnowledgeBaseId,
      dst_knowledge_base_id: targetKnowledgeBaseId,
      media_ids: mediaIds,
    };
    if (targetFolderId) body.dst_folder_id = targetFolderId;
    const data = await callImaApi("openapi/wiki/v1/move_knowledge", body, credentials);
    return res.json({ success: true, moveResults: data.move_results || {} });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "移动 IMA 内容失败" });
  }
});

app.post("/api/ima/add-note-to-kb", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const knowledgeBaseId = typeof req.body?.knowledgeBaseId === "string" ? req.body.knowledgeBaseId.trim() : "";
  const noteId = typeof req.body?.noteId === "string" ? req.body.noteId.trim() : "";
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!knowledgeBaseId || !noteId) {
    return res.json({ success: false, error: "缺少知识库 ID 或笔记 ID" });
  }

  try {
    await callImaApi("openapi/wiki/v1/add_knowledge", {
      media_type: 11,
      note_info: { content_id: noteId },
      title: title || "IMA 笔记",
      knowledge_base_id: knowledgeBaseId,
    }, credentials);
    return res.json({ success: true });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "把笔记加入 IMA 知识库失败" });
  }
});

app.post("/api/ima/import-urls", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const knowledgeBaseId = typeof req.body?.knowledgeBaseId === "string" ? req.body.knowledgeBaseId.trim() : "";
  const folderId = typeof req.body?.folderId === "string" ? req.body.folderId.trim() : "";
  const urls = Array.isArray(req.body?.urls)
    ? req.body.urls.map(String).map((url: string) => url.trim()).filter(Boolean).slice(0, 10)
    : [];
  if (!knowledgeBaseId || urls.length === 0) {
    return res.json({ success: false, error: "缺少知识库 ID 或 URL" });
  }

  try {
    const data = await callImaApi("openapi/wiki/v1/import_urls", {
      knowledge_base_id: knowledgeBaseId,
      folder_id: folderId || knowledgeBaseId,
      urls,
    }, credentials);
    return res.json({ success: true, results: data.results || {} });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "导入 IMA URL 失败" });
  }
});

app.post("/api/ima/tags", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const knowledgeBaseId = typeof req.body?.knowledgeBaseId === "string" ? req.body.knowledgeBaseId.trim() : "";
  if (!knowledgeBaseId) return res.json({ success: false, error: "缺少知识库 ID" });

  try {
    const data = await callImaApi("openapi/wiki/v1/tag_list", { knowledge_base_id: knowledgeBaseId }, credentials);
    return res.json({ success: true, tags: data.tag_list || data.tags || [] });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "加载 IMA 标签失败" });
  }
});

app.post("/api/ima/tag-add", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const knowledgeBaseId = typeof req.body?.knowledgeBaseId === "string" ? req.body.knowledgeBaseId.trim() : "";
  const tagName = typeof req.body?.tagName === "string" ? req.body.tagName.trim() : "";
  const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.map(String).filter(Boolean) : [];
  if (!knowledgeBaseId || !tagName || mediaIds.length === 0) {
    return res.json({ success: false, error: "缺少知识库 ID、标签名或媒体 ID" });
  }

  try {
    await callImaApi("openapi/wiki/v1/tag_add", {
      knowledge_base_id: knowledgeBaseId,
      tag_name: tagName,
      media_ids: mediaIds,
    }, credentials);
    return res.json({ success: true });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "添加 IMA 标签失败" });
  }
});

app.post("/api/ima/tag-remove", async (req, res) => {
  const credentials = readImaCredentials(req.body);
  if (!credentials) return res.json({ success: false, error: "请先在设置中填写 IMA Client ID 和 API Key" });
  const knowledgeBaseId = typeof req.body?.knowledgeBaseId === "string" ? req.body.knowledgeBaseId.trim() : "";
  const tagName = typeof req.body?.tagName === "string" ? req.body.tagName.trim() : "";
  const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.map(String).filter(Boolean) : [];
  if (!knowledgeBaseId || !tagName || mediaIds.length === 0) {
    return res.json({ success: false, error: "缺少知识库 ID、标签名或媒体 ID" });
  }

  try {
    await callImaApi("openapi/wiki/v1/tag_remove", {
      knowledge_base_id: knowledgeBaseId,
      tag_name: tagName,
      media_ids: mediaIds,
    }, credentials);
    return res.json({ success: true });
  } catch (error: any) {
    return res.json({ success: false, error: error?.message || "移除 IMA 标签失败" });
  }
});

// 1. Get Status API
app.get("/api/status", (req, res) => {
  const client = getAIClient();
  const builtin = hasBuiltinAI();
  res.json({
    hasApiKey: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY",
    hasBuiltinAI: builtin,
    builtinModel: builtin ? BUILTIN_AI_MODEL : null,
    mode: client ? "gemini" : builtin ? "builtin" : "simulator",
  });
});

// 2. Chat API - supports user-configured model, env Gemini, built-in AI, or simulator
app.post("/api/chat", async (req, res) => {
  const {
    question,
    modelConfig: reqModelConfig,
    noteContext,
    noteLibrary,
    studyContext,
  } = req.body;
  const useAI = req.body.useAI !== false;

  if (!question) {
    return res.status(400).json({ error: "Question is required." });
  }

  // Build the grounding context from the user's saved notes / retrieved snippets.
  const sourceSections: string[] = [];
  if (noteContext && noteContext.topic && noteContext.content) {
    sourceSections.push(`【当前笔记：${noteContext.topic}】\n${String(noteContext.content).slice(0, 4000)}`);
  }
  if (Array.isArray(noteLibrary)) {
    for (const item of noteLibrary.slice(0, 5)) {
      if (item?.topic && item?.content) {
        sourceSections.push(`【资料：${item.topic}】\n${String(item.content).slice(0, 4000)}`);
      }
    }
  }
  if (Array.isArray(studyContext)) {
    for (const hit of studyContext.slice(0, 8)) {
      if (hit?.topic && hit?.snippet) {
        sourceSections.push(`【定位片段：${hit.topic}】\n${String(hit.snippet).slice(0, 800)}`);
      }
    }
  }

  const materialBlock = sourceSections.length > 0
    ? `以下是学生保存的学习资料摘录。回答时优先依据这些内容，并在正文中用（来源：标题）标注依据：\n\n${sourceSections.join("\n\n")}`
    : "学生没有提供已保存的学习资料。若问题依赖其个人资料，请如实说明无法从资料中确认。";

  const chatPrompt = `You are Quickly, an AI study assistant inside a personal learning app.
Your job is to answer the student's question using the study materials they saved.
- If the materials contain the answer, ground the answer in them and cite the source title inline, e.g. （来源：光合作用）.
- If the materials do NOT contain the answer, say "资料中未找到相关内容" first; then you may briefly answer from general knowledge, clearly marked as external knowledge.
- Answer in the same language as the student's question. Be concise, accurate, and structured. Use markdown.

${materialBlock}

Student question: "${question}"

Respond STRICTLY with one JSON object and nothing else (no markdown fences, no extra text):
{
  "text": "Your answer. Use markdown.",
  "chips": ["keyword1", "keyword2", "keyword3"],
  "autoNote": "A 15-30 character summary of the answer, or an empty string if the materials did not contain the answer.",
  "topicMasteryImpact": {
    "logisticRegression": 0,
    "gradientDescent": 0,
    "regularization": 0
  },
  "nextSuggestion": {
    "concept": "A relevant next topic",
    "detail": "A brief reason why it follows."
  }
}`;

  // Priority 1: User-configured model from frontend
  if (useAI && reqModelConfig && reqModelConfig.apiKey) {
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
  if (useAI && client) {
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

  // Priority 3: Built-in agent AI (Anthropic-compatible, server-side credentials)
  if (useAI && hasBuiltinAI()) {
    try {
      const bodyText = await callBuiltinAI(chatPrompt, {
        system: "You are a precise study assistant. Always respond with a single valid JSON object and nothing else.",
        maxTokens: 3000,
      });
      const data = parseModelJson(bodyText);
      if (data && typeof data.text === "string" && data.text.trim()) {
        return res.json({
          text: data.text,
          chips: Array.isArray(data.chips) ? data.chips.map((chip: any) => String(chip)).slice(0, 6) : [],
          autoNote: typeof data.autoNote === "string" ? data.autoNote : "",
          topicMasteryImpact: {
            logisticRegression: Number(data?.topicMasteryImpact?.logisticRegression) || 0,
            gradientDescent: Number(data?.topicMasteryImpact?.gradientDescent) || 0,
            regularization: Number(data?.topicMasteryImpact?.regularization) || 0,
          },
          nextSuggestion: {
            concept: typeof data?.nextSuggestion?.concept === "string" ? data.nextSuggestion.concept : "",
            detail: typeof data?.nextSuggestion?.detail === "string" ? data.nextSuggestion.detail : "",
          },
        });
      }
    } catch (error: any) {
      console.error("Built-in AI chat failed, falling back to simulator:", error.message);
    }
  }

  // Priority 4: Simulator Mode
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

Do not include explanations; only questions, options, and correct answers.

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
      "correctIndex": 0
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
                },
                required: ["question", "options", "correctIndex"],
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
              },
              required: ["question", "options", "correctIndex"],
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

  // Priority 3: Built-in agent AI
  if (hasBuiltinAI()) {
    try {
      const bodyText = await callBuiltinAI(savePrompt, {
        system: "You organize study conversations into notes. Always respond with a single valid JSON object and nothing else.",
        maxTokens: 2500,
      });
      const data = parseModelJson(bodyText);
      if (data?.note && typeof data.note.topic === "string") {
        return res.json(data);
      }
    } catch (error: any) {
      console.error("Built-in AI save-note failed:", error.message);
    }
  }

  // Priority 4: Simulator
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

// 2.6 Analyze a link / screenshot into a structured note
app.post("/api/analyze-note-source", async (req, res) => {
  const {
    link,
    imageDataUrl,
    instruction,
    modelConfig: reqModelConfig,
  } = req.body;

  if (!link && !imageDataUrl) {
    return res.status(400).json({ error: "请提供一个链接或截图" });
  }

  let linkData: Awaited<ReturnType<typeof fetchLinkContent>> | null = null;
  if (link) {
    try {
      linkData = await fetchLinkContent(String(link));
    } catch (error: any) {
      return res.status(400).json({ error: `无法读取链接：${error.message || "未知错误"}` });
    }
  }

  let image: { mimeType: string; data: string } | null = null;
  if (imageDataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(imageDataUrl));
    if (!match) {
      return res.status(400).json({ error: "截图格式无效" });
    }
    if (match[2].length > 12_000_000) {
      return res.status(400).json({ error: "截图过大，请压缩后再试" });
    }
    image = { mimeType: match[1], data: match[2] };
  }

  const sourceBlock = linkData
    ? `链接：${linkData.url}
页面标题：${linkData.title || "（无）"}
页面简介：${linkData.description || "（无）"}
页面正文摘录：
"""${linkData.text.slice(0, 12000)}"""`
    : "没有网页链接，只有截图。";

  const notePrompt = `你是一个学习笔记整理助手。请根据下面的学习来源生成一条结构化笔记。

${sourceBlock}

用户补充要求：${instruction || "无"}

要求：
- 使用 Markdown 组织内容，包含核心概念、关键结论、步骤或公式。
- 如果来源是视频链接而没有字幕，只能依据页面标题和简介整理，不要编造视频中的具体内容，并在笔记中说明这一点。
- 如果是截图，请阅读图片内容并提炼关键信息。
- 使用来源的主要语言（中文默认）。
- 返回严格 JSON，不要输出额外文字：
{
  "title": "简洁的笔记标题",
  "content": "完整笔记内容（Markdown）"
}`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      content: { type: Type.STRING },
    },
    required: ["title", "content"],
  };

  const normalize = (data: any) => {
    if (!data || typeof data.content !== "string" || !data.content.trim()) return null;
    return {
      title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : "来源笔记",
      content: data.content.trim(),
      mode: "ai",
    };
  };

  const tryTextModels = async () => {
    if (reqModelConfig && reqModelConfig.apiKey) {
      try {
        let bodyText: string;
        if (reqModelConfig.provider === "gemini") {
          bodyText = await callGeminiAPI(reqModelConfig.apiKey, reqModelConfig.model, notePrompt, schema);
        } else {
          bodyText = await callOpenAICompatible(reqModelConfig, [
            { role: "system", content: "You write structured study notes. Always respond with a single valid JSON object." },
            { role: "user", content: notePrompt },
          ], true);
        }
        const data = normalize(parseModelJson(bodyText));
        if (data) return data;
      } catch (error: any) {
        console.error("Analyze note with user model failed:", error.message);
      }
    }

    const client = getAIClient();
    if (client) {
      try {
        const response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: notePrompt,
          config: { responseMimeType: "application/json", responseSchema: schema },
        });
        if (response.text) {
          const data = normalize(parseModelJson(response.text));
          if (data) return data;
        }
      } catch (error: any) {
        console.error("Analyze note with env Gemini failed:", error);
      }
    }

    if (hasBuiltinAI()) {
      try {
        const bodyText = await callBuiltinAI(notePrompt, {
          system: "You write structured study notes. Always respond with a single valid JSON object and nothing else.",
          maxTokens: 4000,
        });
        const data = normalize(parseModelJson(bodyText));
        if (data) return data;
      } catch (error: any) {
        console.error("Analyze note with built-in AI failed:", error.message);
      }
    }
    return null;
  };

  const tryVisionModels = async () => {
    if (!image) return null;

    if (reqModelConfig && reqModelConfig.apiKey) {
      try {
        const bodyText = reqModelConfig.provider === "gemini"
          ? await callGeminiVision(reqModelConfig.apiKey, reqModelConfig.model, notePrompt, image, schema)
          : await callOpenAICompatibleVision(reqModelConfig, notePrompt, String(imageDataUrl));
        const data = normalize(parseModelJson(bodyText));
        if (data) return data;
      } catch (error: any) {
        console.error("Analyze note vision with user model failed:", error.message);
      }
    }

    const client = getAIClient();
    if (client) {
      try {
        const response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [{
            role: "user",
            parts: [
              { text: notePrompt },
              { inlineData: { mimeType: image.mimeType, data: image.data } },
            ],
          }],
          config: { responseMimeType: "application/json", responseSchema: schema },
        });
        if (response.text) {
          const data = normalize(parseModelJson(response.text));
          if (data) return data;
        }
      } catch (error: any) {
        console.error("Analyze note vision with env Gemini failed:", error);
      }
    }

    if (hasBuiltinAI()) {
      try {
        const bodyText = await callBuiltinAI(notePrompt, {
          system: "You write structured study notes. Always respond with a single valid JSON object and nothing else.",
          maxTokens: 4000,
          image,
        });
        const data = normalize(parseModelJson(bodyText));
        if (data) return data;
      } catch (error: any) {
        console.error("Analyze note vision with built-in AI failed:", error.message);
      }
    }

    return null;
  };

  const visionResult = await tryVisionModels();
  if (visionResult) return res.json(visionResult);

  if (image && !linkData) {
    return res.status(422).json({
      error: "当前模型无法分析截图。请配置支持视觉的模型（如 Gemini、GPT-4o、Qwen-VL 等），或改为粘贴网页链接。",
    });
  }

  const textResult = await tryTextModels();
  if (textResult) return res.json(textResult);

  if (linkData) {
    return res.json({
      title: linkData.title || "来源笔记",
      content: `## 来源\n${linkData.url}\n\n${linkData.description ? `${linkData.description}\n\n` : ""}${linkData.text.slice(0, 4000)}`,
      mode: "fallback",
    });
  }

  return res.status(422).json({ error: "没有可用的 AI 模型来整理该来源。" });
});

// 2.7 Organize selected notes into one coherent study material
app.post("/api/organize-material", async (req, res) => {
  const { notes, title, modelConfig: reqModelConfig } = req.body;

  if (!Array.isArray(notes) || notes.length === 0) {
    return res.status(400).json({ error: "Notes are required." });
  }

  const compiled = notes
    .map((note: any) => `## ${String(note.topic || "").trim()}\n${String(note.content || "").trim()}`)
    .join("\n\n")
    .slice(0, 30000);

  const organizePrompt = `You are an expert study-material editor. Merge the following notes into ONE coherent, well-structured study material in Markdown.

Requirements:
- Preserve all important facts, formulas and distinctions from the notes.
- Remove duplication and obvious repetition.
- Organize with clear headings and short paragraphs or bullet lists.
- Use the notes' main language (Chinese by default).
- Do not invent facts that are not present in the notes.

Notes:
"""
${compiled}
"""

Respond STRICTLY with one JSON object and nothing else:
{
  "title": "A concise material title",
  "content": "The complete organized material in Markdown"
}`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      content: { type: Type.STRING },
    },
    required: ["title", "content"],
  };

  const normalize = (data: any) => {
    if (!data || typeof data.content !== "string" || !data.content.trim()) return null;
    return {
      title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : String(title || "笔记整理"),
      content: data.content.trim(),
      mode: "ai",
    };
  };

  // Priority 1: user-configured model
  if (reqModelConfig && reqModelConfig.apiKey) {
    try {
      let bodyText: string;
      if (reqModelConfig.provider === "gemini") {
        bodyText = await callGeminiAPI(reqModelConfig.apiKey, reqModelConfig.model, organizePrompt, schema);
      } else {
        bodyText = await callOpenAICompatible(reqModelConfig, [
          { role: "system", content: "You organize study notes into materials. Always respond with a single valid JSON object." },
          { role: "user", content: organizePrompt },
        ], true);
      }
      const data = normalize(parseModelJson(bodyText));
      if (data) return res.json(data);
    } catch (error: any) {
      console.error("Organize material with user model failed:", error.message);
    }
  }

  // Priority 2: environment Gemini
  const client = getAIClient();
  if (client) {
    try {
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: organizePrompt,
        config: { responseMimeType: "application/json", responseSchema: schema },
      });
      const bodyText = response.text;
      if (bodyText) {
        const data = normalize(parseModelJson(bodyText));
        if (data) return res.json(data);
      }
    } catch (error: any) {
      console.error("Organize material with env Gemini failed:", error);
    }
  }

  // Priority 3: built-in agent AI
  if (hasBuiltinAI()) {
    try {
      const bodyText = await callBuiltinAI(organizePrompt, {
        system: "You organize study notes into materials. Always respond with a single valid JSON object and nothing else.",
        maxTokens: 4000,
      });
      const data = normalize(parseModelJson(bodyText));
      if (data) return res.json(data);
    } catch (error: any) {
      console.error("Organize material with built-in AI failed:", error.message);
    }
  }

  // Priority 4: plain concatenation fallback
  res.json({
    title: typeof title === "string" && title.trim() ? title.trim() : "笔记整理",
    content: compiled,
    mode: "fallback",
  });
});

// 3. Quiz API - supports user-configured model, env Gemini, or simulator
app.post("/api/quiz", async (req, res) => {
  const { topic, note_text, note_topic, modelConfig: reqModelConfig } = req.body;

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

  const quizPrompt = note_text && String(note_text).trim()
    ? `Create a 3-question Multiple Choice Quiz based STRICTLY on the following study note (suitable for evaluation/recall check).
Note topic: ${note_topic || chosenTopic}
Note content:
"""
${String(note_text).slice(0, 12000)}
"""
Do not introduce facts outside the note. Use the note's main language (Chinese by default).
Do not include explanations; only questions, options, and correct answers.

Return STRICTLY JSON format:
{
  "quiz": [
    {
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0
    }
  ]
}`
    : `Create a 3-question Multiple Choice Quiz about "${chosenTopic}" in Machine Learning (suitable for evaluation/recall check).
The language MUST be Chinese.
Do not include explanations; only questions, options, and correct answers.

Return STRICTLY JSON format:
{
  "quiz": [
    {
      "question": "Question text in Chinese?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0
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
                },
                required: ["question", "options", "correctIndex"],
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
                  },
                  required: ["question", "options", "correctIndex"],
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

  // Priority 3: Built-in agent AI
  if (hasBuiltinAI()) {
    try {
      const bodyText = await callBuiltinAI(quizPrompt, {
        system: "You are a quiz generator. Always respond with a single valid JSON object and nothing else.",
        maxTokens: 1800,
      });
      const data = parseModelJson(bodyText);
      if (Array.isArray(data?.quiz) && data.quiz.length > 0) {
        return res.json({ quiz: data.quiz });
      }
    } catch (error: any) {
      console.error("Built-in AI quiz failed, supplying simulator quizzes:", error.message);
    }
  }

  // Priority 4: Simulator Mode
  const quizList = simulatorQuizzes[chosenTopic] || simulatorQuizzes["logistic-regression"];
  res.json({ quiz: quizList });
});

// ---- Material Review: generate mixed-type questions from an uploaded material ----

type MaterialQuestionType = "choice" | "truefalse" | "fill" | "short";

interface MaterialCounts {
  choice: number;
  truefalse: number;
  fill: number;
  short: number;
}

function clampInt(value: any, min: number, max: number): number {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

/** Parse model output even if it is wrapped in markdown fences or extra prose. */
function parseModelJson(text: string): any {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(candidate);
}

type MaterialPurpose = "formative" | "exam" | "review";

function bloomTargetFor(purpose: MaterialPurpose): string {
  if (purpose === "exam") {
    return "记忆/理解不超过 50%，其余以应用、分析、评价为主；至少 1 道分析或评价题。";
  }
  if (purpose === "review") {
    return "分析/评价为主，适量应用；减少纯记忆题，尽量使用情境化或综合题。";
  }
  return "记忆/理解约 40%，应用约 60%；避免整份卷子都是背诵题。";
}

function buildMaterialPrompt(
  material: string,
  fileName: string,
  counts: MaterialCounts,
  purpose: MaterialPurpose = "formative",
  difficulty?: string,
): string {
  const requested = [
    counts.choice > 0 ? `- 选择题 ${counts.choice} 道` : "",
    counts.truefalse > 0 ? `- 判断题 ${counts.truefalse} 道` : "",
    counts.fill > 0 ? `- 填空题 ${counts.fill} 道` : "",
    counts.short > 0 ? `- 简答题 ${counts.short} 道` : "",
  ].filter(Boolean).join("\n");

  const purposeLabel = purpose === "exam" ? "单元测验" : purpose === "review" ? "综合复习" : "形成性复习/巩固";
  const difficultyLabel = difficulty === "hard" ? "挑战" : difficulty === "easy" ? "基础" : "进阶";

  return `你是一位资深命题教师。一个好测验本身就是一次学习事件，而不是单纯的打分。请严格基于下面这份复习资料出题，不得引入资料之外的知识。

资料名称：${fileName || "复习资料"}
出题目标：${purposeLabel}
资料难度：${difficultyLabel}
资料内容：
"""
${material}
"""

【第一步：先规划认知层级，再写题】
在写题前先确定 Bloom 认知层级分布，目标：${bloomTargetFor(purpose)}
每道题必须标注 cognitiveLevel，取值为 remember / understand / apply / analyze / evaluate / create。
红线：不能全部是 remember；如果整份题都是记忆题，请重新平衡后再输出。
题型与层级匹配：选择题、填空题适合 remember / understand；判断题只作诊断，最多占总题量 30%；简答题用于 apply / analyze / evaluate。
如果没有简答题，也要用情境化选择题或判断题覆盖 apply 及以上层级，不要退回纯记忆。

【第二步：题干与干扰项】
- 题目数量必须严格等于要求：${requested}
- 每题只考一个知识点，不要把两个问题塞进同一道题，否则答错后无法诊断。
- 选择题必须有唯一正确选项；错误选项必须是“有某种部分理解的学生会选”的干扰项，不能是玩笑选项，不能用“以上都对/以上都不对”。
- 选择题选项长度、语法尽量平行，避免最长选项泄露答案。
- 判断题题干必须是可以明确判定的陈述句，避免“可能/通常/有时”这类模糊表述。
- 填空题用 ____ 表示空白，答案必须唯一，或把等价答案写入 acceptableAnswers。
- 使用资料的主要语言出题（中文资料用中文），题目按由易到难排列。

【第三步：答案与干扰项诊断】
- 不要输出 explanation、解析或任何答案说明，只输出题目、选项、正确答案和干扰项说明。
- 选择题额外提供 distractorNotes：与 options 等长的数组；每个错误选项写它对应的典型误解或错误直觉，正确选项写“正确答案”。
- 简答题提供 referenceAnswer 和 3-6 个 keywords，方便自评。
- 如果资料不足以支持某道题，改为基于资料的综合理解题，不要编造资料外事实。

严格只输出以下 JSON 对象，不要输出任何额外文字：
{
  "questions": [
    {
      "type": "choice",
      "question": "题干",
      "cognitiveLevel": "understand",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "distractorNotes": ["正确答案", "对应误解1", "对应误解2", "对应误解3"]
    },
    {
      "type": "truefalse",
      "question": "陈述句",
      "cognitiveLevel": "understand",
      "correctBool": true
    },
    {
      "type": "fill",
      "question": "题干，含 ____ 空白",
      "cognitiveLevel": "remember",
      "acceptableAnswers": ["答案", "等价答案"]
    },
    {
      "type": "short",
      "question": "简答题目",
      "cognitiveLevel": "apply",
      "referenceAnswer": "参考答案",
      "keywords": ["关键词1", "关键词2"]
    }
  ]
}`;
}

/** Validate and normalize AI output so the client always receives well-formed questions. */
function normalizeMaterialQuestions(raw: any): any[] {
  if (!Array.isArray(raw)) return [];
  const allowed: MaterialQuestionType[] = ["choice", "truefalse", "fill", "short"];
  const allowedLevels = new Set(["remember", "understand", "apply", "analyze", "evaluate", "create"]);
  const fallbackLevel = (type: MaterialQuestionType): string => {
    if (type === "short") return "apply";
    if (type === "truefalse") return "understand";
    return "remember";
  };
  const questions: any[] = [];

  for (const item of raw) {
    if (!item || typeof item.question !== "string" || !item.question.trim()) continue;
    const type = allowed.includes(item.type) ? item.type : null;
    if (!type) continue;

    const base = {
      id: `mq-${questions.length + 1}`,
      type,
      question: item.question.trim(),
      cognitiveLevel: allowedLevels.has(item.cognitiveLevel) ? item.cognitiveLevel : fallbackLevel(type),
    };

    if (type === "choice") {
      const options = Array.isArray(item.options)
        ? item.options.map((option: any) => String(option).trim()).filter(Boolean).slice(0, 6)
        : [];
      if (options.length < 2) continue;
      const parsedIndex = Number(item.correctIndex);
      const correctIndex = Number.isFinite(parsedIndex)
        ? Math.min(options.length - 1, Math.max(0, Math.round(parsedIndex)))
        : 0;
      const distractorNotes = Array.isArray(item.distractorNotes)
        ? item.distractorNotes.map((note: any) => String(note).trim()).slice(0, options.length)
        : [];
      while (distractorNotes.length < options.length) distractorNotes.push("");
      questions.push({ ...base, options, correctIndex, distractorNotes });
    } else if (type === "truefalse") {
      if (typeof item.correctBool !== "boolean") continue;
      questions.push({ ...base, correctBool: item.correctBool });
    } else if (type === "fill") {
      const answers = Array.isArray(item.acceptableAnswers)
        ? item.acceptableAnswers.map((answer: any) => String(answer).trim()).filter(Boolean).slice(0, 6)
        : [];
      if (answers.length === 0) continue;
      questions.push({ ...base, acceptableAnswers: answers });
    } else {
      questions.push({
        ...base,
        referenceAnswer: typeof item.referenceAnswer === "string" ? item.referenceAnswer.trim() : "",
        keywords: Array.isArray(item.keywords)
          ? item.keywords.map((keyword: any) => String(keyword).trim()).filter(Boolean).slice(0, 8)
          : [],
      });
    }
  }

  return questions;
}

function splitMaterialSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[。！？!?；;])/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8 && sentence.length <= 260);
}

function extractMaterialTerms(text: string): string[] {
  const terms: string[] = [];
  const stopTerms = new Set([
    "它使用", "它的", "这个", "这些", "那些", "一种", "一种方法", "通过", "可以", "使用",
    "通常", "用于", "进行", "具有", "提高", "因此", "我们", "以下", "其中", "如果",
    "那么", "因为", "所以", "以及", "并且", "而是", "就是", "也是", "不是", "能够",
    "需要", "这种", "主要", "一个", "没有", "可能", "必须", "以及",
  ]);
  const badSuffixes = ["是一种", "是指", "定义为", "称为", "的核心", "主要用于", "通常", "可以"];
  const push = (value: string) => {
    let term = value
      .trim()
      .replace(/^[#>*\-\d.\s]+/, "")
      .replace(/[。！？，、；：""''（）()\[\]【】]/g, "");
    for (const suffix of badSuffixes) {
      if (term.endsWith(suffix) && term.length > suffix.length) {
        term = term.slice(0, -suffix.length);
      }
    }
    const looksLikePhrase = /[将把被使让着的过设]/.test(term);
    if (term.length >= 2 && term.length <= 18 && !looksLikePhrase && !stopTerms.has(term) && !terms.includes(term)) {
      terms.push(term);
    }
  };

  for (const match of text.matchAll(/\*\*([^*\n]{2,18})\*\*/g)) push(match[1]);
  for (const match of text.matchAll(/[“"]([^”"\n]{2,18})[”"]/g)) push(match[1]);
  for (const match of text.matchAll(/([一-龥A-Za-z0-9-]{2,12})(?=\s*(?:是指|定义为|称为|即为|是))/g)) {
    push(match[1]);
  }

  if (terms.length < 8) {
    const words = text.split(/[\s,，。.;；:：!?！？、()（）\[\]【】]+/);
    for (const word of words) {
      if (terms.length >= 20) break;
      if (/^[一-龥A-Za-z0-9-]{2,10}$/.test(word)) push(word);
    }
  }

  return terms.slice(0, 20);
}

function deterministicShuffle<T>(items: T[], seed: number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = (seed * 31 + i * 17) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Offline fallback: build usable questions from the material's own sentences and terms. */
/** Keep the generated mix aligned with the user's requested counts. */
function limitMaterialQuestionsToCounts(questions: any[], counts: MaterialCounts): any[] {
  const remaining: Record<MaterialQuestionType, number> = { ...counts };
  const kept: any[] = [];

  for (const question of questions) {
    const type = question?.type as MaterialQuestionType;
    if (!type || !(type in remaining) || remaining[type] <= 0) continue;
    remaining[type] -= 1;
    kept.push(question);
  }

  return kept.map((question, index) => ({
    ...question,
    id: `mq-${index + 1}`,
  }));
}

function buildSimulatorMaterialQuestions(material: string, counts: MaterialCounts): any[] {
  const sentences = splitMaterialSentences(material);
  const terms = extractMaterialTerms(material);

  if (sentences.length === 0) {
    return [{
      id: "mq-sim-1",
      type: "short",
      question: "请概括这份资料的核心内容。",
      cognitiveLevel: "apply",
      referenceAnswer: material.slice(0, 600),
      keywords: terms.slice(0, 5),
      explanation: "当前为模拟模式，接入 AI 模型后可生成更精准的题目。",
    }];
  }

  const questions: any[] = [];
  let cursor = 0;
  const nextSentence = (): string => {
    const sentence = sentences[cursor % sentences.length];
    cursor += 1;
    return sentence;
  };
  const nextSentenceWithTerm = (): { sentence: string; term: string } => {
    for (let i = 0; i < sentences.length; i += 1) {
      const sentence = nextSentence();
      const term = terms.find((candidate) => sentence.includes(candidate));
      if (term) return { sentence, term };
    }
    return { sentence: sentences[0], term: "" };
  };

  for (let i = 0; i < counts.choice; i += 1) {
    const { sentence, term } = nextSentenceWithTerm();
    if (!term) {
      const others = sentences.filter((candidate) => candidate !== sentence);
      const options = deterministicShuffle([sentence, ...others].slice(0, 4), i + 1);
      questions.push({
        type: "choice",
        question: "以下哪一项是资料中提到的内容？",
        cognitiveLevel: "remember",
        options,
        correctIndex: options.indexOf(sentence),
        distractorNotes: options.map((option) => (
          option === sentence ? "正确答案" : "资料中没有这一表述"
        )),
        explanation: `资料原文：${sentence}`,
      });
      continue;
    }
    const distractors = terms.filter((candidate) => candidate !== term).slice(0, 3);
    while (distractors.length < 3) distractors.push(`其他选项${distractors.length + 1}`);
    const options = deterministicShuffle([term, ...distractors], i + 1);
    questions.push({
      type: "choice",
      question: `根据资料，填入空白处最恰当的是：\n「${sentence.replace(term, "____")}」`,
      cognitiveLevel: "understand",
      options,
      correctIndex: options.indexOf(term),
      distractorNotes: options.map((option) => (
        option === term ? "正确答案" : "与原文关键概念不符"
      )),
      explanation: `资料原文：${sentence}`,
    });
  }

  for (let i = 0; i < counts.truefalse; i += 1) {
    const original = nextSentence();
    let statement = original;
    let correctBool = true;
    if (i % 2 === 1) {
      const swaps: Array<[RegExp, string]> = [
        [/不能/g, "可以"], [/可以/g, "不能"], [/增加/g, "减少"], [/减少/g, "增加"],
        [/大于/g, "小于"], [/小于/g, "大于"], [/正相关/g, "负相关"], [/负相关/g, "正相关"],
        [/必须/g, "不必"], [/是/g, "不是"],
      ];
      for (const [pattern, replacement] of swaps) {
        if (pattern.test(original)) {
          statement = original.replace(pattern, replacement);
          correctBool = false;
          break;
        }
      }
    }
    questions.push({
      type: "truefalse",
      question: `判断下列说法是否符合资料：\n「${statement}」`,
      cognitiveLevel: "understand",
      correctBool,
      explanation: correctBool
        ? `该说法与资料一致。原文：${original}`
        : `该说法与资料不一致。原文：${original}`,
    });
  }

  for (let i = 0; i < counts.fill; i += 1) {
    const { sentence, term } = nextSentenceWithTerm();
    if (!term) {
      const fallbackTerm = terms[i % Math.max(terms.length, 1)] || "核心概念";
      questions.push({
        type: "fill",
        question: `请写出资料中反复强调的核心概念：____`,
        cognitiveLevel: "remember",
        acceptableAnswers: [fallbackTerm],
        explanation: `资料中与「${fallbackTerm}」相关的内容：${sentences[0]}`,
      });
      continue;
    }
    questions.push({
      type: "fill",
      question: `请补全资料中的空白：\n「${sentence.replace(term, "____")}」`,
      cognitiveLevel: "remember",
      acceptableAnswers: [term],
      explanation: `资料原文：${sentence}`,
    });
  }

  for (let i = 0; i < counts.short; i += 1) {
    const start = (cursor + i * 2) % sentences.length;
    const excerpt = sentences.slice(start, start + 2).join(" ") || material.slice(0, 300);
    const keywordPool = terms.filter((candidate) => excerpt.includes(candidate)).slice(0, 5);
    const topic = keywordPool[0] || terms[i % Math.max(terms.length, 1)] || "资料要点";
    questions.push({
      type: "short",
      question: `请根据资料简述「${topic}」的相关内容。`,
      cognitiveLevel: "apply",
      referenceAnswer: excerpt,
      keywords: keywordPool,
      explanation: keywordPool.length > 0
        ? `参考答案要点可围绕这些关键词展开：${keywordPool.join("、")}。`
        : "参考答案见上方原文摘录。",
    });
  }

  return deterministicShuffle(questions, 7).map((question, index) => ({
    id: `mq-sim-${index + 1}`,
    ...question,
  }));
}

// 4. Material Quiz API - generate choice / truefalse / fill / short questions from an uploaded material
app.post("/api/material-quiz", async (req, res) => {
  const { material, fileName, counts: rawCounts, purpose: rawPurpose, difficulty: rawDifficulty, modelConfig: reqModelConfig } = req.body;

  if (!material || typeof material !== "string" || material.trim().length === 0) {
    return res.status(400).json({ error: "复习资料不能为空" });
  }

  const counts: MaterialCounts = {
    choice: clampInt(rawCounts?.choice, 0, 20),
    truefalse: clampInt(rawCounts?.truefalse, 0, 20),
    fill: clampInt(rawCounts?.fill, 0, 20),
    short: clampInt(rawCounts?.short, 0, 20),
  };
  const total = counts.choice + counts.truefalse + counts.fill + counts.short;
  if (total === 0) {
    return res.status(400).json({ error: "请至少选择一种题型" });
  }

  // Keep prompts within a reasonable context size.
  const materialText = material.slice(0, 24000);
  const purpose: MaterialPurpose = rawPurpose === "exam" || rawPurpose === "review" ? rawPurpose : "formative";
  const difficulty = rawDifficulty === "easy" || rawDifficulty === "medium" || rawDifficulty === "hard"
    ? rawDifficulty
    : undefined;
  const prompt = buildMaterialPrompt(materialText, String(fileName || ""), counts, purpose, difficulty);

  const materialSchema = {
    type: Type.OBJECT,
    properties: {
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            question: { type: Type.STRING },
            cognitiveLevel: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctIndex: { type: Type.INTEGER },
            distractorNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctBool: { type: Type.BOOLEAN },
            acceptableAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
            referenceAnswer: { type: Type.STRING },
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["type", "question"],
        },
      },
    },
    required: ["questions"],
  };

  // Priority 1: User-configured model
  if (reqModelConfig && reqModelConfig.apiKey) {
    try {
      let data: any;
      if (reqModelConfig.provider === "gemini") {
        const bodyText = await callGeminiAPI(reqModelConfig.apiKey, reqModelConfig.model, prompt, materialSchema);
        data = parseModelJson(bodyText);
      } else {
        const bodyText = await callOpenAICompatible(reqModelConfig, [
          { role: "system", content: "You are an exam question generator. Always respond with a single JSON object and nothing else." },
          { role: "user", content: prompt },
        ], true);
        data = parseModelJson(bodyText);
      }
      const questions = limitMaterialQuestionsToCounts(normalizeMaterialQuestions(data?.questions), counts);
      if (questions.length > 0) return res.json({ questions, mode: "ai" });
    } catch (error: any) {
      console.error("Material quiz generation with user model failed, falling back:", error.message);
    }
  }

  // Priority 2: Environment-variable Gemini client
  const client = getAIClient();
  if (client) {
    try {
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: materialSchema },
      });
      const bodyText = response.text;
      if (bodyText) {
        const data = parseModelJson(bodyText);
        const questions = limitMaterialQuestionsToCounts(normalizeMaterialQuestions(data?.questions), counts);
        if (questions.length > 0) return res.json({ questions, mode: "ai" });
      }
    } catch (error: any) {
      console.error("Material quiz generation with env Gemini failed, falling back:", error);
    }
  }

  // Priority 3: Built-in agent AI
  if (hasBuiltinAI()) {
    try {
      const bodyText = await callBuiltinAI(prompt, {
        system: "You are an exam question generator. Always respond with a single valid JSON object and nothing else.",
        maxTokens: 6000,
      });
      const data = parseModelJson(bodyText);
      const questions = limitMaterialQuestionsToCounts(normalizeMaterialQuestions(data?.questions), counts);
      if (questions.length > 0) return res.json({ questions, mode: "ai" });
    } catch (error: any) {
      console.error("Material quiz generation with built-in AI failed, falling back:", error.message);
    }
  }

  // Priority 4: Simulator Mode - build questions from the material itself
  res.json({ questions: buildSimulatorMaterialQuestions(materialText, counts), mode: "simulator" });
});

// ---- MCP bridge: external agents can import into / search the user's library ----

interface McpImport {
  id: string;
  title: string;
  content: string;
  format: string;
  createdAt: string;
}

interface McpSnapshot {
  folders: any[];
  packages: any[];
  files: any[];
}

interface McpStore {
  snapshot: McpSnapshot;
  imports: McpImport[];
  syncedAt?: string;
}

function mcpStorePath(userId: string): string {
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(process.cwd(), "data", `mcp-store-${safeId}.json`);
}

function readMcpStore(userId: string): McpStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(mcpStorePath(userId), "utf8"));
    return {
      snapshot: {
        folders: Array.isArray(parsed?.snapshot?.folders) ? parsed.snapshot.folders : [],
        packages: Array.isArray(parsed?.snapshot?.packages) ? parsed.snapshot.packages : [],
        files: Array.isArray(parsed?.snapshot?.files) ? parsed.snapshot.files : [],
      },
      imports: Array.isArray(parsed?.imports) ? parsed.imports : [],
      syncedAt: parsed?.syncedAt,
    };
  } catch {
    return { snapshot: { folders: [], packages: [], files: [] }, imports: [] };
  }
}

function writeMcpStore(userId: string, store: McpStore) {
  const storePath = mcpStorePath(userId);
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

function searchLibrarySnapshot(store: McpStore, query: string, limit: number): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const packages = store.snapshot.packages || [];
  const files = store.snapshot.files || [];
  const results: string[] = [];

  for (const file of files) {
    if (results.length >= limit) break;
    const pkg = packages.find((item: any) => item.id === file.packageId);
    const content = String(file.content || "");
    const haystack = `${pkg?.name || ""} ${file.name || ""} ${content}`.toLowerCase();
    if (!haystack.includes(needle)) continue;
    const index = content.toLowerCase().indexOf(needle);
    const snippet = index >= 0
      ? content.slice(Math.max(0, index - 100), index + 240)
      : content.slice(0, 260);
    results.push(`【${pkg?.name || "Library"} / ${file.name}】\n${snippet.replace(/\s+/g, " ").trim()}`);
  }

  for (const pkg of packages) {
    if (results.length >= limit) break;
    if (!String(pkg.name || "").toLowerCase().includes(needle)) continue;
    for (const file of files.filter((item: any) => item.packageId === pkg.id)) {
      if (results.length >= limit) break;
      results.push(`【${pkg.name} / ${file.name}】\n${String(file.content || "").slice(0, 260).replace(/\s+/g, " ").trim()}`);
    }
  }

  return Array.from(new Set(results)).slice(0, limit);
}

function createMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: "quickly", version: "1.0.0" });

  server.registerTool("import_to_library", {
    title: "导入到 Quickly 资料库",
    description: "把一段学习资料导入 Quickly 的资料库。用户下次打开或聚焦 Quickly 时会自动同步到资料库。",
    inputSchema: {
      title: z.string().describe("资料标题 / 资料包名称"),
      content: z.string().describe("资料正文（纯文本或 Markdown）"),
      format: z.string().optional().describe("格式，例如 txt、md、note，默认 txt"),
    },
  }, async ({ title, content, format }) => {
    if (!content.trim()) {
      return { content: [{ type: "text" as const, text: "导入失败：内容为空。" }] };
    }
    const store = readMcpStore(userId);
    const imported: McpImport = {
      id: `mcp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      title: title.trim() || "MCP 导入资料",
      content: content.trim(),
      format: format || "txt",
      createdAt: new Date().toISOString(),
    };
    store.imports.push(imported);
    writeMcpStore(userId, store);
    return {
      content: [{
        type: "text" as const,
        text: `已加入 Quickly 导入队列：${imported.title}。只要 Quickly 页面开着或再次聚焦，就会自动出现在资料库中。`,
      }],
    };
  });

  server.registerTool("search_library", {
    title: "检索 Quickly 资料库",
    description: "在用户已同步到 Quickly 的资料库中按关键词检索资料包和文件内容。",
    inputSchema: {
      query: z.string().describe("搜索关键词"),
      limit: z.number().int().min(1).max(10).optional().describe("最多返回结果数，默认 5"),
    },
  }, async ({ query, limit }) => {
    const store = readMcpStore(userId);
    const results = searchLibrarySnapshot(store, query, limit || 5);
    return {
      content: [{
        type: "text" as const,
        text: results.length > 0
          ? results.join("\n\n")
          : "资料库中没有找到匹配内容。请确认 Quickly 页面已经打开过，以便同步资料库。",
      }],
    };
  });

  server.registerTool("list_library_packages", {
    title: "列出 Quickly 资料包",
    description: "列出用户资料库中已同步的资料包及其文件数量。",
    inputSchema: {},
  }, async () => {
    const store = readMcpStore(userId);
    const packages = store.snapshot.packages || [];
    const files = store.snapshot.files || [];
    if (packages.length === 0) {
      return { content: [{ type: "text" as const, text: "资料库为空或尚未同步。" }] };
    }
    const lines = packages.map((pkg: any) => (
      `- ${pkg.name}（${files.filter((file: any) => file.packageId === pkg.id).length} 个文件）`
    ));
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  });

  return server;
}

app.post("/api/mcp/sync", requireMcpAuth, (req: any, res: any) => {
  const { folders, packages, files } = req.body || {};
  if (!Array.isArray(folders) || !Array.isArray(packages) || !Array.isArray(files)) {
    return res.status(400).json({ error: "Invalid snapshot" });
  }
  const user = res.locals.user as AccountUser;
  const store = readMcpStore(user.id);
  store.snapshot = { folders, packages, files };
  store.syncedAt = new Date().toISOString();
  writeMcpStore(user.id, store);
  res.json({ ok: true, syncedAt: store.syncedAt });
});

app.get("/api/mcp/imports", requireMcpAuth, (req: any, res: any) => {
  const user = res.locals.user as AccountUser;
  const store = readMcpStore(user.id);
  res.json({ imports: store.imports });
});

app.post("/api/mcp/imports/ack", requireMcpAuth, (req: any, res: any) => {
  const user = res.locals.user as AccountUser;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (ids.length === 0) return res.json({ ok: true });
  const store = readMcpStore(user.id);
  store.imports = store.imports.filter(item => !ids.includes(item.id));
  writeMcpStore(user.id, store);
  res.json({ ok: true });
});

app.post("/mcp", requireMcpAuth, async (req: any, res: any) => {
  const user = res.locals.user as AccountUser;
  const server = createMcpServer(user.id);
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await transport.handleRequest(req, res, req.body);
  } catch (error: any) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal MCP server error" },
        id: null,
      });
    }
  }
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
