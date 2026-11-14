export const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXTENSIONS = [
  "txt", "md", "markdown", "csv", "json", "log", "html", "htm",
  "yaml", "yml", "xml", "tex", "rst",
];

export function isSupportedTextFile(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const looksLikeText = file.type.startsWith("text/") || file.type === "" || file.type === "application/json";
  return ALLOWED_EXTENSIONS.includes(extension) || looksLikeText;
}

/**
 * Reads a text material, falling back to GB18030 when the file is not UTF-8
 * (common for Chinese documents saved on Windows).
 */
export async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buffer);

  const replacementCount = (text.match(/�/g) || []).length;
  if (replacementCount > Math.max(3, text.length * 0.005)) {
    try {
      text = new TextDecoder("gb18030").decode(buffer);
    } catch {
      // Keep UTF-8 output when GB18030 is unavailable.
    }
  }

  return text.replace(/\u0000/g, "");
}
