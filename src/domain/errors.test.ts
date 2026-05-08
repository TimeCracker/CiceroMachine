import { describe, expect, it } from "vitest";
import { isRetryableFinalSummaryError } from "./errors";

describe("isRetryableFinalSummaryError", () => {
  it("retries fetch, timeout, payload and resource failures", () => {
    expect(isRetryableFinalSummaryError(new Error("TypeError: Failed to fetch"))).toBe(true);
    expect(isRetryableFinalSummaryError(new Error("HTTP 413 Payload Too Large"))).toBe(true);
    expect(isRetryableFinalSummaryError(new Error("请求超时"))).toBe(true);
    expect(isRetryableFinalSummaryError(new Error("资源不足"))).toBe(true);
  });

  it("does not retry explicit aborts", () => {
    expect(isRetryableFinalSummaryError(new DOMException("Aborted", "AbortError"))).toBe(false);
  });
});
