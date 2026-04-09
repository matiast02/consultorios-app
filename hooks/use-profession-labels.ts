"use client";

import { useEffect, useState, useMemo } from "react";
import { DEFAULT_LABELS, type ProfessionLabels } from "@/lib/profession-labels";

// Cache to avoid re-fetching the same user's config
const labelsCache = new Map<string, ProfessionLabels>();

/**
 * Hook to get profession-specific labels for a given user (professional).
 * Fetches the ProfessionConfig via the user's specialization.
 * Falls back to DEFAULT_LABELS if no config found.
 *
 * @param userId - The professional's user ID (medic, psychologist, etc.)
 */
export function useProfessionLabels(userId?: string | null): ProfessionLabels {
  const [labels, setLabels] = useState<ProfessionLabels>(DEFAULT_LABELS);

  useEffect(() => {
    if (!userId) {
      setLabels(DEFAULT_LABELS);
      return;
    }

    // Check cache first
    const cached = labelsCache.get(userId);
    if (cached) {
      setLabels(cached);
      return;
    }

    async function fetchLabels() {
      try {
        const res = await fetch(`/api/users/${userId}/profession-config`);
        if (res.ok) {
          const json = await res.json();
          const config = json.data;
          if (config) {
            const newLabels: ProfessionLabels = {
              professionalLabel: config.professionalLabel ?? DEFAULT_LABELS.professionalLabel,
              patientLabel: config.patientLabel ?? DEFAULT_LABELS.patientLabel,
              prescriptionLabel: config.prescriptionLabel ?? DEFAULT_LABELS.prescriptionLabel,
              evolutionLabel: config.evolutionLabel ?? DEFAULT_LABELS.evolutionLabel,
              clinicalRecordLabel: config.clinicalRecordLabel ?? DEFAULT_LABELS.clinicalRecordLabel,
              professionName: config.name ?? DEFAULT_LABELS.professionName,
            };
            labelsCache.set(userId!, newLabels);
            setLabels(newLabels);
            return;
          }
        }
      } catch {
        // Non-critical, fall back to defaults
      }
      setLabels(DEFAULT_LABELS);
    }

    fetchLabels();
  }, [userId]);

  return labels;
}

/**
 * Clear the labels cache (useful after config changes).
 */
export function clearLabelsCache() {
  labelsCache.clear();
}
