import { describe, expect, it } from "vitest";

import { filterFiles, previewKind } from "../public/file-library.js";

describe("file library presentation helpers", () => {
  const files = [
    { id: "1", safeName: "notes.md", name: "notes.md", mimeType: "text/markdown" },
    { id: "2", safeName: "photo.png", name: "photo.png", mimeType: "image/png" },
  ];

  it("filters files by safe or original name", () => {
    expect(filterFiles(files, "PHOTO").map((file) => file.id)).toEqual(["2"]);
  });

  it("chooses an in-page preview type without treating PDFs as safe text", () => {
    expect(previewKind(files[0]!)).toBe("text");
    expect(previewKind(files[1]!)).toBe("image");
    expect(previewKind({ mimeType: "application/pdf" })).toBe("download");
  });
});
