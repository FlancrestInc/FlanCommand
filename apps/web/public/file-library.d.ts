export function filterFiles<T extends { safeName?: string; name?: string; mimeType?: string }>(
  files: T[],
  query: string,
): T[];
export function previewKind(file: { mimeType?: string }): "image" | "text" | "download";
