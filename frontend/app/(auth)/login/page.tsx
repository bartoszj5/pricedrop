"use client";

import { LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logowanie nie powiodlo sie");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-shell flex items-start justify-center pt-12 sm:pt-20">
      <div className="section-card w-full max-w-md p-8 sm:p-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] border border-border bg-bg-card text-accent shadow-[var(--shadow-card)]">
            <LogIn className="h-7 w-7" />
          </div>
          <h1 className="display-title text-3xl text-text-primary">Zaloguj się</h1>
          <p className="mt-2 text-sm text-text-muted">
            Zaloguj się, aby zarządzać alertami cenowymi
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && (
            <div className="rounded-2xl border border-accent-red/30 bg-accent-red/8 px-4 py-3 text-sm text-accent-red">
              {error}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-text-secondary">
              Nazwa użytkownika
            </span>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-2xl border border-border bg-bg-card px-4 py-3 text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="jan_kowalski"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-text-secondary">
              Hasło
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-2xl border border-border bg-bg-card px-4 py-3 text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="********"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex items-center justify-center gap-2 rounded-full border border-accent bg-accent px-6 py-3 text-sm font-bold text-white shadow-[var(--shadow-card)] hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? "Logowanie..." : "Zaloguj się"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          Nie masz konta?{" "}
          <Link
            href="/register"
            className="font-semibold text-accent hover:underline"
          >
            Zaloz konto
          </Link>
        </p>
      </div>
    </div>
  );
}
