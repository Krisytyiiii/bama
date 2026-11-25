import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import type { ApiClientHandle, ApiClientPorts } from "./ports.js";

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function applyAuthHeaders(config: InternalAxiosRequestConfig, ports: ApiClientPorts) {
  const token = ports.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const extra = ports.extraHeaders?.();
  if (!extra) return config;
  for (const [key, value] of Object.entries(extra)) {
    (config.headers as Record<string, string>)[key] = value;
  }
  return config;
}

function createRefresh(ports: ApiClientPorts, refreshPath: string) {
  return async function refresh(): Promise<string | null> {
    try {
      const { data } = await axios.post(
        `${ports.baseURL}${refreshPath}`,
        {},
        { withCredentials: true },
      );
      const token = (data?.accessToken as string | undefined) ?? null;
      ports.setToken(token);
      return token;
    } catch {
      ports.setToken(null);
      return null;
    }
  };
}

function attachRefreshInterceptor(
  client: AxiosInstance,
  ports: ApiClientPorts,
  refresh: () => Promise<string | null>,
) {
  let pending: Promise<string | null> | null = null;

  client.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const original = error.config as RetryableConfig | undefined;
      if (error.response?.status !== 401 || !original || original._retry) {
        return Promise.reject(error);
      }
      original._retry = true;
      try {
        const token = await (pending ?? (pending = refresh()));
        pending = null;
        if (token) {
          original.headers.Authorization = `Bearer ${token}`;
          return client(original);
        }
        ports.onSessionExpired?.();
      } catch {
        pending = null;
        ports.onSessionExpired?.();
      }
      return Promise.reject(error);
    },
  );
}

export function createApiClient(ports: ApiClientPorts): ApiClientHandle {
  const refreshPath = ports.refreshPath ?? "/api/auth/refresh";
  const logoutPath = ports.logoutPath ?? "/api/auth/logout";

  const client = axios.create({
    baseURL: ports.baseURL,
    headers: { "Content-Type": "application/json" },
    withCredentials: true,
  });

  client.interceptors.request.use((config) => applyAuthHeaders(config, ports));

  const refresh = createRefresh(ports, refreshPath);
  attachRefreshInterceptor(client, ports, refresh);

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
