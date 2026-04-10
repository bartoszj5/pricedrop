"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get("search") ?? "";

  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  const [value, setValue] = useState(urlSearch);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived state sync — when the URL search param changes (e.g. back/forward
  // navigation or category switch), reset the controlled input to match.
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch);
    setValue(urlSearch);
  }

  function navigateWithSearch(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = nextValue.trim();
    if (trimmed) {
      params.set("search", trimmed);
    } else {
      params.delete("search");
    }
    params.delete("page");

    const targetPath =
      pathname === "/" || pathname === "/games" ? pathname : "/";
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${targetPath}?${query}` : targetPath, {
        scroll: false,
      });
    });
  }

  useEffect(() => {
    if (value === urlSearch) return;

    debounceRef.current = setTimeout(() => {
      navigateWithSearch(value);
    }, 400);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, urlSearch]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    navigateWithSearch(value);
  }

  return (
    <form
      onSubmit={submit}
      className="flex h-11 w-full items-center gap-2 rounded-full border border-border bg-bg-tertiary px-5 focus-within:border-accent focus-within:bg-bg-secondary focus-within:shadow-sm"
    >
      <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      <input
        type="search"
        aria-label="Szukaj produktów"
        placeholder="Szukaj... np. PlayStation 5"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
      />
      <button
        type="submit"
        aria-label="Szukaj"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:brightness-110"
      >
        <Search className="h-4 w-4" />
      </button>
    </form>
  );
}
