import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

// Bloques visuales de las páginas públicas de reserva (/reservar, /reserva/<token>).
// Mismo lenguaje que el link de confirmación de turno (components/turno/shift-confirmation.tsx):
// mobile-first, tarjetas redondeadas, botones grandes y variables de color de `.landing`.

export const btnBase =
  "inline-flex w-full items-center justify-center gap-2 rounded-full font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60";
export const btnPrimary = cn(
  btnBase,
  "h-14 bg-[var(--primary)] text-[17px] text-white shadow-[0_8px_20px_rgba(10,138,158,0.28)] hover:bg-[var(--primary-hover)] focus-visible:ring-[var(--primary-soft-2)]",
);
export const btnOutline = cn(
  btnBase,
  "h-12 border border-[var(--border-strong)] bg-white text-[16px] text-[var(--ink-2)] hover:border-[var(--primary)] hover:text-[var(--primary-deep)] focus-visible:ring-[var(--primary-soft-2)]",
);
export const btnDanger = cn(
  btnBase,
  "h-12 bg-rose-600 text-[16px] text-white shadow-[0_8px_20px_rgba(225,29,72,0.22)] hover:bg-rose-700 focus-visible:ring-rose-200",
);
export const btnWhatsapp = cn(
  btnBase,
  "h-12 bg-[#25D366] text-[16px] text-white shadow-[0_8px_20px_rgba(37,211,102,0.25)] hover:bg-[#1ebe5b] focus-visible:ring-green-200",
);
export const linkMuted =
  "text-[14px] font-medium text-[var(--muted)] underline underline-offset-4 hover:text-[var(--ink-2)]";

/**
 * `.landing a { color: inherit; text-decoration: none }` (globals.css, fuera de
 * @layer) le gana a las utilidades de Tailwind en los <a>: el color y el
 * subrayado de los links van inline.
 */
export const linkMutedStyle: CSSProperties = {
  color: "var(--muted)",
  textDecoration: "underline",
  textUnderlineOffset: "4px",
};

export function PublicShell({
  clinicName,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  clinicName?: string | null;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Un poco más ancho en desktop (asistente con grilla de horarios). */
  wide?: boolean;
}) {
  return (
    <div className="landing min-h-dvh">
      <main
        className={cn(
          "mx-auto flex min-h-dvh w-full flex-col px-5 pb-8 pt-6 sm:pt-12",
          wide ? "max-w-xl" : "max-w-md",
        )}
      >
        <header className="mb-6 flex items-center gap-[11px]">
          <Link href="/" aria-label="Ir al inicio" className="shrink-0">
            <span
              aria-hidden
              className="grid h-[38px] w-[38px] place-items-center rounded-[11px] text-white"
              style={{
                background: "linear-gradient(150deg, var(--primary), var(--primary-deep))",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12), 0 6px 14px rgba(10,138,158,0.3)",
              }}
            >
              <Stethoscope className="h-[21px] w-[21px]" />
            </span>
          </Link>
          <div className="min-w-0 leading-tight">
            {clinicName ? (
              <p className="truncate text-[17px] font-bold tracking-tight text-[var(--ink)]">{clinicName}</p>
            ) : null}
            <p
              className={
                clinicName
                  ? "text-[13px] font-medium text-[var(--muted)]"
                  : "text-[15px] font-semibold text-[var(--ink-2)]"
              }
            >
              {subtitle}
            </p>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        {footer ? <footer className="mt-8 space-y-3 text-center">{footer}</footer> : null}
      </main>
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn("rounded-3xl border border-[var(--border)] bg-white p-5 sm:p-6", className)}
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      {children}
    </section>
  );
}

export function MessageState({
  icon,
  title,
  text,
  action,
  tone = "primary",
}: {
  icon: ReactNode;
  title: string;
  text: ReactNode;
  action?: ReactNode;
  tone?: "primary" | "warning" | "danger";
}) {
  return (
    <Panel className="text-center">
      <div
        className={cn(
          "mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full",
          tone === "primary" && "bg-[var(--primary-soft)] text-[var(--primary-deep)]",
          tone === "warning" && "bg-amber-50 text-amber-700",
          tone === "danger" && "bg-rose-50 text-rose-700",
        )}
      >
        {icon}
      </div>
      <h1 className="text-[22px] font-bold tracking-tight text-[var(--ink)]">{title}</h1>
      <div className="mt-2 text-[16px] text-[var(--ink-2)]">{text}</div>
      {action ? <div className="mt-6 space-y-3">{action}</div> : null}
    </Panel>
  );
}

export function Notice({ tone, children }: { tone: "error" | "info" | "success"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl px-4 py-3 text-[14.5px]",
        tone === "error" && "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
        tone === "info" && "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
        tone === "success" && "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
      )}
    >
      {children}
    </p>
  );
}

export function PanelSkeleton({ label }: { label: string }) {
  return (
    <Panel>
      <div className="animate-pulse space-y-4" aria-hidden>
        <div className="h-7 w-2/3 rounded-lg bg-[var(--section-tint)]" />
        <div className="h-24 rounded-2xl bg-[var(--section-tint)]" />
        <div className="h-5 w-1/2 rounded bg-[var(--section-tint)]" />
        <div className="h-5 w-3/4 rounded bg-[var(--section-tint)]" />
        <div className="h-14 rounded-full bg-[var(--section-tint)]" />
      </div>
      <p className="sr-only" role="status">
        {label}
      </p>
    </Panel>
  );
}

/**
 * Barra de acciones que queda pegada abajo en mobile mientras se scrollea el
 * paso (listas largas de profesionales u horarios). Va fuera del Panel.
 */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-10 -mx-5 mt-2 px-5 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{ background: "linear-gradient(to top, var(--bg) 72%, rgba(244,250,250,0))" }}
    >
      {children}
    </div>
  );
}

/** Inicial para el avatar del profesional ("Dra. López" → "L"). */
export function medicInitial(shortName: string): string {
  const words = shortName
    .replace(/\b(dra?|lic|lcda?|klgo|kgo|od|ps|nutr)\.?\s+/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const w = words[words.length - 1] ?? shortName;
  return (w.charAt(0) || "?").toUpperCase();
}

export function MedicAvatar({ shortName, color, size = 44 }: { shortName: string; color?: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: color || "linear-gradient(150deg, var(--primary), var(--primary-deep))",
      }}
    >
      {medicInitial(shortName)}
    </span>
  );
}
