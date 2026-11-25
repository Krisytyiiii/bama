export interface ApiClientPorts {
  baseURL: string | undefined;
  getToken: () => string | null;
  setToken: (token: string | null) => void;
  // Desk-specific headers (term scope, cache-bust flag); platform-agnostic.
  extraHeaders?: () => Record<string, string> | undefined;
  // Called once the session is unrecoverable — the app decides where to send the user.
  onSessionExpired?: () => void;
  // Called after a successful logout so the app can clear its own caches.
  onLoggedOut?: () => void;
  refreshPath?: string;
  logoutPath?: string;
}

export interface ApiClientHandle {
  client: import("axios").AxiosInstance;
  refresh: () => Promise<string | null>;
  logout: () => Promise<void>;
}
