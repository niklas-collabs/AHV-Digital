import type { ApiErrorResponse } from '@ahv/shared';

/**
 * Fehler aus dem API-Client. status ist der HTTP-Code, code ist die
 * server-seitige Fehler-Kennung (z.B. 'INVALID_PIN', 'LOCKED', 'VALIDATION'),
 * data enthaelt zusaetzliche Felder aus dem Response-Body.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly data: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Zentraler API-Client. Schickt Requests an `/api/*` mit credentials,
 * deserialisiert JSON, wirft ApiError bei !ok-Antworten.
 */
export async function apiClient<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const init: RequestInit = {
    method,
    credentials: 'include',
    signal,
  };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(path, init);

  let parsed: unknown = null;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    parsed = await res.json();
  }

  if (!res.ok) {
    const errBody = (parsed ?? {}) as Partial<ApiErrorResponse>;
    throw new ApiError(
      res.status,
      errBody.code ?? 'UNKNOWN',
      errBody.error ?? `HTTP ${res.status}`,
      errBody as Record<string, unknown>,
    );
  }

  return parsed as T;
}
