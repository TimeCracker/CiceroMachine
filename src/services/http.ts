type FetchFactoryOptions = {
  getTimeoutSeconds: () => number;
  getRunSignal: () => AbortSignal | null;
};

type FetchOptions = RequestInit & {
  debugLabel?: string;
};

export function createFetchWithTimeout({ getTimeoutSeconds, getRunSignal }: FetchFactoryOptions) {
  return async function fetchWithTimeout(url: string, options: FetchOptions = {}) {
    const { debugLabel = "API request", ...fetchOptions } = options;
    const timeout = Math.max(1, getTimeoutSeconds() || 60) * 1000;
    const host = hostnameOf(url) || String(url || "unknown host");
    const bodyChars = typeof fetchOptions.body === "string" ? fetchOptions.body.length : 0;
    const requestMeta = `${debugLabel} · ${host} · body ${bodyChars} chars`;
    let timedOut = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
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
        throw new Error(`${requestMeta} · Network error or CORS restriction: ${error.message}. Possible causes: oversized request, direct-browser CORS, network/VPN issues, provider timeout, or interrupted connection.`);
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
      if (runSignal) runSignal.removeEventListener("abort", abortFromRun);
    }
  };
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return "";
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /aborted|abort/i.test(error.message || ""));
}

function truncate(text: string, max: number) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
