"use client";

import { useEffect, useRef, useState } from "react";
import type { Patient } from "@/types";

export interface UsePatientSearchOptions {
  /** Sin esto no se pide nada (diálogo cerrado, modo distinto). */
  enabled: boolean;
  /** Texto de búsqueda; con menos de 2 caracteres no se busca. */
  query: string;
  /** Con `true`, sin búsqueda se listan los pacientes recientes. */
  recent?: boolean;
  limit?: number;
  debounceMs?: number;
  /**
   * Paciente que debe estar siempre en la lista (el elegido o el preseleccionado):
   * si los recientes o la búsqueda no lo traen, se conserva; si no está cargado, se
   * pide aparte para que el selector muestre nombre, DNI y obra social.
   */
  pinnedId?: string | null;
}

/**
 * Búsqueda de pacientes con debounce, recientes opcionales y paciente fijado.
 * La comparten el diálogo de turno y el registro de llegadas (antes cada uno
 * tenía su copia con tres effects).
 */
export function usePatientSearch({
  enabled,
  query,
  recent = false,
  limit = 15,
  debounceMs = 300,
  pinnedId,
}: UsePatientSearchOptions) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const pinnedRef = useRef<string | null | undefined>(pinnedId);
  pinnedRef.current = pinnedId;

  /** Reemplaza la lista conservando al paciente fijado si el resultado no lo trae. */
  function replaceKeepingPinned(prev: Patient[], list: Patient[]): Patient[] {
    const id = pinnedRef.current;
    const pinned = id ? prev.find((p) => p.id === id) : undefined;
    return pinned && !list.some((p) => p.id === id) ? [pinned, ...list] : list;
  }

  const trimmed = query.trim();
  const searching = trimmed.length >= 2;

  // Recientes (sin búsqueda) o búsqueda con debounce. El pedido anterior se cancela.
  useEffect(() => {
    if (!enabled) {
      setPatients([]);
      return;
    }
    if (!searching && !recent) {
      setPatients((prev) => replaceKeepingPinned(prev, []));
      return;
    }
    const url = searching
      ? `/api/patients?search=${encodeURIComponent(trimmed)}&limit=${limit}`
      : `/api/patients?limit=${limit}`;
    const ac = new AbortController();
    const timer = setTimeout(
      async () => {
        setLoading(true);
        try {
          const res = await fetch(url, { signal: ac.signal });
          if (res.ok) {
            const json = await res.json();
            const list: Patient[] = Array.isArray(json.data) ? json.data : [];
            setPatients((prev) => replaceKeepingPinned(prev, list));
          }
        } catch {
          /* cancelado o no crítico */
        } finally {
          if (!ac.signal.aborted) setLoading(false);
        }
      },
      searching ? debounceMs : 0,
    );
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [enabled, searching, trimmed, recent, limit, debounceMs]);

  // Paciente fijado que no está en la lista: se carga aparte.
  useEffect(() => {
    if (!enabled || !pinnedId) return;
    if (patients.some((p) => p.id === pinnedId)) return;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/patients/${pinnedId}`, { signal: ac.signal });
        if (!res.ok) return;
        const json = await res.json();
        const p: Patient | undefined = json.data;
        if (p) setPatients((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]));
      } catch {
        /* cancelado o no crítico */
      }
    })();
    return () => ac.abort();
    // `patients` a propósito fuera de las dependencias: solo importa al fijar otro paciente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pinnedId]);

  return { patients, loading, searching };
}
