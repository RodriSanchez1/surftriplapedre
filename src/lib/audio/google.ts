/** Google Identity Services login (token client) and the email of the connected account. */

const GIS = 'https://accounts.google.com/gsi/client';
/** Only allows creating files and seeing the ones the app created. Enough to upload to a shared folder (spike of 10/26). */
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const EMAIL_KEY = 'surftrip-audio:email';

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string; login_hint?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string }) => void;
          }): TokenClient;
        };
      };
    };
  }
}

/** The login was cancelled, the popup was blocked or Google returned an error. */
export class LoginError extends Error {}

let loading: Promise<void> | null = null;

/** Loads the Google script once. Call it when the page opens, before the first tap. */
export function loadGoogle(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new LoginError('Could not load Google'));
    };
    document.head.append(script);
  });
  return loading;
}

export function savedEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY);
}

/** Account email (Drive about.get). It is saved to suggest the same account on the next login. */
export async function accountEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const email = ((await res.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? null;
    if (email) localStorage.setItem(EMAIL_KEY, email);
    return email;
  } catch {
    return null;
  }
}

export interface Account {
  /** Current access token; with force = true it asks for a new one. Call it inside a tap, because of the popup. */
  token: (force?: boolean) => Promise<string>;
}

export function googleAccount(clientId: string): Account {
  let current: { token: string; expires: number } | null = null;
  let client: TokenClient | null = null;
  let inFlight: Promise<string> | null = null;
  let waiting: { resolve: (token: string) => void; reject: (e: Error) => void } | null = null;

  async function request(): Promise<string> {
    await loadGoogle();
    return new Promise<string>((resolve, reject) => {
      waiting = { resolve, reject };
      client ??= window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) return waiting?.reject(new LoginError(r.error ?? 'Google did not return a token'));
          current = { token: r.access_token, expires: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
          waiting?.resolve(r.access_token);
        },
        error_callback: (e) => waiting?.reject(new LoginError(e.type)),
      });
      client.requestAccessToken({ prompt: '', login_hint: savedEmail() ?? undefined });
    });
  }

  return {
    token(force = false) {
      if (!force && current && current.expires - Date.now() > 5 * 60_000) return Promise.resolve(current.token);
      inFlight ??= request().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
