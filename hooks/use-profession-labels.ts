"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { DEFAULT_LABELS, type ProfessionLabels } from "@/lib/profession-labels";

/**
 * Hook to get profession-specific labels for a given user (professional).
 * Fetches the ProfessionConfig via the user's specialization.
 * Falls back to DEFAULT_LABELS if no config found.
 *
 * Uses SWR for automatic caching and deduplication.
 *
 * @param userId - The professional's user ID (medic, psychologist, etc.)
 */
export function useProfessionLabels(userId?: string | null): ProfessionLabels {
  const { data: config } = useSWR(
    userId ? `/api/users/${userId}/profession-config` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 300000, // 5 minutes — profession configs rarely change
    }
  );

  const labels = useMemo<ProfessionLabels>(() => {
    if (!config || typeof config !== "object") return DEFAULT_LABELS;

    const c = config as Record<string, string>;
    return {
      professionalLabel: c.professionalLabel ?? DEFAULT_LABELS.professionalLabel,
      patientLabel: c.patientLabel ?? DEFAULT_LABELS.patientLabel,
      prescriptionLabel: c.prescriptionLabel ?? DEFAULT_LABELS.prescriptionLabel,
      evolutionLabel: c.evolutionLabel ?? DEFAULT_LABELS.evolutionLabel,
      clinicalRecordLabel: c.clinicalRecordLabel ?? DEFAULT_LABELS.clinicalRecordLabel,
      professionName: c.name ?? DEFAULT_LABELS.professionName,
    };
  }, [config]);

  return labels;
}

/**
 * Clear the SWR cache for profession labels.
 * Import and call mutate from swr to invalidate specific keys if needed.
 */
export { mutate as clearLabelsCache } from "swr";
