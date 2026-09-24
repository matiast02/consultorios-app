"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarOff, MessageCircle, Phone, RefreshCw, UserX } from "lucide-react";
import { buildWhatsappLink } from "@/lib/whatsapp";
import {
  EMPTY_BOOKING_PATIENT,
  addDaysISO,
  bookingPatientSchema,
  isPast,
  parseBookingSubmitError,
  safeManageUrl,
  todayAR,
  type BookingPatientField,
  type BookingPatientValues,
} from "@/lib/booking-client";
import type {
  ClinicInfoResponse,
  PublicBookingConfig,
  PublicBookingCreateInput,
  PublicBookingCreated,
} from "@/types";
import {
  clearDone,
  clearDraft,
  readDone,
  readDraft,
  writeDone,
  writeDraft,
  type BookingDone,
  type BookingDraft,
  type SelectedSlot,
  type WizardStep,
} from "./booking-storage";
import { BookingStepper } from "./booking-stepper";
import { BookingSuccess } from "./booking-success";
import { SelectionSummary } from "./selection-summary";
import { StepPatient } from "./step-patient";
import { StepProfessional } from "./step-professional";
import { StepReview } from "./step-review";
import { StepSlot } from "./step-slot";
import {
  MessageState,
  PanelSkeleton,
  PublicShell,
  btnOutline,
  btnWhatsapp,
  linkMuted,
  linkMutedStyle,
} from "./public-ui";

// Asistente público de reserva online (/reservar), sin login.
// Contrato: contracts/api-schemas/online-booking.yaml
//   GET  /api/public/booking/config
//   GET  /api/public/booking/availability
//   POST /api/public/booking
// El turno entra PENDING (source ONLINE) y recepción lo confirma.

type ConfigState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "rate_limited" }
  | { kind: "disabled" }
  | { kind: "ready"; config: PublicBookingConfig };

interface ClinicContact {
  name: string | null;
  whatsappLink: string | null;
  phoneDisplay: string | null;
  insurances: string[];
}

const SUBTITLE = "Reservá tu turno online";

function normalizeConfig(raw: PublicBookingConfig): PublicBookingConfig {
  return {
    ...raw,
    minAdvanceHours: Number.isFinite(raw.minAdvanceHours) ? raw.minAdvanceHours : 0,
    maxDaysAhead: Number.isFinite(raw.maxDaysAhead) && raw.maxDaysAhead > 0 ? raw.maxDaysAhead : 30,
    consultationTypes: Array.isArray(raw.consultationTypes) ? raw.consultationTypes : [],
    specialties: (Array.isArray(raw.specialties) ? raw.specialties : [])
      .map((s) => ({ ...s, medics: Array.isArray(s.medics) ? s.medics : [] }))
      .filter((s) => s.medics.length > 0),
  };
}

async function fetchConfig(signal?: AbortSignal): Promise<ConfigState> {
  try {
    const res = await fetch("/api/public/booking/config", { cache: "no-store", signal });
    if (res.status === 503) return { kind: "disabled" };
    if (res.status === 429) return { kind: "rate_limited" };
    if (!res.ok) return { kind: "error" };
    const json = await res.json().catch(() => null);
    const data = json?.data as PublicBookingConfig | undefined;
    if (!json?.success || !data) return { kind: "error" };
    if (!data.enabled) return { kind: "disabled" };
    return { kind: "ready", config: normalizeConfig(data) };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { kind: "error" };
  }
}

async function fetchClinicContact(signal?: AbortSignal): Promise<ClinicContact | null> {
  try {
    const res = await fetch("/api/public/clinic-info", { signal });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const data = json?.data as ClinicInfoResponse | undefined;
    const s = data?.settings ?? null;
    const wa = s?.whatsappPrimary?.replace(/\D/g, "") || null;
    return {
      name: s?.name?.trim() || null,
      whatsappLink: wa ? buildWhatsappLink(wa, s?.prefillWhatsappMessage || "Hola, quería solicitar un turno") : null,
      phoneDisplay: s?.phoneDisplay?.trim() || null,
      insurances: Array.isArray(data?.healthInsurances)
        ? data.healthInsurances.map((h) => h.name).filter((n): n is string => !!n)
        : [],
    };
  } catch {
    return null;
  }
}

