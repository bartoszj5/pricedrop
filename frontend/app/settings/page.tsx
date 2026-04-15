"use client";

import { Link2, LogIn, Save, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth, type NotificationChannel } from "../lib/auth";

function isDiscordWebhookUrl(value: string): boolean {
  return /^https:\/\/(discord(?:app)?\.com)\/api\/webhooks\/.+/i.test(value);
}

const CHANNEL_OPTIONS: { value: NotificationChannel; label: string; hint: string }[] = [
  { value: "email", label: "Email", hint: "Tylko na Twoj email" },
  { value: "discord", label: "Discord", hint: "Tylko przez Discord webhook" },
  { value: "both", label: "Oba kanaly", hint: "Email i Discord rownoczesnie" },
];

export default function SettingsPage() {
  const { user, loading, updateSettings } = useAuth();
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [notificationChannel, setNotificationChannel] =
    useState<NotificationChannel>("both");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDiscordWebhookUrl(user?.discord_webhook_url ?? "");
    setNotificationChannel(user?.notification_channel ?? "both");
  }, [user?.discord_webhook_url, user?.notification_channel]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const normalized = discordWebhookUrl.trim();
    if (normalized && !isDiscordWebhookUrl(normalized)) {
      setError("Podaj poprawny Discord webhook URL (https://)");
      return;
    }

    if (notificationChannel === "discord" && !normalized) {
      setError("Kanal Discord wymaga ustawienia webhook URL");
      return;
    }

    setSubmitting(true);
    try {
      await updateSettings({
        discord_webhook_url: normalized || null,
        notification_channel: notificationChannel,
      });
      setSuccess("Ustawienia zapisane.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udalo sie zapisac ustawien");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-shell flex items-start justify-center pt-12 sm:pt-20">
        <div className="section-card w-full max-w-2xl p-8 sm:p-10">
          <p className="text-sm text-text-muted">Ladowanie ustawien...</p>
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
              Zaloguj sie, aby ustawic webhook Discord
            </p>
          </div>
          <div className="flex justify-center">
            <Link
              href="/login"
              className="rounded-full border border-accent bg-accent px-6 py-3 text-sm font-bold text-white shadow-[var(--shadow-card)] hover:brightness-110"
            >
              Przejdz do logowania
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell flex items-start justify-center pt-12 sm:pt-20">
      <div className="section-card w-full max-w-2xl p-8 sm:p-10">
        <div className="mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] border border-border bg-bg-card text-accent shadow-[var(--shadow-card)]">
            <Settings2 className="h-7 w-7" />
          </div>
          <h1 className="display-title text-center text-3xl text-text-primary">Ustawienia konta</h1>
          <p className="mt-2 text-center text-sm text-text-muted">
            Dodaj Discord webhook, aby dostawac alerty o spadkach cen
          </p>
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

          <p className="text-xs text-text-muted">
            Pole mozesz zostawic puste, jesli nie chcesz dostawac alertow na Discord.
          </p>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-text-secondary">
              Gdzie wysylac alerty?
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

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full border border-accent bg-accent px-6 py-3 text-sm font-bold text-white shadow-[var(--shadow-card)] hover:brightness-110 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {submitting ? "Zapisywanie..." : "Zapisz ustawienia"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
