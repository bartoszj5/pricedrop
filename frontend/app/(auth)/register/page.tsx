"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../lib/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (username.length < 3 || username.length > 100) {
      setError("Nazwa użytkownika musi mieć od 3 do 100 znaków");
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setError("Nazwa użytkownika może zawierać tylko litery, cyfry, myślniki i podkreślenia");
      return;
    }
    if (password !== confirmPassword) {
      setError("Hasla nie sa identyczne");
      return;
    }
    if (password.length < 8) {
      setError("Hasło musi mieć co najmniej 8 znaków");
      return;
    }

    setSubmitting(true);
    try {
      await register(username, email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejestracja nie powiodla sie");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-shell flex items-start justify-center pt-12 sm:pt-20">
      <div className="section-card w-full max-w-md p-8 sm:p-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] border border-border bg-bg-card text-accent shadow-[var(--shadow-card)]">
            <UserPlus className="h-7 w-7" />
          </div>
          <h1 className="display-title text-3xl text-text-primary">Zaloz konto</h1>
          <p className="mt-2 text-sm text-text-muted">
            Stworz konto, aby ustawiac alerty cenowe
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
              minLength={3}
              maxLength={100}
              pattern="[a-zA-Z0-9_\-]+"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-2xl border border-border bg-bg-card px-4 py-3 text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="jan_kowalski"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-text-secondary">
              E-mail
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-2xl border border-border bg-bg-card px-4 py-3 text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="jan@example.com"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-text-secondary">
              Hasło
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-2xl border border-border bg-bg-card px-4 py-3 text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="Min. 8 znakow"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-text-secondary">
              Powtorz haslo
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-2xl border border-border bg-bg-card px-4 py-3 text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="********"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex items-center justify-center gap-2 rounded-full border border-accent bg-accent px-6 py-3 text-sm font-bold text-white shadow-[var(--shadow-card)] hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? "Rejestracja..." : "Zaloz konto"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          Masz juz konto?{" "}
          <Link
            href="/login"
            className="font-semibold text-accent hover:underline"
          >
            Zaloguj się
          </Link>
        </p>
      </div>
    </div>
  );
}
