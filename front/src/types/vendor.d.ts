declare module "*?url" {
  const src: string;
  export default src;
}

declare module "mammoth" {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{
    value: string;
    messages: unknown[];
  }>;
}
