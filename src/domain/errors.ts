export function isRetryableFinalSummaryError(error: unknown, formatErrorMessage = defaultFormatErrorMessage) {
  if (isAbortError(error)) return false;
  const message = formatErrorMessage(error);
  return [
    /failed to fetch/i,
    /网络错误|CORS|连接中断|connection/i,
    /超时|timeout/i,
    /HTTP\s*(413|429|500|502|503|504)/i,
    /payload|request entity|body \d+ chars/i,
    /资源不足|resource|quota|余额|限流|rate limit/i
  ].some((pattern) => pattern.test(message));
}

function defaultFormatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /aborted|abort/i.test(error.message || ""));
}
