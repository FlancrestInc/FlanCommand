import { describe, expect, it } from "vitest";

// The browser app uses this same module directly from /public.
// @ts-expect-error The static browser module intentionally has no generated declaration.
import { renderMarkdown } from "../public/markdown.js";

describe("browser markdown renderer", () => {
  it("renders safe structure and fenced code controls", () => {
    const html = renderMarkdown(
      "# Hello\n\nA **bold** note with [a link](https://example.com).\n\n```ts\nconst ready = true;\n```",
    );

    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('target="_blank"');
    expect(html).toContain("data-copy-code");
    expect(html).toContain("data-download-code");
    expect(html).toContain("code-line");
    expect(html).toContain("syntax-keyword");
    expect(html).toContain("syntax-constant");
  });

  it("keeps unknown languages escaped without pretending to highlight them", () => {
    const html = renderMarkdown("```brainfuck\n<alert>&\n```");

    expect(html).toContain("&lt;alert&gt;&amp;");
    expect(html).not.toContain("syntax-keyword");
  });

  it("escapes HTML and rejects unsafe link schemes", () => {
    const html = renderMarkdown("<script>alert(1)</script> [bad](javascript:alert(1))");

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders GitHub-style tables and task lists", () => {
    const html = renderMarkdown(
      "| Name | State |\n| :--- | ---: |\n| Build | Ready |\n\n- [x] Ship it\n- [ ] Test it",
    );

    expect(html).toContain("markdown-table-wrap");
    expect(html).toContain('<th style="text-align:left">Name</th>');
    expect(html).toContain('<td style="text-align:right">Ready</td>');
    expect(html).toContain('class="task-list"');
    expect(html).toContain('<input type="checkbox" disabled checked />');
    expect(html).toContain('<input type="checkbox" disabled />');
  });
});
