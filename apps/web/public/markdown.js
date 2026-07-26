const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );

function inline(value) {
  let output = escapeHtml(value);
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  output = output.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  output = output.replace(/\[([^\]]+)\]\((?!https?:\/\/)[^)]+\)/gi, "$1");
  return output;
}

const languageKeywords = {
  js: new Set([
    "async",
    "await",
    "const",
    "else",
    "export",
    "from",
    "function",
    "if",
    "import",
    "new",
    "return",
    "throw",
    "try",
    "typeof",
    "var",
    "while",
  ]),
  ts: new Set([
    "async",
    "await",
    "const",
    "else",
    "export",
    "from",
    "function",
    "if",
    "import",
    "interface",
    "new",
    "return",
    "throw",
    "try",
    "type",
    "typeof",
    "while",
  ]),
  json: new Set(["true", "false", "null"]),
  py: new Set([
    "and",
    "as",
    "class",
    "def",
    "elif",
    "else",
    "for",
    "from",
    "if",
    "import",
    "in",
    "is",
    "not",
    "or",
    "return",
    "try",
    "while",
  ]),
  python: new Set([
    "and",
    "as",
    "class",
    "def",
    "elif",
    "else",
    "for",
    "from",
    "if",
    "import",
    "in",
    "is",
    "not",
    "or",
    "return",
    "try",
    "while",
  ]),
  sh: new Set([
    "case",
    "do",
    "done",
    "elif",
    "else",
    "esac",
    "fi",
    "for",
    "if",
    "in",
    "then",
    "while",
  ]),
  bash: new Set([
    "case",
    "do",
    "done",
    "elif",
    "else",
    "esac",
    "fi",
    "for",
    "if",
    "in",
    "then",
    "while",
  ]),
};

const languageAliases = {
  javascript: "js",
  jsx: "js",
  typescript: "ts",
  tsx: "ts",
  shell: "sh",
  yml: "yaml",
};

function highlightCode(value, language) {
  const normalized =
    languageAliases[String(language || "").toLowerCase()] || String(language || "").toLowerCase();
  const keywords = languageKeywords[normalized];
  if (!keywords && !["css", "html", "xml", "yaml"].includes(normalized)) return escapeHtml(value);
  const tokenPattern =
    /\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$-]*\b/gu;
  let cursor = 0;
  let output = "";
  for (const match of value.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    output += escapeHtml(value.slice(cursor, index));
    const isComment =
      token.startsWith("//") ||
      token.startsWith("/*") ||
      (token.startsWith("#") && ["py", "python", "sh", "bash", "yaml"].includes(normalized));
    const className = isComment
      ? "comment"
      : /^['"`]/u.test(token)
        ? "string"
        : /^\d/u.test(token)
          ? "number"
          : keywords?.has(token)
            ? "keyword"
            : token === "true" || token === "false" || token === "null"
              ? "constant"
              : "plain";
    output += `<span class="syntax-${className}">${escapeHtml(token)}</span>`;
    cursor = index + token.length;
  }
  return output + escapeHtml(value.slice(cursor));
}

function codeBlock(code, language) {
  const encoded = encodeURIComponent(code);
  const lines = code.split("\n");
  const label = language || "text";
  const slug = label.toLowerCase().replace(/[^a-z0-9-]+/gu, "") || "text";
  return `<div class="code-block language-${slug}" data-code="${encoded}"><div class="code-toolbar"><span>${escapeHtml(label)}</span><div><button type="button" data-copy-code>Copy</button><button type="button" data-download-code>Download</button></div></div><pre><code>${lines.map((line) => `<span class="code-line">${highlightCode(line, language) || " "}</span>`).join("")}</code></pre></div>`;
}

function tableCells(line) {
  const value = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  return value.split(/\s*\|\s*/u).map((cell) => cell.trim());
}

function tableAlignment(cell) {
  const trimmed = cell.trim();
  if (/^:-+:$/u.test(trimmed)) return "center";
  if (/^-+:$/u.test(trimmed)) return "right";
  return "left";
}

function isTableDivider(line) {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function tableBlock(headerLine, dividerLine, rows) {
  const headers = tableCells(headerLine);
  const dividers = tableCells(dividerLine);
  const alignment = headers.map((_, index) => tableAlignment(dividers[index] || "---"));
  const cell = (tag, value, index) =>
    `<${tag} style="text-align:${alignment[index] || "left"}">${inline(value)}</${tag}>`;
  const header = headers.map((value, index) => cell("th", value, index)).join("");
  const body = rows
    .map((row) => {
      const values = tableCells(row);
      return `<tr>${headers.map((_, index) => cell("td", values[index] || "", index)).join("")}</tr>`;
    })
    .join("");
  return `<div class="markdown-table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderMarkdown(value) {
  const source = String(value ?? "").replace(/\r\n?/g, "\n");
  const blocks = [];
  const withoutCode = source.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, language, code) => {
    const key = `@@CODE_BLOCK_${blocks.length}@@`;
    blocks.push(codeBlock(code.replace(/\n$/u, ""), language));
    return key;
  });
  const lines = withoutCode.split("\n");
  const output = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${paragraph.map(inline).join("<br />")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list)
      output.push(
        `<${list.type}${list.items.some((item) => item.checked !== undefined) ? ' class="task-list"' : ""}>${list.items
          .map(
            (item) =>
              `<li>${item.checked === undefined ? "" : `<input type="checkbox" disabled${item.checked ? " checked" : ""} />`}${inline(item.text)}</li>`,
          )
          .join("")}</${list.type}>`,
      );
    list = null;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const code = line.match(/^@@CODE_BLOCK_(\d+)@@$/u);
    if (code) {
      flushParagraph();
      flushList();
      output.push(blocks[Number(code[1])]);
      continue;
    }
    if (line.includes("|") && isTableDivider(lines[index + 1] || "")) {
      flushParagraph();
      flushList();
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(lines[index]);
        index += 1;
      }
      index -= 1;
      output.push(tableBlock(line, lines[index - rows.length], rows));
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/u);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const unordered = line.match(/^\s*[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/u);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/u);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(
        unordered
          ? {
              text: unordered[2],
              ...(unordered[1] ? { checked: unordered[1].toLowerCase() === "x" } : {}),
            }
          : { text: ordered[1] },
      );
      continue;
    }
    if (/^>\s?/u.test(line)) {
      flushParagraph();
      flushList();
      output.push(`<blockquote>${inline(line.replace(/^>\s?/u, ""))}</blockquote>`);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return output.join("");
}

export function bindMarkdownActions(container) {
  container.querySelectorAll("[data-copy-code]").forEach((button) =>
    button.addEventListener("click", async () => {
      const block = button.closest(".code-block");
      const code = decodeURIComponent(block?.dataset.code || "");
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "Copied";
        setTimeout(() => (button.textContent = "Copy"), 1200);
      } catch {
        button.textContent = "Copy failed";
      }
    }),
  );
  container.querySelectorAll("[data-download-code]").forEach((button) =>
    button.addEventListener("click", () => {
      const block = button.closest(".code-block");
      const code = decodeURIComponent(block?.dataset.code || "");
      const language =
        block?.querySelector(".code-toolbar span")?.textContent?.toLowerCase() || "txt";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
      link.download = `hermes-snippet.${language.replace(/[^a-z0-9]+/gu, "") || "txt"}`;
      link.click();
      URL.revokeObjectURL(link.href);
    }),
  );
}
