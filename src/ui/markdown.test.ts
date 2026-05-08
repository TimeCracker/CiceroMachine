import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

const source = (ref: string) => `<a class="inline-source" href="https://example.com/${ref.slice(1, -1)}">${ref}</a>`;

describe("renderMarkdown", () => {
  it("renders common markdown and source links", () => {
    const html = renderMarkdown([
      "## 结论",
      "",
      "- **优势** 来自 [S1]",
      "- 查看 [来源](https://example.org)",
      "",
      "| 指标 | 值 |",
      "| --- | --- |",
      "| ROI | [S2] |"
    ].join("\n"), source);

    expect(html).toContain("<h2>结论</h2>");
    expect(html).toContain("<strong>优势</strong>");
    expect(html).toContain('href="https://example.com/S1"');
    expect(html).toContain('href="https://example.org/"');
    expect(html).toContain("<table>");
    expect(html).toContain('href="https://example.com/S2"');
  });

  it("escapes raw html instead of executing it", () => {
    const html = renderMarkdown("<script>alert(1)</script>", source);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders literal br tags as safe line breaks", () => {
    const html = renderMarkdown("| A | B |\n| --- | --- |\n| 第一行<br>第二行 | [S1] |", source);
    expect(html).toContain("第一行<br>第二行");
    expect(html).toContain('href="https://example.com/S1"');
  });
});
