"use client";

import { ArrowUpDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

const sortOptions = [
  { label: "Nazwa A-Z", value: "title_asc" },
  { label: "Nazwa Z-A", value: "title_desc" },
  { label: "Najnowsze", value: "newest" },
  { label: "Kategoria", value: "category" },
];

export default function SortDropdown() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort") ?? "title_asc";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", e.target.value);
    params.delete("page");
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 h-9 px-3.5 rounded-lg bg-bg-tertiary text-[13px] text-text-secondary">
      <ArrowUpDown className="w-3.5 h-3.5" />
      <select
        value={current}
        onChange={handleChange}
        className="bg-transparent text-text-secondary outline-none cursor-pointer"
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-bg-secondary">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
