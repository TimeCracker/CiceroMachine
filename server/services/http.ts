import { hostnameOf, isAbortError, truncate } from "../domain/utils";

type FetchOptions = RequestInit & {
  debugLabel?: string;
};

export function createFetchWithTimeout(getTimeoutSeconds: () => number, getRunSignal: () => AbortSignal | null) {
  return async function fetchWithTimeout(url: string, options: FetchOptions = {}) {
    const { debugLabel = "API request", ...fetchOptions } = options;
    const timeout = Math.max(1, getTimeoutSeconds() || 60) * 1000;
    const host = hostnameOf(url) || String(url || "unknown host");
    const bodyChars = typeof fetchOptions.body === "string" ? fetchOptions.body.length : 0;
    const requestMeta = `${debugLabel} · ${host} · body ${bodyChars} chars`;
    let timedOut = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const runSignal = getRunSignal();
    const abortFromRun = () => controller.abort();
    if (runSignal) {
      if (runSignal.aborted) controller.abort();
      runSignal.addEventListener("abort", abortFromRun, { once: true });
    }
    try {
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${requestMeta} · HTTP ${response.status} ${response.statusText}: ${truncate(text, 300)}`);
      }
      return response;
    } catch (error) {
      if (timedOut) {
        throw new Error(`${requestMeta} · Request timed out after ${Math.round(timeout / 1000)} seconds.`);
      }
      if (isAbortError(error)) throw error;
      if (error instanceof TypeError) {
        throw new Error(`${requestMeta} · Network error: ${error.message}. Possible causes: provider timeout, DNS/network issues, VPN restrictions, or interrupted connection.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (runSignal) runSignal.removeEventListener("abort", abortFromRun);
    }
  };
}

export async function parseJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response is not valid JSON: ${truncate(text, 300)}`);
  }
}
