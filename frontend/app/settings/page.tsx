"use client";

import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Link2,
  Loader2,
  LogIn,
  Mail,
  MessageSquare,
  Save,
  Send,
  Settings2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  useAuth,
  type NotificationChannel,
} from "../lib/auth";
import { formatPrice, timeAgo } from "../lib/utils";

type DeliveryStatus = "sent" | "partial" | "failed" | "skipped";
type DeliveryChannel = "email" | "discord";

interface NotificationWarning {
  code: string;
  message: string;
}

interface NotificationStatusResponse {
  notification_channel: NotificationChannel;
  discord_configured: boolean;
  email_configured: boolean;
  service_available: boolean;
  selected_channels: DeliveryChannel[];
  effective_channels: DeliveryChannel[];
  warnings: NotificationWarning[];
}

interface NotificationTestResponse {
  status: DeliveryStatus;
  deliveries: {
    channel: DeliveryChannel;
    status: DeliveryStatus;
    reason: string | null;
    error_message: string | null;
  }[];
}

interface NotificationHistoryItem {
  id: number;
  delivery_group_id: string;
  alert_id: number | null;
  product_id: number | null;
  event_type: "price_drop" | "test";
  channel: DeliveryChannel;
  status: DeliveryStatus;
  reason: string | null;
  error_message: string | null;
  product_title: string | null;
  store: string | null;
  old_price: string | number | null;
  new_price: string | number | null;
  target_price: string | number | null;
  currency: string;
  product_url: string | null;
  created_at: string;
}

function isDiscordWebhookUrl(value: string): boolean {
  return /^https:\/\/(discord(?:app)?\.com)\/api\/webhooks\/.+/i.test(value);
}

function asNumber(value: string | number | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const CHANNEL_OPTIONS: { value: NotificationChannel; label: string; hint: string }[] = [
  { value: "email", label: "Email", hint: "Tylko na Twój email" },
  { value: "discord", label: "Discord", hint: "Tylko przez Discord webhook" },
  { value: "both", label: "Oba kanały", hint: "Email i Discord równocześnie" },
];

const STATUS_COPY: Record<DeliveryStatus, string> = {
  sent: "Wysłane",
  partial: "Częściowo wysłane",
  failed: "Błąd wysyłki",
  skipped: "Pominięte",
};

const REASON_COPY: Record<string, string> = {
  discord_webhook_missing: "Brak webhooka Discord.",
  email_not_configured: "SMTP nie jest skonfigurowane.",
  delivery_failed: "Kanał zwrócił błąd.",
};

function channelLabel(channel: DeliveryChannel): string {
  return channel === "discord" ? "Discord" : "Email";
}

function statusClass(status: DeliveryStatus): string {
  if (status === "sent") {
    return "border-accent-green/40 bg-accent-green-soft text-accent-green";
  }
  if (status === "failed") {
    return "border-accent-red/40 bg-accent-red/8 text-accent-red";
  }
  return "border-accent-amber/40 bg-[var(--warning-surface)] text-accent-amber";
}

function statusIcon(status: DeliveryStatus) {
  if (status === "sent") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "failed") return <XCircle className="h-4 w-4" />;
  return <AlertTriangle className="h-4 w-4" />;
}

