"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowRight, Shield, MessageCircle, Loader2 } from "lucide-react";
import { contactRequestSchema, type ContactRequestInput } from "@/lib/validations";
import type { PublicSpecialization } from "@/types";

interface Props {
  specializations: PublicSpecialization[];
  healthInsurances: { id: string; name: string }[];
  whatsappPrimary: string | null;
}

export function LandingContactForm({ specializations, healthInsurances, whatsappPrimary }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactRequestInput>({
    resolver: zodResolver(contactRequestSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      healthInsurance: "",
      specializationId: "",
      preferredDay: "",
      message: "",
    },
  });

  async function onSubmit(values: ContactRequestInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/contact-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          toast.error("Estás enviando demasiadas solicitudes. Probá de nuevo en unos minutos.");
        } else {
          toast.error(json.error ?? "No pudimos enviar tu solicitud");
        }
        return;
      }
      toast.success("¡Solicitud enviada! Te abrimos WhatsApp para terminar de coordinar.");
      reset();
      if (json.data?.whatsappLink) {
        window.open(json.data.whatsappLink, "_blank", "noopener,noreferrer");
      }
    } catch {
      toast.error("Error de conexión. Probá de nuevo en unos minutos.");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass =
    "w-full rounded-lg border bg-[color:var(--surface-2)] px-3.5 py-3 text-[15px] transition focus:bg-white focus:outline-none";
  const fieldStyle: React.CSSProperties = { borderColor: "var(--border-strong)", color: "var(--ink)" };
  const labelClass = "text-[13.5px] font-semibold";
  const labelStyle: React.CSSProperties = { color: "var(--ink-2)" };
  const errorClass = "mt-1 text-[12.5px]";
  const errorStyle: React.CSSProperties = { color: "#c2384b" };

  return (
    <div
      className="rounded-[18px] border bg-white p-[30px] shadow-[0_4px_14px_rgba(10,34,48,0.06)]"
      style={{ borderColor: "var(--border)" }}
    >
      <h3 className="mb-1.5 text-[22px] font-bold tracking-[-0.02em]" style={{ color: "var(--ink)" }}>
        Solicitar un turno
      </h3>
      <p className="mb-6 text-[15px]" style={{ color: "var(--muted)" }}>
        Completá tus datos y te contactamos para confirmar día y horario.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-[7px]">
            <label htmlFor="f-nombre" className={labelClass} style={labelStyle}>
              Nombre y apellido
            </label>
            <input
              id="f-nombre"
              type="text"
              placeholder="Tu nombre completo"
              className={fieldClass}
              style={fieldStyle}
              {...register("fullName")}
            />
            {errors.fullName && <p className={errorClass} style={errorStyle}>{errors.fullName.message}</p>}
          </div>

          <div className="flex flex-col gap-[7px]">
            <label htmlFor="f-tel" className={labelClass} style={labelStyle}>
              Teléfono
            </label>
            <input
              id="f-tel"
              type="tel"
              placeholder="11 5555-5555"
              className={fieldClass}
              style={fieldStyle}
              {...register("phone")}
            />
            {errors.phone && <p className={errorClass} style={errorStyle}>{errors.phone.message}</p>}
          </div>

          <div className="flex flex-col gap-[7px]">
            <label htmlFor="f-email" className={labelClass} style={labelStyle}>
              Email
            </label>
            <input
              id="f-email"
              type="email"
              placeholder="tucorreo@email.com"
              className={fieldClass}
              style={fieldStyle}
              {...register("email")}
            />
            {errors.email && <p className={errorClass} style={errorStyle}>{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-[7px]">
            <label htmlFor="f-os" className={labelClass} style={labelStyle}>
              Obra social
            </label>
            <select id="f-os" className={fieldClass} style={fieldStyle} {...register("healthInsurance")}>
              <option value="">Seleccioná…</option>
              {healthInsurances.map((os) => (
                <option key={os.id} value={os.name}>
                  {os.name}
                </option>
              ))}
              <option value="Particular">Particular</option>
              <option value="Otra">Otra</option>
            </select>
          </div>

          <div className="flex flex-col gap-[7px]">
            <label htmlFor="f-esp" className={labelClass} style={labelStyle}>
              Especialidad
            </label>
            <select id="f-esp" className={fieldClass} style={fieldStyle} {...register("specializationId")}>
              <option value="">Seleccioná…</option>
              {specializations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-[7px]">
            <label htmlFor="f-dia" className={labelClass} style={labelStyle}>
              Día preferido
            </label>
            <select id="f-dia" className={fieldClass} style={fieldStyle} {...register("preferredDay")}>
              <option value="">Sin preferencia</option>
              <option value="Lunes">Lunes</option>
              <option value="Martes">Martes</option>
              <option value="Miércoles">Miércoles</option>
              <option value="Jueves">Jueves</option>
              <option value="Viernes">Viernes</option>
              <option value="Sábado">Sábado</option>
            </select>
          </div>

          <div className="col-span-full flex flex-col gap-[7px]">
            <label htmlFor="f-msg" className={labelClass} style={labelStyle}>
              Motivo de la consulta <span style={{ fontWeight: 400, color: "var(--muted-2)" }}>(opcional)</span>
            </label>
            <textarea
              id="f-msg"
              rows={3}
              placeholder="Contanos brevemente el motivo"
              className={`${fieldClass} min-h-24 resize-y`}
              style={fieldStyle}
              {...register("message")}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-full px-[22px] py-[13px] text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(10,138,158,0.28)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ background: "var(--primary)" }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                Enviar solicitud
                <ArrowRight className="h-[18px] w-[18px]" />
              </>
            )}
          </button>

          {whatsappPrimary && (
            <a
              href={`https://wa.me/${whatsappPrimary.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border bg-white px-[22px] py-[13px] text-[15px] font-semibold transition hover:-translate-y-0.5 hover:border-[color:var(--primary)] hover:text-[color:var(--primary-deep)]"
              style={{ borderColor: "var(--border-strong)", color: "var(--ink-2)" }}
            >
              <MessageCircle className="h-[18px] w-[18px]" />
              Escribir por WhatsApp
            </a>
          )}
        </div>

        <p className="mt-4 flex items-center gap-2 text-[13px]" style={{ color: "var(--muted)" }}>
          <Shield className="h-[15px] w-[15px]" style={{ color: "var(--primary)" }} />
          Tus datos se tratan según la Ley 25.326 de Protección de Datos Personales.
        </p>
      </form>
    </div>
  );
}
