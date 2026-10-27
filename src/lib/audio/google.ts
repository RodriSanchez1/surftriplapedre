/** Login con Google Identity Services (cliente de token) y email de la cuenta conectada. */

const GIS = 'https://accounts.google.com/gsi/client';
/** Solo permite crear archivos y ver los que creó la app. Alcanza para subir a una carpeta compartida (spike del 26/10). */
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CLAVE_EMAIL = 'surftrip-audio:email';

interface RespuestaToken {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}

interface ClienteToken {
  requestAccessToken(opciones?: { prompt?: string; login_hint?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (r: RespuestaToken) => void;
            error_callback?: (e: { type: string }) => void;
          }): ClienteToken;
        };
      };
    };
  }
}

/** El login se canceló, el popup se bloqueó o Google devolvió un error. */
export class ErrorLogin extends Error {}

let carga: Promise<void> | null = null;

/** Carga el script de Google una sola vez. Conviene llamarlo al abrir la página, antes del primer toque. */
export function cargarGoogle(): Promise<void> {
  carga ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      carga = null;
      reject(new ErrorLogin('No se pudo cargar Google'));
    };
    document.head.append(script);
  });
  return carga;
}

export function emailGuardado(): string | null {
  return localStorage.getItem(CLAVE_EMAIL);
}

/** Email de la cuenta (Drive about.get). Se guarda para sugerir la misma cuenta en el próximo login. */
export async function emailDeCuenta(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const email = ((await res.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? null;
    if (email) localStorage.setItem(CLAVE_EMAIL, email);
    return email;
  } catch {
    return null;
  }
}

export interface Cuenta {
  /** Token de acceso vigente; con forzar = true pide uno nuevo. Llamarlo dentro de un toque, por el popup. */
  token: (forzar?: boolean) => Promise<string>;
}

export function cuentaGoogle(clientId: string): Cuenta {
  let actual: { token: string; vence: number } | null = null;
  let cliente: ClienteToken | null = null;
  let enCurso: Promise<string> | null = null;
  let pendiente: { resolve: (token: string) => void; reject: (e: Error) => void } | null = null;

  async function pedir(): Promise<string> {
    await cargarGoogle();
    return new Promise<string>((resolve, reject) => {
      pendiente = { resolve, reject };
      cliente ??= window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) return pendiente?.reject(new ErrorLogin(r.error ?? 'Google no devolvió un token'));
          actual = { token: r.access_token, vence: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
          pendiente?.resolve(r.access_token);
        },
        error_callback: (e) => pendiente?.reject(new ErrorLogin(e.type)),
      });
      cliente.requestAccessToken({ prompt: '', login_hint: emailGuardado() ?? undefined });
    });
  }

  return {
    token(forzar = false) {
      if (!forzar && actual && actual.vence - Date.now() > 5 * 60_000) return Promise.resolve(actual.token);
      enCurso ??= pedir().finally(() => {
        enCurso = null;
      });
      return enCurso;
    },
  };
}
