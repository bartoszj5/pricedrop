"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type NotificationChannel = "email" | "discord" | "both";
export type DeliverySummaryStatus = "sent" | "partial" | "failed" | "skipped";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  discord_webhook_url: string | null;
  notification_channel: NotificationChannel;
  is_active: boolean;
}

export interface AlertInfo {
  id: number;
  product_id: number;
  target_price: number | null;
  currency: string;
  is_active: boolean;
  triggered_at: string | null;
  created_at: string;
  last_delivery_status: DeliverySummaryStatus | null;
}

interface RawAlertResponse {
  id: number;
  product_id: number;
  target_price: string | number | null;
  currency: string;
  is_active: boolean;
  triggered_at: string | null;
  created_at: string;
  last_delivery_status: DeliverySummaryStatus | null;
}

function parseAlert(raw: RawAlertResponse): AlertInfo {
  return {
    ...raw,
    target_price:
      raw.target_price == null || raw.target_price === ""
        ? null
        : Number(raw.target_price),
  };
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  updateSettings: (settings: {
    discord_webhook_url?: string | null;
    notification_channel?: NotificationChannel;
  }) => Promise<AuthUser>;
  likedProductIds: number[];
  isLiked: (productId: number) => boolean;
  likeProduct: (productId: number) => Promise<void>;
  unlikeProduct: (productId: number) => Promise<void>;
  toggleLike: (productId: number) => Promise<void>;
  refreshLikes: () => Promise<number[]>;
  getAlert: (productId: number) => AlertInfo | undefined;
  setTargetPrice: (productId: number, targetPrice: number | null) => Promise<AlertInfo>;
  refreshAlerts: () => Promise<AlertInfo[]>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function normalizeApiBase(base: string): string {
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function resolveApiBase(): string {
  if (typeof window === "undefined") return "";

  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  const currentHost = window.location.hostname;

  if (configured) {
    if (/^https?:\/\//i.test(configured)) {
      try {
        const configuredHost = new URL(configured).hostname;
        // Public pages cannot call loopback addresses in modern browsers.
        if (isLoopbackHost(configuredHost) && !isLoopbackHost(currentHost)) {
          return `${window.location.protocol}//${currentHost}:8000`;
        }
      } catch {
        // Ignore parse errors and use the configured value below.
      }
    }
    return normalizeApiBase(configured);
  }

  return `${window.location.protocol}//${currentHost}:8000`;
}

const API_BASE = resolveApiBase();

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function withCsrfHeader(options: RequestInit): RequestInit {
  const method = (options.method ?? "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return options;
  const token = getCsrfToken();
  if (!token) return options;
  const headers = new Headers(options.headers ?? undefined);
  if (!headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", token);
  }
  return { ...options, headers };
}

function formatApiError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) =>
        entry && typeof entry === "object" && "msg" in entry
          ? String((entry as { msg: unknown }).msg)
          : null,
      )
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length) return messages.join("; ");
  }
  return null;
}

let refreshPromise: Promise<boolean> | null = null;

async function parseJsonOrEmpty<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const prepared = withCsrfHeader(options);
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...prepared,
  });
  if (res.status === 401 && path !== "/auth/refresh" && path !== "/auth/login") {
    if (!refreshPromise) {
      refreshPromise = tryRefresh().finally(() => { refreshPromise = null; });
    }
    const refreshed = await refreshPromise;
    if (refreshed) {
      const retry = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...withCsrfHeader(options),
      });
      if (retry.ok) return parseJsonOrEmpty<T>(retry);
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(formatApiError(body) ?? `Request failed (${res.status})`);
  }
  return parseJsonOrEmpty<T>(res);
}

