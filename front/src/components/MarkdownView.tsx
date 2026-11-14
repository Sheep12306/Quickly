import React, { useMemo } from "react";
import { markdownToHtml } from "../utils/markdown";

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export default function MarkdownView({ content, className = "" }: MarkdownViewProps) {
  const html = useMemo(() => markdownToHtml(content), [content]);
  return (
    <div
      className={`markdown-body ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
