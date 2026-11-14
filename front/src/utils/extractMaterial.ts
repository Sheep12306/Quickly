import { isSupportedTextFile, readTextFile } from "./readTextFile";

export const MAX_LIBRARY_FILE_BYTES = 20 * 1024 * 1024;

export const LIBRARY_FILE_ACCEPT = ".txt,.md,.markdown,.csv,.json,.log,.html,.htm,.yaml,.yml,.xml,.tex,.rst,.pdf,.docx,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface ExtractedMaterialFile {
  name: string;
  content: string;
  format: string;
}

function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

export function isSupportedMaterialFile(file: File): boolean {
  const extension = fileExtension(file.name);
  return extension === "pdf" || extension === "docx" || isSupportedTextFile(file);
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
        .filter(Boolean)
        .reduce((acc: string, part: string) => {
          if (!acc) return part;
          const previous = acc[acc.length - 1];
          const next = part[0];
          // Avoid inserting spaces between CJK characters, but keep Latin word spacing.
          const needsSpace = /[A-Za-z0-9.,;:!?)]/.test(previous) && /[A-Za-z0-9(]/.test(next);
          return `${acc}${needsSpace ? " " : ""}${part}`;
        }, "")
        .replace(/[ \t]+/g, " ")
        .trim();
      if (text) pages.push(text);
    }
  } finally {
    await document.destroy();
  }

  if (pages.length === 0) {
    throw new Error("No extractable text found in PDF");
  }
  return pages.join("\n\n");
}

async function extractDocx(file: File): Promise<string> {
  const mammoth: any = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = String(result?.value || "").trim();
  if (!text) {
    throw new Error("No extractable text found in DOCX");
  }
  return text;
}

/**
 * Extracts readable text from a study material.
 * Supports plain text formats, PDF and DOCX (text extraction, not OCR).
 */
export async function extractMaterialFile(file: File): Promise<ExtractedMaterialFile> {
  const extension = fileExtension(file.name);

  if (extension === "pdf") {
    return { name: file.name, content: await extractPdf(file), format: "pdf" };
  }
  if (extension === "docx") {
    return { name: file.name, content: await extractDocx(file), format: "docx" };
  }

  return {
    name: file.name,
    content: await readTextFile(file),
    format: extension || "txt",
  };
}
