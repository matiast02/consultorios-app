"use client";

import Link from "next/link";
import { useState } from "react";
import { Stethoscope, Menu, X, ArrowRight } from "lucide-react";

interface Props {
  clinicName: string;
  tagline: string | null;
  isLoggedIn: boolean;
}

export function LandingNav({ clinicName, tagline, isLoggedIn }: Props) {
  const [open, setOpen] = useState(false);

  const links = [
    { href: "#inicio", label: "Inicio" },
    { href: "#equipo", label: "Equipo" },
    { href: "#horarios", label: "Horarios" },
    { href: "#contacto", label: "Contacto" },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{
        background: "rgba(244, 250, 250, 0.82)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-7">
        <Link href="/" className="flex items-center gap-[11px] font-bold tracking-tight text-[18px]" style={{ color: "var(--ink)" }}>
          <span
            className="grid h-[38px] w-[38px] place-items-center rounded-[11px] text-white"
            style={{
              background: "linear-gradient(150deg, var(--primary), var(--primary-deep))",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12), 0 6px 14px rgba(10,138,158,0.3)",
            }}
          >
            <Stethoscope className="h-[21px] w-[21px]" />
          </span>
          <span className="flex flex-col leading-tight">
            {clinicName}
            {tagline && (
              <small className="text-[11.5px] font-medium" style={{ color: "var(--muted)" }}>
                {tagline}
              </small>
            )}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-[15px] py-[9px] text-[15px] font-medium transition-colors hover:bg-[color:var(--primary-soft)] hover:text-[color:var(--primary-deep)]"
              style={{ color: "var(--ink-2)" }}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="hidden rounded-full border bg-white px-4 py-[9px] text-[13.5px] font-semibold transition-all hover:-translate-y-0.5 hover:border-[color:var(--primary)] hover:text-[color:var(--primary-deep)] md:inline-flex md:items-center md:gap-2"
            style={{ borderColor: "var(--border-strong)", color: "var(--ink-2)" }}
          >
            {isLoggedIn ? "Ir al Dashboard" : "Acceso profesional"}
            {isLoggedIn && <ArrowRight className="h-4 w-4" />}
          </Link>
          <a
            href="#contacto"
            className="inline-flex items-center gap-2 rounded-full px-4 py-[9px] text-[13.5px] font-semibold text-white shadow-[0_8px_20px_rgba(10,138,158,0.28)] transition-all hover:-translate-y-0.5"
            style={{ background: "var(--primary)" }}
          >
            Solicitar turno
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            className="grid h-[42px] w-[42px] place-items-center rounded-[10px] border bg-white md:hidden"
            style={{ borderColor: "var(--border-strong)", color: "var(--ink)" }}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 top-[72px] flex flex-col gap-1 border-b px-5 pb-[18px] pt-3 shadow-md md:hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-full px-[15px] py-[9px] text-[15px] font-medium"
              style={{ color: "var(--ink-2)" }}
            >
              {l.label}
            </a>
          ))}
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            onClick={() => setOpen(false)}
            className="mt-1 rounded-full border bg-white px-4 py-[9px] text-center text-[13.5px] font-semibold"
            style={{ borderColor: "var(--border-strong)", color: "var(--ink-2)" }}
          >
            {isLoggedIn ? "Ir al Dashboard" : "Acceso profesional"}
          </Link>
        </div>
      )}
    </header>
  );
}