/** Reconstruye el estado del asistente desde el borrador de la sesión, validado contra la config actual. */
function restoreState(config: PublicBookingConfig, draft: BookingDraft | null, initialMedicId: string | null) {
  const medics = config.specialties.flatMap((s) => s.medics);
  const exists = (id: string | null | undefined): id is string => !!id && medics.some((m) => m.id === id);
  const today = todayAR();
  const maxDate = addDaysISO(today, config.maxDaysAhead);

  const draftMedicId = draft?.medicId ?? null;
  let medicId: string | null = exists(draftMedicId) ? draftMedicId : null;
  let slot: SelectedSlot | null = medicId ? (draft?.slot ?? null) : null;
  let step: WizardStep = draft?.step ?? 1;

  // Viene de "Turno" en la ficha de un profesional de la landing: manda el link.
  if (exists(initialMedicId) && initialMedicId !== medicId) {
    medicId = initialMedicId;
    slot = null;
    step = 1;
  }
  if (!medicId && medics.length === 1) medicId = medics[0].id;

  const consultationTypeId =
    draft?.consultationTypeId && config.consultationTypes.some((t) => t.id === draft.consultationTypeId)
      ? draft.consultationTypeId
      : null;
  if (slot && (slot.date < today || slot.date > maxDate)) slot = null;

  let weekFrom = draft?.weekFrom && draft.weekFrom >= today && draft.weekFrom <= maxDate ? draft.weekFrom : today;
  if (slot && (slot.date < weekFrom || slot.date > addDaysISO(weekFrom, 6))) weekFrom = slot.date;

  const patient = draft?.patient ?? EMPTY_BOOKING_PATIENT;
  if (!medicId) step = 1;
  else if (step >= 3 && !slot) step = 2;
  if (step === 4 && !bookingPatientSchema.safeParse(patient).success) step = 3;

  return { step, medicId, consultationTypeId, weekFrom, slot, patient, startedAt: draft?.startedAt ?? Date.now() };
}

