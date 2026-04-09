"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export function useCachedFetch<T>(
  url: string | null,
  options?: { refreshInterval?: number; revalidateOnFocus?: boolean; dedupingInterval?: number }
) {
  const { data, error, isLoading, mutate } = useSWR<T>(url, fetcher, {
    revalidateOnFocus: options?.revalidateOnFocus ?? false,
    refreshInterval: options?.refreshInterval,
    dedupingInterval: options?.dedupingInterval ?? 5000, // Don't refetch within 5s
  });

  return { data, error, isLoading, refresh: mutate };
}