async function loadUser(): Promise<AuthUser | null> {
  try {
    return await apiFetch<AuthUser>("/auth/me");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [likedProductIds, setLikedProductIds] = useState<number[]>([]);
  const [alertsByProduct, setAlertsByProduct] = useState<Record<number, AlertInfo>>({});

  useEffect(() => {
    let cancelled = false;
    loadUser().then((result) => {
      if (cancelled) return;
      setUser(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const body = new URLSearchParams({ username, password });
    await apiFetch<{ access_token: string }>("/auth/login", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const me = await loadUser();
    setUser(me);
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
      headers: { "Content-Type": "application/json" },
    });
    await login(username, password);
  }, [login]);

  const refreshLikes = useCallback(async () => {
    if (!user) {
      return [];
    }

    try {
      const ids = await apiFetch<number[]>("/likes/ids");
      const uniqueIds = Array.from(new Set(ids));
      setLikedProductIds(uniqueIds);
      return uniqueIds;
    } catch {
      setLikedProductIds([]);
      return [];
    }
  }, [user]);

  const refreshAlerts = useCallback(async () => {
    if (!user) {
      setAlertsByProduct({});
      return [];
    }
    try {
      const raw = await apiFetch<RawAlertResponse[]>("/alerts/?is_active=true");
      const parsed = raw.map(parseAlert);
      const map: Record<number, AlertInfo> = {};
      for (const alert of parsed) {
        map[alert.product_id] = alert;
      }
      setAlertsByProduct(map);
      return parsed;
    } catch {
      setAlertsByProduct({});
      return [];
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    queueMicrotask(() => {
      void refreshLikes();
      void refreshAlerts();
    });
  }, [user, refreshLikes, refreshAlerts]);

  const likeProduct = useCallback(async (productId: number) => {
    await apiFetch(`/likes/${productId}`, { method: "POST" });
    setLikedProductIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
  }, []);

  const unlikeProduct = useCallback(async (productId: number) => {
    await apiFetch(`/likes/${productId}`, { method: "DELETE" });
    setLikedProductIds((prev) => prev.filter((id) => id !== productId));
    setAlertsByProduct((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  const getAlert = useCallback(
    (productId: number) => alertsByProduct[productId],
    [alertsByProduct],
  );

  const setTargetPrice = useCallback(
    async (productId: number, targetPrice: number | null) => {
      const raw = await apiFetch<RawAlertResponse>(
        `/alerts/by-product/${productId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ target_price: targetPrice, currency: "PLN" }),
          headers: { "Content-Type": "application/json" },
        },
      );
      const alert = parseAlert(raw);
      setAlertsByProduct((prev) => ({ ...prev, [productId]: alert }));
      setLikedProductIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
      return alert;
    },
    [],
  );

  const isLiked = useCallback(
    (productId: number) => likedProductIds.includes(productId),
    [likedProductIds],
  );

  const toggleLike = useCallback(async (productId: number) => {
    if (likedProductIds.includes(productId)) {
      await unlikeProduct(productId);
      return;
    }
    await likeProduct(productId);
  }, [likedProductIds, likeProduct, unlikeProduct]);

  const updateSettings = useCallback(async (settings: {
    discord_webhook_url?: string | null;
    notification_channel?: NotificationChannel;
  }) => {
    const payload: Record<string, unknown> = {};
    if (settings.discord_webhook_url !== undefined) {
      payload.discord_webhook_url = settings.discord_webhook_url?.trim() || null;
    }
    if (settings.notification_channel !== undefined) {
      payload.notification_channel = settings.notification_channel;
    }
    const updated = await apiFetch<AuthUser>("/auth/me/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    setUser(updated);
    return updated;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setLikedProductIds([]);
    setAlertsByProduct({});
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      updateSettings,
      likedProductIds,
      isLiked,
      likeProduct,
      unlikeProduct,
      toggleLike,
      refreshLikes,
      getAlert,
      setTargetPrice,
      refreshAlerts,
      logout,
    }),
    [
      user,
      loading,
      login,
      register,
      updateSettings,
      likedProductIds,
      isLiked,
      likeProduct,
      unlikeProduct,
      toggleLike,
      refreshLikes,
      getAlert,
      setTargetPrice,
      refreshAlerts,
      logout,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
