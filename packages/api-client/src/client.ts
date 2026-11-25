import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { ApiClientHandle, ApiClientPorts } from "./ports.js";

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export function createApiClient(ports: ApiClientPorts): ApiClientHandle {
  const refreshPath = ports.refreshPath ?? "/api/auth/refresh";
  const logoutPath = ports.logoutPath ?? "/api/auth/logout";

  const client = axios.create({
    baseURL: ports.baseURL,
    headers: { "Content-Type": "application/json" },
    withCredentials: true,
  });

  client.interceptors.request.use((config) => {
    const token = ports.getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    const extra = ports.extraHeaders?.();
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        (config.headers as Record<string, string>)[key] = value;
      }
    }
    return config;
  });

  let refreshPromise: Promise<string | null> | null = null;

  async function refresh(): Promise<string | null> {
    try {
      const { data } = await axios.post(
        `${ports.baseURL}${refreshPath}`,
        {},
        { withCredentials: true },
      );
      const token = data?.accessToken as string | undefined;
      ports.setToken(token ?? null);
      return token ?? null;
    } catch {
      ports.setToken(null);
      return null;
    }
  }

  client.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const original = error.config as RetryableConfig | undefined;
      if (error.response?.status === 401 && original && !original._retry) {
        original._retry = true;
        try {
          const token = await (refreshPromise ?? (refreshPromise = refresh()));
          refreshPromise = null;
          if (token) {
            original.headers.Authorization = `Bearer ${token}`;
            return client(original);
          }
          ports.onSessionExpired?.();
        } catch {
          refreshPromise = null;
          ports.onSessionExpired?.();
        }
      }
      return Promise.reject(error);
    },
  );

  async function logout(): Promise<void> {
    const token = ports.getToken();
    try {
      await axios.post(
        `${ports.baseURL}${logoutPath}`,
        {},
        {
          withCredentials: true,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
    } catch {
      // logout is best-effort: the local session is dropped either way
    }
    ports.setToken(null);
    ports.onLoggedOut?.();
  }

  return { client, refresh, logout };
}
