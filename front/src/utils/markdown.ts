import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * Render IMA-style Markdown. IMA supports standard Markdown plus:
 *   ==highlight==  and  ~underline~
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return "";

  const preprocessed = markdown
    .replace(/==([^=\n]+)==/g, "<mark>$1</mark>")
    .replace(/(^|[^~])~([^~\n]+)~(?!~)/g, "$1<u>$2</u>");

  const html = marked.parse(preprocessed, {
    gfm: true,
    breaks: true,
  }) as string;

  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["mark", "u"],
    ADD_ATTR: ["target", "rel"],
  });
}
