import { describe, expect, it } from "vitest";
import { isFinalReportIncomplete, mergeFinalReportContinuation } from "./finalReport";

describe("final report completion detection", () => {
  it("detects provider length stops and unfinished table rows", () => {
    expect(isFinalReportIncomplete("| **PEG计算** | **PEG = 15.38 / 36 ≈ 0.43**<br>分子：当前P", "stop")).toBe(true);
    expect(isFinalReportIncomplete("## 三、公式\n| A | B |\n| --- | --- |\n| x | y", "stop")).toBe(true);
    expect(isFinalReportIncomplete("## 报告\n内容", "length")).toBe(true);
  });

  it("accepts reports with late final judgment or limitations", () => {
    expect(isFinalReportIncomplete("## 证据\n".repeat(10) + "\n## 平衡评价\n双方各有强弱。\n\n## 最终结论与局限性\n条件式结论。", "stop")).toBe(false);
  });

  it("merges continuation without losing markdown", () => {
    expect(mergeFinalReportContinuation("## 公式\n| A |", "| B |\n\n## 最终结论\n完成。")).toContain("## 最终结论");
  });
});
