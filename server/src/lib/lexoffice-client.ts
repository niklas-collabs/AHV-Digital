// Schmaler HTTP-Client für die Lexoffice REST API.
// Doku: https://developers.lexoffice.io/docs/

const LEXOFFICE_BASE = 'https://api.lexoffice.io/v1';

export class LexofficeError extends Error {
  constructor(
    public readonly code:
      | 'UNAUTHORIZED'
      | 'NOT_FOUND'
      | 'RATE_LIMITED'
      | 'NETWORK'
      | 'BAD_RESPONSE'
      | 'CONFLICT'
      | 'UNKNOWN',
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'LexofficeError';
  }
}

export interface LexofficeAddress {
  street?: string;
  supplement?: string;
  zip?: string;
  city?: string;
  countryCode?: string;
}

export interface LexofficeContact {
  id: string;
  version: number;
  roles?: {
    customer?: { number?: number };
    vendor?: { number?: number };
  };
  company?: {
    name: string;
    contactPersons?: { firstName?: string; lastName?: string; salutation?: string }[];
  };
  person?: {
    salutation?: string;
    firstName?: string;
    lastName?: string;
  };
  addresses?: {
    billing?: LexofficeAddress[];
    shipping?: LexofficeAddress[];
  };
  emailAddresses?: {
    business?: string[];
    office?: string[];
    private?: string[];
    other?: string[];
  };
  phoneNumbers?: {
    business?: string[];
    office?: string[];
    mobile?: string[];
    private?: string[];
    fax?: string[];
    other?: string[];
  };
  note?: string;
}

interface PageResponse<T> {
  content: T[];
  first: boolean;
  last: boolean;
  totalPages: number;
  totalElements: number;
  numberOfElements: number;
  size: number;
  number: number;
  sort?: unknown[];
}

export interface LexofficeContactInput {
  roles: { customer: Record<string, never> };
  company?: {
    name: string;
    contactPersons?: { firstName?: string; lastName?: string; primary?: boolean }[];
  };
  person?: {
    salutation?: string;
    firstName?: string;
    lastName?: string;
  };
  addresses?: {
    billing?: LexofficeAddress[];
  };
  emailAddresses?: {
    business?: string[];
  };
  phoneNumbers?: {
    business?: string[];
  };
  note?: string;
}

interface LexofficeRequestOptions {
  signal?: AbortSignal;
}

async function request<T>(
  apiKey: string,
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  options: LexofficeRequestOptions = {},
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
  };

  let res: Response;
  try {
    res = await fetch(`${LEXOFFICE_BASE}${path}`, init);
  } catch (err) {
    throw new LexofficeError(
      'NETWORK',
      err instanceof Error ? err.message : 'Netzwerkfehler beim Lexoffice-Aufruf',
    );
  }

  let parsed: unknown = null;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const code = mapStatus(res.status);
    const message = errorMessage(res.status, parsed);
    throw new LexofficeError(code, message, res.status, parsed);
  }

  return parsed as T;
}

function mapStatus(status: number): LexofficeError['code'] {
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'BAD_RESPONSE';
  return 'UNKNOWN';
}

function errorMessage(status: number, body: unknown): string {
  if (status === 401 || status === 403) return 'Lexoffice API-Key ungültig oder ohne Berechtigung';
  if (status === 429) return 'Lexoffice-Rate-Limit erreicht — bitte später erneut versuchen';
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const msg = (body as { message: unknown }).message;
    if (typeof msg === 'string') return `Lexoffice: ${msg}`;
  }
  return `Lexoffice-Fehler (HTTP ${status})`;
}

export const lexofficeClient = {
  /**
   * Liefert eine Seite Kontakte. customer=true filtert auf Kunden.
   */
  async listContacts(
    apiKey: string,
    page: number,
    size = 100,
    options: LexofficeRequestOptions = {},
  ): Promise<PageResponse<LexofficeContact>> {
    return request<PageResponse<LexofficeContact>>(
      apiKey,
      'GET',
      `/contacts?customer=true&page=${page}&size=${size}`,
      undefined,
      options,
    );
  },

  /**
   * Iteriert ALLE Kunden-Kontakte (mehrere Seiten). Async-Generator damit
   * der Aufrufer streamen kann ohne alle 10000 auf einmal im Speicher zu
   * halten.
   */
  async *iterateAllCustomers(
    apiKey: string,
    options: LexofficeRequestOptions = {},
  ): AsyncGenerator<LexofficeContact, void, void> {
    let page = 0;
    while (true) {
      const result = await this.listContacts(apiKey, page, 100, options);
      for (const c of result.content) yield c;
      if (result.last) return;
      page++;
      // Ratenlimit-Schoner: kleine Pause zwischen Seiten
      await new Promise((r) => setTimeout(r, 100));
    }
  },

  async createContact(
    apiKey: string,
    input: LexofficeContactInput,
    options: LexofficeRequestOptions = {},
  ): Promise<{ id: string; version: number; resourceUri: string }> {
    return request(apiKey, 'POST', '/contacts', input, options);
  },

  /**
   * Light-weight Connection-Test — fragt nur die erste Seite mit Größe 1 ab.
   */
  async testConnection(
    apiKey: string,
    options: LexofficeRequestOptions = {},
  ): Promise<{ contactsTotal: number }> {
    const result = await request<PageResponse<LexofficeContact>>(
      apiKey,
      'GET',
      '/contacts?customer=true&page=0&size=1',
      undefined,
      options,
    );
    return { contactsTotal: result.totalElements };
  },
};
