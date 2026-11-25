export interface ApiClientPorts {
  baseURL: string | undefined;
  getToken: () => string | null;
  setToken: (token: string | null) => void;
  extraHeaders?: () => Record<string, string> | undefined;
  onSessionExpired?: () => void;
  onLoggedOut?: () => void;
  refreshPath?: string;
  logoutPath?: string;
}

export interface ApiClientHandle {
  client: import("axios").AxiosInstance;
  refresh: () => Promise<string | null>;
  logout: () => Promise<void>;
}
