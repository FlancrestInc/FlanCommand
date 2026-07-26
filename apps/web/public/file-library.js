const textTypes = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/javascript",
  "text/javascript",
  "text/css",
  "text/xml",
]);

export function filterFiles(files, query) {
  const normalized = String(query || "")
    .trim()
    .toLowerCase();
  if (!normalized) return [...files];
  return files.filter((file) =>
    [file.safeName, file.name, file.mimeType].some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(normalized),
    ),
  );
}

export function previewKind(file) {
  const mimeType = String(file?.mimeType || "");
  if (mimeType.startsWith("image/")) return "image";
  if (textTypes.has(mimeType)) return "text";
  return "download";
}
