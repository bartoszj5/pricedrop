"use server";

import { ApiError, syncGamesByTitle } from "../lib/api";
import type { ITADSearchSaveResponse } from "../types";

export interface SyncGamesActionResult {
  ok: boolean;
  data?: ITADSearchSaveResponse;
  error?: string;
  isConfigError?: boolean;
}

export async function syncGamesAction(
  title: string,
): Promise<SyncGamesActionResult> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return {
      ok: false,
      error: "Podaj tytuł gry do wyszukania.",
      isConfigError: false,
    };
  }

  try {
    const data = await syncGamesByTitle({ title: trimmedTitle });
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        error: error.message,
        isConfigError: error.status === 503,
      };
    }

    return {
      ok: false,
      error: "Nie udało się uzupełnić katalogu gier.",
      isConfigError: false,
    };
  }
}
