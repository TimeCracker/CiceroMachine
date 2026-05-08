export function isFinalReportIncomplete(content: string, finishReason?: string) {
  const text = String(content || "").trim();
  if (!text) return true;
  if (/length|max_tokens|max_output_tokens/i.test(String(finishReason || ""))) return true;
  const lastLine = text.split("\n").map((line) => line.trim()).filter(Boolean).pop() || "";
  const pipeCount = (lastLine.match(/\|/g) || []).length;
  if (lastLine.startsWith("|") && (!lastLine.endsWith("|") || pipeCount < 3)) return true;
  const latterHalf = text.slice(Math.floor(text.length * 0.45));
  if (!/(final conclusion|overall conclusion|conclusion and limitations|limitations|final judgment|balanced assessment|最终结论|综合结论|结论与局限|局限性|最终判断|平衡评价)/i.test(latterHalf)) return true;
  return false;
}

export function mergeFinalReportContinuation(report: string, continuation: string) {
  const left = String(report || "").trimEnd();
  const right = String(continuation || "").trimStart();
  if (!left) return right;
  if (!right) return left;
  return `${left}\n\n${right}`;
}
