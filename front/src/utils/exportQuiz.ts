import type {
  BloomLevel,
  MaterialQuestion,
  MaterialQuizPurpose,
  QuestionType,
} from "../types";

export type QuizExportLocale = "zh" | "en";

export interface QuizExportOptions {
  materialName: string;
  questions: MaterialQuestion[];
  includeAnswers: boolean;
  locale: QuizExportLocale;
  purpose?: MaterialQuizPurpose;
  generatedAt?: Date;
}

const TYPE_ORDER: QuestionType[] = ["choice", "truefalse", "fill", "short"];

const POINTS: Record<QuestionType, number> = {
  choice: 2,
  truefalse: 1,
  fill: 2,
  short: 5,
};

const LEVEL_LABELS: Record<QuizExportLocale, Record<BloomLevel, string>> = {
  zh: {
    remember: "记忆",
    understand: "理解",
    apply: "应用",
    analyze: "分析",
    evaluate: "评价",
    create: "创造",
  },
  en: {
    remember: "Remember",
    understand: "Understand",
    apply: "Apply",
    analyze: "Analyze",
    evaluate: "Evaluate",
    create: "Create",
  },
};

const TYPE_LABELS: Record<QuizExportLocale, Record<QuestionType, string>> = {
  zh: { choice: "选择题", truefalse: "判断题", fill: "填空题", short: "简答题" },
  en: { choice: "Multiple choice", truefalse: "True / False", fill: "Fill in the blank", short: "Short answer" },
};

const SECTION_TITLES: Record<QuizExportLocale, Record<QuestionType, string>> = {
  zh: { choice: "单项选择题", truefalse: "判断题", fill: "填空题", short: "简答题" },
  en: { choice: "Multiple Choice", truefalse: "True / False", fill: "Fill in the Blank", short: "Short Answer" },
};

const CHINESE_NUMERALS = ["一", "二", "三", "四"];
const ROMAN_NUMERALS = ["I", "II", "III", "IV"];

