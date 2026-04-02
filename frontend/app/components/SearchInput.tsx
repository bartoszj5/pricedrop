"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("search") ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    setValue(searchParams.get("search") ?? "");
  }, [searchParams]);

  function push(query: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (query) {
      params.set("search", query);
    } else {
      params.delete("search");
    }
    params.delete("page");
    router.push(`/?${params.toString()}`);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => push(v), 300);
  }

  return (
    <div className="flex items-center gap-2.5 flex-1 h-10 bg-bg-tertiary rounded-xl px-4">
      <Search className="w-[18px] h-[18px] text-text-muted shrink-0" />
      <input
        type="text"
        placeholder="Szukaj gier, elektroniki, okazji..."
        value={value}
        onChange={handleChange}
        className="bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none w-full"
      />
    </div>
  );
}
