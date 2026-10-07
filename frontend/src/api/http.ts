export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const messageOf = (body: unknown, status: number): string => {
  const b = body as { message?: string | string[]; error?: { reason?: string } } | null;
  const message = b?.message ?? b?.error?.reason;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? `Error ${status}`;
};

/**
 * fetch + JSON. Reintenta ante errores de red o respuestas en `retryOn`
 * (el sandbox de la pasarela responde 404/5xx de forma intermitente).
 */
export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  { retries = 1, retryOn = (s: number) => s >= 500, delayMs = 600 } = {},
): Promise<T> {
  let lastError: Error = new HttpError(0, 'Sin conexión');
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
      const body = await res.json().catch(() => null);
      if (res.ok) return body as T;
      lastError = new HttpError(res.status, messageOf(body, res.status));
      if (!retryOn(res.status)) break;
    } catch {
      lastError = new HttpError(0, 'No se pudo conectar. Revisa tu conexión.');
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs * attempt));
  }
  throw lastError;
}