const TEXT = {
  zh: {
    reviewQuiz: "复习自测卷",
    formativeQuiz: "复习巩固自测卷",
    examQuiz: "单元测验卷",
    finalQuiz: "期末复习自测卷",
    subtitle: "（依据资料组卷　满分 {points} 分　建议用时 {minutes} 分钟）",
    studentFields: "姓名：____________　学号：____________　得分：________",
    answersTitle: "参考答案（教师版）",
    answerSection: "{num}、{title}答案",
    answer: "答案",
    referenceAnswer: "参考答案",
    keywords: "关键词",
    trueLabel: "正确",
    falseLabel: "错误",
    scoreTable: "附：认知层级双向细目表",
    number: "题号",
    level: "认知层级（Bloom）",
    type: "题型",
    points: "分值",
    total: "合计",
    distributionNote: "说明：记忆/理解类约占 {lower}%，应用/分析/评价/创造类约占 {higher}%。",
    pageTitle: "复习自测卷",
  },
  en: {
    reviewQuiz: "Review Quiz",
    formativeQuiz: "Review & Consolidation Quiz",
    examQuiz: "Unit Test",
    finalQuiz: "Final Review Quiz",
    subtitle: "(Built from the material · {points} points · suggested time {minutes} min)",
    studentFields: "Name: ____________  Student ID: ____________  Score: ________",
    answersTitle: "Answer Key (Teacher Version)",
    answerSection: "{num}. {title} Answers",
    answer: "Answer",
    referenceAnswer: "Reference answer",
    keywords: "Keywords",
    trueLabel: "True",
    falseLabel: "False",
    scoreTable: "Appendix: Cognitive Level Specification Table",
    number: "No.",
    level: "Bloom Level",
    type: "Type",
    points: "Points",
    total: "Total",
    distributionNote: "Note: Remember/Understand ≈ {lower}%; Apply/Analyze/Evaluate/Create ≈ {higher}%.",
    pageTitle: "Review Quiz",
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeFileName(value: string): string {
  return (value || "quiz")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "quiz";
}

function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

function quizTitle(materialName: string, purpose: MaterialQuizPurpose | undefined, locale: QuizExportLocale): string {
  const labels = TEXT[locale];
  const suffix = purpose === "exam"
    ? labels.examQuiz
    : purpose === "review"
      ? labels.finalQuiz
      : labels.formativeQuiz;
  const cleanName = materialName
    .replace(/\.(pdf|docx?|txt|md|markdown|csv|pptx?|xlsx?)$/i, "")
    .trim();
  return `${cleanName || materialName} ${suffix}`;
}

function totalPoints(questions: MaterialQuestion[]): number {
  return questions.reduce((sum, question) => sum + POINTS[question.type], 0);
}

function suggestedMinutes(questions: MaterialQuestion[]): number {
  const raw = questions.reduce((sum, question) => {
    if (question.type === "short") return sum + 4;
    if (question.type === "truefalse") return sum + 0.5;
    return sum + 1;
  }, 0);
  return Math.max(5, Math.ceil(raw));
}

function sectionGroups(questions: MaterialQuestion[]): Array<{
  type: QuestionType;
  items: Array<{ question: MaterialQuestion; number: number }>;
}> {
  let number = 0;
  return TYPE_ORDER
    .map((type) => {
      const items = questions
        .filter((question) => question.type === type)
        .map((question) => {
          number += 1;
          return { question, number };
        });
      return { type, items };
    })
    .filter((group) => group.items.length > 0);
}

function withAnswerBlank(stem: string, locale: QuizExportLocale): string {
  const blank = locale === "zh" ? "（    ）" : "(    )";
  if (/[（(]\s*[）)]\s*[。.?？]?$/.test(stem.trim())) return stem;
  return `${stem.trim()} ${blank}`;
}

function questionBlock(
  entry: { question: MaterialQuestion; number: number },
  locale: QuizExportLocale,
): string {
  const { question, number } = entry;
  const parts: string[] = [
    `<div class="question">`,
    `<div class="stem"><span class="q-number">${number}.</span> ${
      question.type === "choice" || question.type === "truefalse"
        ? escapeHtml(withAnswerBlank(question.question, locale)).replace(/\n/g, "<br>")
        : escapeHtml(question.question).replace(/\n/g, "<br>")
    }</div>`,
  ];

  if (question.type === "choice") {
    parts.push(`<div class="options">`);
    (question.options || []).forEach((option, index) => {
      parts.push(`<div class="option">${optionLetter(index)}. ${escapeHtml(option)}</div>`);
    });
    parts.push(`</div>`);
  }

  if (question.type === "short") {
    parts.push(`<div class="answer-lines"><div></div><div></div><div></div></div>`);
  }

  parts.push(`</div>`);
  return parts.join("");
}

function answerItem(
  entry: { question: MaterialQuestion; number: number },
  locale: QuizExportLocale,
): string {
  const labels = TEXT[locale];
  const { question, number } = entry;
  const parts: string[] = [`<div class="answer-item">`];

  if (question.type === "choice") {
    const correct = optionLetter(question.correctIndex ?? 0);
    parts.push(`<div class="answer-line">${number}. 【${labels.answer}】${correct}</div>`);
    (question.options || []).forEach((option, index) => {
      if (index === question.correctIndex) return;
      const note = question.distractorNotes?.[index];
      if (!note) return;
      parts.push(`<div class="note">— ${optionLetter(index)}. ${escapeHtml(option)}：${escapeHtml(note)}</div>`);
    });
  } else if (question.type === "truefalse") {
    const answer = question.correctBool ? labels.trueLabel : labels.falseLabel;
    parts.push(`<div class="answer-line">${number}. 【${labels.answer}】${answer}</div>`);
  } else if (question.type === "fill") {
    parts.push(`<div class="answer-line">${number}. 【${labels.answer}】${escapeHtml((question.acceptableAnswers || []).join(" / "))}</div>`);
  } else {
    parts.push(`<div class="answer-line">${number}. 【${labels.referenceAnswer}】${escapeHtml(question.referenceAnswer || "").replace(/\n/g, "<br>")}</div>`);
    if (question.keywords && question.keywords.length > 0) {
      parts.push(`<div class="note">【${labels.keywords}】${question.keywords.map(escapeHtml).join("、")}</div>`);
    }
  }

  parts.push(`</div>`);
  return parts.join("");
}

function summaryTable(
  groups: ReturnType<typeof sectionGroups>,
  questions: MaterialQuestion[],
  locale: QuizExportLocale,
): string {
  const labels = TEXT[locale];
  const rows = groups
    .flatMap((group) => group.items)
    .sort((a, b) => a.number - b.number)
    .map(({ question, number }) => `
      <tr>
        <td>${number}</td>
        <td>${escapeHtml(LEVEL_LABELS[locale][question.cognitiveLevel || "understand"])}</td>
        <td>${escapeHtml(TYPE_LABELS[locale][question.type])}</td>
        <td>${POINTS[question.type]}</td>
      </tr>`)
    .join("");

  const lowerLevels: BloomLevel[] = ["remember", "understand"];
  const lowerCount = questions.filter((question) => lowerLevels.includes(question.cognitiveLevel || "understand")).length;
  const lowerPct = questions.length > 0 ? Math.round((lowerCount / questions.length) * 100) : 0;
  const higherPct = questions.length > 0 ? 100 - lowerPct : 0;

  return `
    <div class="summary-block">
      <h2>${labels.scoreTable}</h2>
      <table class="summary">
        <thead>
          <tr>
            <th>${labels.number}</th>
            <th>${labels.level}</th>
            <th>${labels.type}</th>
            <th>${labels.points}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3">${labels.total}</td>
            <td>${totalPoints(questions)}</td>
          </tr>
        </tfoot>
      </table>
      <p class="distribution-note">${labels.distributionNote
        .replace("{lower}", String(lowerPct))
        .replace("{higher}", String(higherPct))}</p>
    </div>`;
}

export function buildQuizHtml(options: QuizExportOptions): string {
  const { materialName, questions, includeAnswers, locale } = options;
  const labels = TEXT[locale];
  const purpose = options.purpose || "formative";
  const groups = sectionGroups(questions);
  const points = totalPoints(questions);
  const minutes = suggestedMinutes(questions);
  const numerals = locale === "zh" ? CHINESE_NUMERALS : ROMAN_NUMERALS;

  const questionHtml = groups.map((group, index) => {
    const sectionPoints = POINTS[group.type] * group.items.length;
    const heading = locale === "zh"
      ? `${numerals[index]}、${SECTION_TITLES.zh[group.type]}（每题 ${POINTS[group.type]} 分，共 ${sectionPoints} 分）`
      : `${numerals[index]}. ${SECTION_TITLES.en[group.type]} (${POINTS[group.type]} pt each, ${sectionPoints} pt total)`;
    return `
    <h2 class="section">${escapeHtml(heading)}</h2>
    ${group.items.map((entry) => questionBlock(entry, locale)).join("")}
  `;
  }).join("");

  const answersHtml = includeAnswers ? `
    <div class="answers">
      <h2 class="answers-title">${labels.answersTitle}</h2>
      ${groups.map((group, index) => `
        <h3>${labels.answerSection
          .replace("{num}", numerals[index])
          .replace("{title}", SECTION_TITLES[locale][group.type])}</h3>
        ${group.items.map((entry) => answerItem(entry, locale)).join("")}
      `).join("")}
    </div>` : "";

  const generatedAt = (options.generatedAt || new Date()).toLocaleString(locale === "en" ? "en-US" : "zh-CN");

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(quizTitle(materialName, purpose, locale))}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #000;
      background: #fff;
      font-family: "SimSun", "Songti SC", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Segoe UI", Arial, sans-serif;
      font-size: 11.5pt;
      line-height: 1.75;
    }
    .title {
      text-align: center;
      font-size: 18pt;
      font-weight: bold;
      margin: 0 0 6px;
      letter-spacing: 0.5px;
    }
    .subtitle {
      text-align: center;
      font-size: 10.5pt;
      color: #333;
      margin: 0 0 6px;
    }
    .student-fields {
      text-align: center;
      font-size: 10.5pt;
      color: #333;
      margin: 8px 0 18px;
    }
    h2.section {
      font-size: 13pt;
      font-weight: bold;
      margin: 22px 0 8px;
      page-break-after: avoid;
    }
    .question {
      margin: 0 0 13px;
      page-break-inside: avoid;
    }
    .stem { margin: 0 0 3px; }
    .q-number { font-weight: bold; }
    .options { margin: 0 0 2px 2em; }
    .option { margin: 1px 0; }
    .answer-lines { margin: 8px 0 4px; }
    .answer-lines div {
      border-bottom: 1px dotted #aaa;
      height: 22px;
      margin: 7px 0;
    }
    .answers {
      page-break-before: always;
      margin-top: 28px;
    }
    .answers-title {
      text-align: center;
      font-size: 15pt;
      margin: 0 0 14px;
    }
    .answers h3 {
      font-size: 12pt;
      margin: 18px 0 8px;
    }
    .answer-item {
      margin: 0 0 10px;
      page-break-inside: avoid;
    }
    .answer-line { margin: 0 0 3px; }
    .note { margin: 1px 0 1px 1.5em; color: #333; }
    .summary-block {
      page-break-before: always;
      margin-top: 24px;
    }
    .summary-block h2 {
      font-size: 13pt;
      margin: 0 0 8px;
    }
    table.summary {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5pt;
    }
    table.summary th, table.summary td {
      border: 1px solid #000;
      padding: 4px 6px;
      text-align: left;
    }
    table.summary th { background: #f2f2f2; }
    table.summary tfoot td { font-weight: bold; }
    .distribution-note {
      margin: 8px 0 0;
      font-size: 10pt;
      color: #333;
    }
    .generated-at {
      margin-top: 18px;
      text-align: center;
      font-size: 9pt;
      color: #777;
    }
    @media screen {
      body { background: #e9e9e9; }
      .paper {
        width: 210mm;
        min-height: 297mm;
        margin: 20px auto;
        padding: 18mm 16mm;
        background: #fff;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
      }
    }
    @media print {
      .paper {
        width: auto;
        min-height: 0;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="paper">
    <div class="title">${escapeHtml(quizTitle(materialName, purpose, locale))}</div>
    <div class="subtitle">${labels.subtitle
      .replace("{points}", String(points))
      .replace("{minutes}", String(minutes))}</div>
    <div class="student-fields">${labels.studentFields}</div>
    ${questionHtml}
    ${answersHtml}
    ${includeAnswers ? summaryTable(groups, questions, locale) : ""}
    <div class="generated-at">${escapeHtml(labels.pageTitle)} · ${escapeHtml(generatedAt)}</div>
  </div>
</body>
</html>`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function downloadQuizWord(options: QuizExportOptions) {
  const html = buildQuizHtml(options);
  const blob = new Blob(["﻿", html], { type: "application/msword;charset=utf-8" });
  const suffix = options.includeAnswers ? "teacher" : "student";
  downloadBlob(blob, `${safeFileName(options.materialName)}-${suffix}.doc`);
}

export function printQuizPdf(options: QuizExportOptions) {
  const html = buildQuizHtml(options);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "1024px";
  frame.style.height = "768px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    frame.remove();
    return;
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      window.setTimeout(() => frame.remove(), 60000);
    }
  };

  frame.onload = () => window.setTimeout(doPrint, 60);
  window.setTimeout(doPrint, 600);
}