export default function SettingsPage() {
  const { user, loading, updateSettings } = useAuth();
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [notificationChannel, setNotificationChannel] =
    useState<NotificationChannel>("both");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notificationStatus, setNotificationStatus] =
    useState<NotificationStatusResponse | null>(null);
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [testResult, setTestResult] = useState<NotificationTestResponse | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setDiscordWebhookUrl(user?.discord_webhook_url ?? "");
    setNotificationChannel(user?.notification_channel ?? "both");
  }, [user?.discord_webhook_url, user?.notification_channel]);

  const hasUnsavedChanges = useMemo(() => {
    const savedWebhook = user?.discord_webhook_url ?? "";
    const savedChannel = user?.notification_channel ?? "both";
    return (
      discordWebhookUrl.trim() !== savedWebhook ||
      notificationChannel !== savedChannel
    );
  }, [discordWebhookUrl, notificationChannel, user]);

  const loadNotificationPanel = useCallback(async () => {
    if (!user) {
      setNotificationStatus(null);
      setHistory([]);
      return;
    }
    setLoadingPanel(true);
    setPanelError(null);
    try {
      const [status, historyItems] = await Promise.all([
        apiFetch<NotificationStatusResponse>("/notifications/status"),
        apiFetch<NotificationHistoryItem[]>("/notifications/history?limit=20"),
      ]);
      setNotificationStatus(status);
      setHistory(historyItems);
    } catch (err) {
      setPanelError(
        err instanceof Error
          ? err.message
          : "Nie udało się pobrać statusu powiadomień",
      );
    } finally {
      setLoadingPanel(false);
    }
  }, [user]);

  useEffect(() => {
    if (loading) return;
    void loadNotificationPanel();
  }, [loading, loadNotificationPanel]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setTestResult(null);

    const normalized = discordWebhookUrl.trim();
    if (normalized && !isDiscordWebhookUrl(normalized)) {
      setError("Podaj poprawny Discord webhook URL (https://)");
      return;
    }

    if (notificationChannel === "discord" && !normalized) {
      setError("Kanał Discord wymaga ustawienia webhook URL");
      return;
    }

    setSubmitting(true);
    try {
      await updateSettings({
        discord_webhook_url: normalized || null,
        notification_channel: notificationChannel,
      });
      setSuccess("Ustawienia zapisane.");
      await loadNotificationPanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zapisać ustawień");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTestNotification() {
    setError(null);
    setSuccess(null);
    setTestResult(null);
    if (hasUnsavedChanges) {
      setError("Zapisz ustawienia, aby przetestować nowe preferencje.");
      return;
    }
    setTesting(true);
    try {
      const result = await apiFetch<NotificationTestResponse>("/notifications/test", {
        method: "POST",
      });
      setTestResult(result);
      await loadNotificationPanel();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nie udało się wysłać testowego alertu",
      );
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-shell flex items-start justify-center pt-12 sm:pt-20">
        <div className="section-card w-full max-w-2xl p-8 sm:p-10">
          <p className="text-sm text-text-muted">Ładowanie ustawień...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-shell flex items-start justify-center pt-12 sm:pt-20">
        <div className="section-card w-full max-w-xl p-8 sm:p-10">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] border border-border bg-bg-card text-accent shadow-[var(--shadow-card)]">
              <LogIn className="h-7 w-7" />
            </div>
            <h1 className="display-title text-3xl text-text-primary">Ustawienia</h1>
            <p className="mt-2 text-sm text-text-muted">
              Zaloguj się, aby ustawić kanały powiadomień
            </p>
          </div>
          <div className="flex justify-center">
            <Link
              href="/login"
              className="rounded-full border border-accent bg-accent px-6 py-3 text-sm font-bold text-white shadow-[var(--shadow-card)] hover:brightness-110"
            >
              Przejdź do logowania
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const selectedChannels = notificationStatus?.selected_channels ?? [];
  const effectiveChannels = notificationStatus?.effective_channels ?? [];
  const canSendAny = effectiveChannels.length > 0;

  return (
    <main className="page-shell flex flex-col gap-6">
      <section className="section-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="eyebrow">Panel użytkownika</span>
            <h1 className="display-title mt-2 text-4xl text-text-primary">
              Powiadomienia
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Kanał, test wysyłki i historia prób dla alertów cenowych.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="paper-chip">
              <Mail className="h-4 w-4" />
              {notificationStatus?.email_configured ? "SMTP aktywne" : "SMTP brak"}
            </div>
            <div className="paper-chip">
              <MessageSquare className="h-4 w-4" />
              {notificationStatus?.discord_configured ? "Webhook OK" : "Webhook brak"}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)]">
        <section className="section-card p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-border bg-bg-card text-accent shadow-[var(--shadow-card)]">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">Ustawienia kanału</h2>
              <p className="text-sm text-text-muted">
                Zapisane preferencje sterują również próbnym powiadomieniem.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && (
              <div className="rounded-2xl border border-accent-red/30 bg-accent-red/8 px-4 py-3 text-sm text-accent-red">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-2xl border border-accent-green/30 bg-accent-green-soft px-4 py-3 text-sm text-accent-green">
                {success}
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-text-secondary">
                Discord webhook URL
              </span>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  type="url"
                  value={discordWebhookUrl}
                  onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full rounded-2xl border border-border bg-bg-card py-3 pl-10 pr-4 text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-text-secondary">
                Gdzie wysyłać alerty?
              </legend>
              {CHANNEL_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-bg-card px-4 py-3 hover:border-accent/40"
                >
                  <input
                    type="radio"
                    name="notification_channel"
                    value={opt.value}
                    checked={notificationChannel === opt.value}
                    onChange={() => setNotificationChannel(opt.value)}
                    className="mt-1 accent-accent"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-text-primary">
                      {opt.label}
                    </span>
                    <span className="text-xs text-text-muted">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={testing || loadingPanel}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-bg-card px-5 py-3 text-sm font-bold text-text-primary shadow-[var(--shadow-card)] hover:border-accent/40 hover:text-accent disabled:opacity-60"
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {testing ? "Wysyłanie..." : "Wyślij próbne"}
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-accent bg-accent px-6 py-3 text-sm font-bold text-white shadow-[var(--shadow-card)] hover:brightness-110 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {submitting ? "Zapisywanie..." : "Zapisz ustawienia"}
              </button>
            </div>
          </form>
        </section>

        <section className="section-card p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-border bg-bg-card text-accent shadow-[var(--shadow-card)]">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">Status</h2>
              <p className="text-sm text-text-muted">
                Aktywne kanały:{" "}
                {effectiveChannels.length
                  ? effectiveChannels.map(channelLabel).join(", ")
                  : "brak"}
              </p>
            </div>
          </div>

          {loadingPanel ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sprawdzanie konfiguracji...
            </div>
          ) : panelError ? (
            <div className="rounded-2xl border border-accent-red/30 bg-accent-red/8 px-4 py-3 text-sm text-accent-red">
              {panelError}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  canSendAny
                    ? "border-accent-green/30 bg-accent-green-soft text-accent-green"
                    : "border-accent-amber/40 bg-[var(--warning-surface)] text-accent-amber"
                }`}
              >
                {canSendAny
                  ? "Co najmniej jeden wybrany kanał jest gotowy."
                  : "Żaden wybrany kanał nie jest gotowy do wysyłki."}
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedChannels.map((channel) => (
                  <span
                    key={channel}
                    className={`paper-chip ${
                      effectiveChannels.includes(channel)
                        ? "border-accent-green/40 bg-accent-green-soft text-accent-green"
                        : "border-accent-amber/40 bg-[var(--warning-surface)] text-accent-amber"
                    }`}
                  >
                    {channel === "discord" ? (
                      <MessageSquare className="h-4 w-4" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    {channelLabel(channel)}
                  </span>
                ))}
              </div>

              {notificationStatus?.warnings.map((warning) => (
                <div
                  key={warning.code}
                  className="rounded-2xl border border-accent-amber/40 bg-[var(--warning-surface)] px-4 py-3 text-sm text-accent-amber"
                >
                  {warning.message}
                </div>
              ))}
            </div>
          )}

          {testResult && (
            <div className="mt-5 border-t border-border pt-5">
              <div className={`paper-chip ${statusClass(testResult.status)}`}>
                {statusIcon(testResult.status)}
                Test: {STATUS_COPY[testResult.status]}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {testResult.deliveries.map((delivery) => (
                  <div
                    key={`${delivery.channel}-${delivery.status}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-bg-card px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-text-primary">
                      {channelLabel(delivery.channel)}
                    </span>
                    <span className={`paper-chip ${statusClass(delivery.status)}`}>
                      {STATUS_COPY[delivery.status]}
                    </span>
                    {(delivery.reason || delivery.error_message) && (
                      <span className="w-full text-xs text-text-muted">
                        {delivery.reason
                          ? REASON_COPY[delivery.reason] ?? delivery.reason
                          : delivery.error_message}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="section-card p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-border bg-bg-card text-accent shadow-[var(--shadow-card)]">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">Historia powiadomień</h2>
              <p className="text-sm text-text-muted">
                Ostatnie próby wysyłki, łącznie z pominiętymi kanałami.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadNotificationPanel()}
            disabled={loadingPanel}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-bg-card px-4 py-2 text-xs font-bold text-text-secondary hover:border-accent/40 hover:text-accent disabled:opacity-60"
          >
            {loadingPanel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Odśwież
          </button>
        </div>

        {history.length === 0 ? (
          <div className="rounded-2xl border border-border bg-bg-card px-4 py-6 text-center text-sm text-text-muted">
            Brak zapisanych prób powiadomień.
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
            {history.map((item) => {
              const price = asNumber(item.new_price);
              const target = asNumber(item.target_price);
              const reason = item.reason
                ? REASON_COPY[item.reason] ?? item.reason
                : item.error_message;

              return (
                <div
                  key={item.id}
                  className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`paper-chip ${statusClass(item.status)}`}>
                        {statusIcon(item.status)}
                        {STATUS_COPY[item.status]}
                      </span>
                      <span className="paper-chip">
                        {item.channel === "discord" ? (
                          <MessageSquare className="h-4 w-4" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                        {channelLabel(item.channel)}
                      </span>
                      <span className="paper-chip">
                        {item.event_type === "test" ? "Test" : "Alert cenowy"}
                      </span>
                    </div>
                    <p className="truncate text-sm font-bold text-text-primary">
                      {item.product_title ?? "Powiadomienie"}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {item.event_type === "price_drop" && price != null
                        ? `Cena: ${formatPrice(price, item.currency)}${
                            target != null
                              ? `, cel: ${formatPrice(target, item.currency)}`
                              : ""
                          }`
                        : "Próba testowa ustawień powiadomień"}
                    </p>
                    {reason && (
                      <p className="mt-1 text-xs font-semibold text-text-secondary">
                        {reason}
                      </p>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-text-muted sm:text-right">
                    {timeAgo(item.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
