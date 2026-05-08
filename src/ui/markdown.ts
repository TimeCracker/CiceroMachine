type SourceRenderer = (sourceRef: string) => string;

export function renderMarkdown(markdown: string, renderSource: SourceRenderer) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, i)) {
      const table = parseMarkdownTable(lines, i);
      html.push(renderMarkdownTable(table.headers, table.rows, renderSource));
      i = table.nextIndex;
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2], renderSource)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item, renderSource)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item, renderSource)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isMarkdownTableStart(lines, i) &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "), renderSource)}</p>`);
  }
  return html.join("");
}

export function renderInlineMarkdown(text: string, renderSource: SourceRenderer) {
  const value = String(text || "");
  const pattern = /\*\*([^*\n]+)\*\*|\[S\d+\]|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let output = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    output += renderPlainText(value.slice(lastIndex, match.index));
    if (match[0].startsWith("**")) {
      output += `<strong>${escapeHtml(match[1])}</strong>`;
    } else if (/^\[S\d+\]$/.test(match[0])) {
      output += renderSource(match[0]);
    } else {
      const href = coerceExternalUrl(match[3]);
      if (href) {
        output += `<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer">${escapeHtml(match[2])}</a>`;
      } else {
        output += renderPlainText(match[0]);
      }
    }
    lastIndex = pattern.lastIndex;
  }
  output += renderPlainText(value.slice(lastIndex));
  return output;
}

function renderPlainText(value: string) {
  return escapeHtml(value).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
}

function isMarkdownTableStart(lines: string[], index: number) {
  if (index + 1 >= lines.length) return false;
  return /\|/.test(lines[index]) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]);
}

function parseMarkdownTable(lines: string[], startIndex: number) {
  const headers = splitMarkdownTableRow(lines[startIndex]);
  const rows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length && /\|/.test(lines[index]) && lines[index].trim()) {
    rows.push(splitMarkdownTableRow(lines[index]));
    index += 1;
  }
  return { headers, rows, nextIndex: index };
}

function splitMarkdownTableRow(line: string) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderMarkdownTable(headers: string[], rows: string[][], renderSource: SourceRenderer) {
  const headerHtml = headers.map((cell) => `<th>${renderInlineMarkdown(cell, renderSource)}</th>`).join("");
  const rowsHtml = rows.map((row) => {
    const cells = headers.map((_, index) => `<td>${renderInlineMarkdown(row[index] || "", renderSource)}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function coerceExternalUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : (/^www\./i.test(raw) ? `https://${raw}` : "");
  if (!withProtocol) return "";
  try {
    const parsed = new URL(withProtocol);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    return parsed.href;
  } catch (error) {
    return "";
  }
}

function escapeHtml(value: unknown) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value: unknown) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