export function BookingWizard({ initialMedicId = null }: { initialMedicId?: string | null }) {
  const [configState, setConfigState] = useState<ConfigState>({ kind: "loading" });
  const [configAttempt, setConfigAttempt] = useState(0);
  /** undefined = cargando; null = no disponible. */
  const [contact, setContact] = useState<ClinicContact | null | undefined>(undefined);
  const [done, setDone] = useState<BookingDone | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [step, setStep] = useState<WizardStep>(1);
  const [medicId, setMedicId] = useState<string | null>(null);
  const [consultationTypeId, setConsultationTypeId] = useState<string | null>(null);
  const [weekFrom, setWeekFrom] = useState<string>(() => todayAR());
  const [slot, setSlot] = useState<SelectedSlot | null>(null);
  const [patient, setPatient] = useState<BookingPatientValues>(EMPTY_BOOKING_PATIENT);
  const [startedAt, setStartedAt] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);

  const [medicNotice, setMedicNotice] = useState<string | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<Partial<Record<BookingPatientField, string>> | null>(
    null,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [availabilityReload, setAvailabilityReload] = useState(0);

  const honeypotRef = useRef("");
  const focusOnStepChange = useRef(false);

  // ─── Carga inicial: borrador de la sesión + configuración pública ─────────
  useEffect(() => {
    const ctrl = new AbortController();
    const draft = readDraft();
    if (configAttempt === 0) {
      const previous = readDone();
      if (previous) setDone(previous);
    }
    fetchConfig(ctrl.signal)
      .then((state) => {
        setConfigState(state);
        if (state.kind === "ready") {
          const r = restoreState(state.config, draft, initialMedicId);
          setStep(r.step);
          setMedicId(r.medicId);
          setConsultationTypeId(r.consultationTypeId);
          setWeekFrom(r.weekFrom);
          setSlot(r.slot);
          setPatient(r.patient);
          setStartedAt(r.startedAt);
        } else {
          setStartedAt(draft?.startedAt ?? Date.now());
        }
        setHydrated(true);
      })
      .catch(() => {
        // abortado (desmontaje)
      });
    return () => ctrl.abort();
  }, [configAttempt, initialMedicId]);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchClinicContact(ctrl.signal).then((c) => {
      if (!ctrl.signal.aborted) setContact(c);
    });
    return () => ctrl.abort();
  }, []);

  // ─── Guardar el progreso (solo sessionStorage) ─────────────────────────────
  useEffect(() => {
    if (!hydrated || done || configState.kind !== "ready") return;
    writeDraft({ v: 1, startedAt, step, medicId, consultationTypeId, weekFrom, slot, patient });
  }, [hydrated, done, configState.kind, startedAt, step, medicId, consultationTypeId, weekFrom, slot, patient]);

  // ─── Al cambiar de paso: arriba de todo y foco en el título ───────────────
  useEffect(() => {
    if (!focusOnStepChange.current) return;
    focusOnStepChange.current = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("booking-step-title")?.focus({ preventScroll: true });
  }, [step, done]);

  const goTo = useCallback((next: WizardStep) => {
    focusOnStepChange.current = true;
    setStep(next);
  }, []);

  // ─── Derivados ────────────────────────────────────────────────────────────
  const config = configState.kind === "ready" ? configState.config : null;
  const clinicName = config?.clinicName?.trim() || contact?.name || null;

  const medicInfo = useMemo(() => {
    if (!config || !medicId) return null;
    for (const specialty of config.specialties) {
      const medic = specialty.medics.find((m) => m.id === medicId);
      if (medic) return { medic, specialty };
    }
    return null;
  }, [config, medicId]);
  const consultationType = config?.consultationTypes.find((t) => t.id === consultationTypeId) ?? null;
  const patientValid = useMemo(() => bookingPatientSchema.safeParse(patient).success, [patient]);
  const maxStep: WizardStep = !medicInfo ? 1 : !slot ? 2 : !patientValid ? 3 : 4;
  const view = Math.min(step, maxStep) as WizardStep;

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectMedic = (id: string) => {
    setMedicNotice(null);
    if (id === medicId) return;
    setMedicId(id);
    setSlot(null);
    setSlotNotice(null);
    setDurationMinutes(null);
    setWeekFrom(todayAR());
  };

  const handleSelectType = (id: string | null) => {
    if (id === consultationTypeId) return;
    setConsultationTypeId(id);
    setSlot(null);
  };

  const handleUnavailable = useCallback(() => {
    // Ese profesional dejó de tomar reservas online: sacarlo de la lista local.
    setConfigState((prev) => {
      if (prev.kind !== "ready") return prev;
      const specialties = prev.config.specialties
        .map((s) => ({ ...s, medics: s.medics.filter((m) => m.id !== medicId) }))
        .filter((s) => s.medics.length > 0);
      return { kind: "ready", config: { ...prev.config, specialties } };
    });
    setMedicId(null);
    setSlot(null);
    setMedicNotice("Ese profesional ya no toma reservas online. Elegí otro o escribinos.");
    goTo(1);
  }, [medicId, goTo]);

  const handleDisabled = useCallback(() => setConfigState({ kind: "disabled" }), []);
  const handleSelectSlot = useCallback((s: SelectedSlot | null) => {
    setSlot(s);
    if (s) setSlotNotice(null);
  }, []);
  const handleDuration = useCallback((m: number | null) => setDurationMinutes(m), []);
  const handlePatientChange = useCallback((v: BookingPatientValues) => setPatient(v), []);
  const handleHoneypot = useCallback((v: string) => {
    honeypotRef.current = v;
  }, []);

  function backToSlots(message: string) {
    setSlot(null);
    setSlotNotice(message);
    setAvailabilityReload((n) => n + 1);
    goTo(2);
  }

  async function submit() {
    if (!config || !medicInfo || !slot || submitting) return;
    const parsed = bookingPatientSchema.safeParse(patient);
    if (!parsed.success) {
      goTo(3);
      return;
    }
    if (isPast(slot.start)) {
      backToSlots("Ese horario ya pasó. Elegí otro, por favor.");
      return;
    }
    const v = parsed.data;
    const body: PublicBookingCreateInput = {
      medicId: medicInfo.medic.id,
      start: slot.start,
      consultationTypeId: consultationType?.id ?? null,
      firstName: v.firstName,
      lastName: v.lastName,
      dni: v.dni,
      phone: v.phone,
      email: v.email || null,
      healthInsurance: v.healthInsurance || null,
      privacyAccepted: true,
      _hp: honeypotRef.current,
      _elapsedMs: startedAt ? Date.now() - startedAt : undefined,
    };

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/public/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);

      if (res.ok) {
        const data = (json?.data ?? {}) as Partial<PublicBookingCreated>;
        const created: PublicBookingCreated = {
          requestId: typeof data.requestId === "string" ? data.requestId : "",
          status: "PENDING_CONFIRMATION",
          start: typeof data.start === "string" ? data.start : slot.start,
          medicShortName: data.medicShortName || medicInfo.medic.shortName,
          manageUrl: safeManageUrl(data.manageUrl),
          emailSent: data.emailSent === true,
          message: typeof data.message === "string" ? data.message : "",
        };
        const result: BookingDone = {
          v: 1,
          created,
          clinicName,
          notes: config.notes?.trim() || null,
          specialtyName: medicInfo.specialty.name,
          consultationTypeName: consultationType?.name ?? null,
        };
        clearDraft();
        writeDone(result);
        // Los datos personales no quedan en memoria del asistente.
        setPatient(EMPTY_BOOKING_PATIENT);
        setSlot(null);
        setServerFieldErrors(null);
        setStep(1);
        honeypotRef.current = "";
        focusOnStepChange.current = true;
        setDone(result);
        return;
      }

      const err = parseBookingSubmitError(res.status, json);
      switch (err.kind) {
        case "slot_taken":
        case "out_of_window":
          backToSlots(err.message);
          break;
        case "medic_unavailable":
          handleUnavailable();
          break;
        case "disabled":
          setConfigState({ kind: "disabled" });
          break;
        case "fields":
          if (Object.keys(err.fields).length > 0) {
            setServerFieldErrors(err.fields);
            goTo(3);
          } else if (err.slotInvalid) {
            backToSlots("Ese horario ya no está disponible. Elegí otro, por favor.");
          } else {
            setSubmitError(err.message);
          }
          break;
        default:
          setSubmitError(err.message);
      }
    } catch {
      setSubmitError("No pudimos conectarnos. Revisá tu conexión y probá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    clearDone();
    const medics = config?.specialties.flatMap((s) => s.medics) ?? [];
    setMedicId(medics.length === 1 ? medics[0].id : null);
    setConsultationTypeId(null);
    setWeekFrom(todayAR());
    setSlot(null);
    setPatient(EMPTY_BOOKING_PATIENT);
    setStartedAt(Date.now());
    setSubmitError(null);
    setSlotNotice(null);
    setMedicNotice(null);
    setServerFieldErrors(null);
    focusOnStepChange.current = true;
    setStep(1);
    setDone(null);
  }

  // ─── Contacto alternativo (WhatsApp / teléfono) ──────────────────────────
  const contactAction =
    contact === undefined ? null : (
      <>
        {contact?.whatsappLink ? (
          <a
            href={contact.whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className={btnWhatsapp}
            style={{ color: "#fff" }}
          >
            <MessageCircle className="h-5 w-5" />
            Escribinos por WhatsApp
          </a>
        ) : (
          <Link href="/#contacto" className={btnOutline} style={{ color: "var(--ink-2)" }}>
            Ir al formulario de contacto
          </Link>
        )}
        {contact?.phoneDisplay && (
          <a
            href={`tel:${contact.phoneDisplay.replace(/[^\d+]/g, "")}`}
            className={btnOutline}
            style={{ color: "var(--ink-2)" }}
          >
            <Phone className="h-4 w-4" />
            {`Llamar al ${contact.phoneDisplay}`}
          </a>
        )}
      </>
    );

  const homeLink = (
    <Link href="/" className={linkMuted} style={linkMutedStyle}>
      Volver al inicio
    </Link>
  );

  // ─── Pantallas ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <PublicShell clinicName={done.clinicName ?? clinicName} subtitle={SUBTITLE}>
        <BookingSuccess done={done} onNewBooking={startOver} />
      </PublicShell>
    );
  }

  if (configState.kind === "loading") {
    return (
      <PublicShell subtitle={SUBTITLE}>
        <PanelSkeleton label="Cargando la reserva online…" />
      </PublicShell>
    );
  }

  if (configState.kind === "error" || configState.kind === "rate_limited") {
    return (
      <PublicShell clinicName={contact?.name} subtitle={SUBTITLE}>
        <MessageState
          tone="danger"
          icon={<AlertCircle className="h-7 w-7" />}
          title={configState.kind === "rate_limited" ? "Demasiados intentos" : "No pudimos cargar la reserva online"}
          text={
            configState.kind === "rate_limited"
              ? "Esperá unos minutos y volvé a intentar."
              : "Revisá tu conexión a internet y probá de nuevo."
          }
          action={
            <button
              type="button"
              className={btnOutline}
              onClick={() => {
                setConfigState({ kind: "loading" });
                setConfigAttempt((n) => n + 1);
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
          }
        />
      </PublicShell>
    );
  }

  if (configState.kind === "disabled") {
    return (
      <PublicShell clinicName={contact?.name} subtitle={SUBTITLE} footer={homeLink}>
        <MessageState
          icon={<CalendarOff className="h-7 w-7" />}
          title="Las reservas online no están disponibles"
          text="Escribinos por WhatsApp y te ayudamos a coordinar tu turno."
          action={contactAction}
        />
      </PublicShell>
    );
  }

  const readyConfig = configState.config;

  if (readyConfig.specialties.length === 0) {
    return (
      <PublicShell clinicName={clinicName} subtitle={SUBTITLE} footer={homeLink}>
        <MessageState
          icon={<UserX className="h-7 w-7" />}
          title="Por ahora no hay profesionales con reserva online"
          text="Escribinos y te ayudamos a coordinar tu turno."
          action={contactAction}
        />
      </PublicShell>
    );
  }

  const today = todayAR();
  const maxDate = addDaysISO(today, readyConfig.maxDaysAhead);

  const summary = medicInfo ? (
    <SelectionSummary
      medicShortName={medicInfo.medic.shortName}
      specialtyName={medicInfo.specialty.name}
      specialtyColor={medicInfo.specialty.color}
      consultationTypeName={consultationType?.name ?? null}
      durationMinutes={durationMinutes ?? medicInfo.medic.slotDurationMinutes}
      slot={view >= 3 ? slot : null}
      onChangeMedic={() => goTo(1)}
      onChangeSlot={() => goTo(2)}
    />
  ) : null;

  const windowHint =
    readyConfig.minAdvanceHours > 0
      ? `Se reserva con al menos ${readyConfig.minAdvanceHours} h de anticipación y hasta ${readyConfig.maxDaysAhead} días adelante.`
      : `Se reserva hasta ${readyConfig.maxDaysAhead} días adelante.`;

  const footer = (
    <>
      {contact?.whatsappLink && (
        <p className="text-[14px] text-[var(--ink-2)]">
          ¿Preferís que te ayudemos?{" "}
          <a
            href={contact.whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--primary-deep)",
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: "4px",
            }}
          >
            Escribinos por WhatsApp
          </a>
        </p>
      )}
      <p className="text-[12px] text-[var(--muted-2)]">
        Tus datos se usan solo para gestionar el turno (Ley 25.326).
      </p>
    </>
  );

  return (
    <PublicShell clinicName={clinicName} subtitle={SUBTITLE} footer={footer} wide>
      <BookingStepper step={view} maxStep={maxStep} onGo={goTo} />

      {view === 1 && (
        <StepProfessional
          config={readyConfig}
          medicId={medicId}
          consultationTypeId={consultationTypeId}
          notice={medicNotice}
          onSelectMedic={handleSelectMedic}
          onSelectType={handleSelectType}
          onContinue={() => goTo(2)}
        />
      )}

      {view === 2 && medicInfo && (
        <StepSlot
          medicId={medicInfo.medic.id}
          consultationTypeId={consultationTypeId}
          minDate={today}
          maxDate={maxDate}
          weekFrom={weekFrom}
          onWeekChange={setWeekFrom}
          slot={slot}
          onSelectSlot={handleSelectSlot}
          onContinue={() => goTo(3)}
          notice={slotNotice}
          reloadKey={availabilityReload}
          onUnavailable={handleUnavailable}
          onDisabled={handleDisabled}
          onDuration={handleDuration}
          summary={
            <>
              {summary}
              <p className="mt-2 text-[13px] text-[var(--muted)]">{windowHint}</p>
            </>
          }
          contactAction={contactAction}
        />
      )}

      {view === 3 && (
        <StepPatient
          defaultValues={patient}
          serverErrors={serverFieldErrors}
          insuranceSuggestions={contact?.insurances ?? []}
          summary={summary}
          onChange={handlePatientChange}
          onHoneypot={handleHoneypot}
          onSubmit={(values) => {
            setPatient(values);
            setServerFieldErrors(null);
            setSubmitError(null);
            goTo(4);
          }}
        />
      )}

      {view === 4 && medicInfo && slot && (
        <StepReview
          medicShortName={medicInfo.medic.shortName}
          specialtyName={medicInfo.specialty.name}
          consultationTypeName={consultationType?.name ?? null}
          slot={slot}
          patient={patient}
          clinicNotes={readyConfig.notes?.trim() || null}
          submitting={submitting}
          error={submitError}
          onEditProfessional={() => goTo(1)}
          onEditSlot={() => goTo(2)}
          onEditPatient={() => goTo(3)}
          onSubmit={() => void submit()}
        />
      )}
    </PublicShell>
  );
}
