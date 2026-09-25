"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Mic, MicOff, WifiOff } from "lucide-react";
import { formatTicketNumber } from "@/lib/waiting-room/format";
import type { DisplayCall, DisplayFeed } from "@/lib/waiting-room/feed";

// Pantalla de la sala de espera (televisor). Sin sesión: la clave llega en la
// URL (?k=…) una vez, se guarda en localStorage y se manda en cada pedido como
// header. Polling cada 5 s. Campanilla (Web Audio, sin archivos) y voz
// (speechSynthesis) opcionales: el navegador exige un gesto para el audio, por
// eso hay un botón «Activar sonido».

const KEY_STORAGE = "wr-display-key";
const SOUND_STORAGE = "wr-display-sound";
const VOICE_STORAGE = "wr-display-voice";
const POLL_MS = 5_000;
const POLL_ERROR_MS = 15_000;

type Status = "loading" | "ok" | "no-key" | "unavailable" | "offline";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // modo privado o storage bloqueado: la pantalla funciona igual mientras esté abierta
  }
}

function timeHHmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Campanilla de dos tonos con un oscilador (no hace falta ningún archivo). */
function chime(ctx: AudioContext) {
  const play = (freq: number, at: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  };
  const t = ctx.currentTime;
  play(880, t, 0.5);
  play(1174.66, t + 0.35, 0.7);
}

function speak(call: DisplayCall) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const text = `Número ${call.number}${call.room ? `, ${call.room}` : ""}`;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-AR";
  u.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function WaitingRoomDisplay() {
  const [key, setKey] = useState<string | null>(null);
  const [feed, setFeed] = useState<DisplayFeed | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [clock, setClock] = useState("");
  const [sound, setSound] = useState(false);
  const [voice, setVoice] = useState(false);
  const [flash, setFlash] = useState(false);

  const audioRef = useRef<AudioContext | null>(null);
  const lastCallRef = useRef<string | null>(null); // `${id}:${callCount}` del llamado mostrado
  const soundRef = useRef(false);
  const voiceRef = useRef(false);
  soundRef.current = sound;
  voiceRef.current = voice;

  // Clave: de la URL (una vez) o de localStorage.
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("k");
    if (fromUrl) {
      writeStorage(KEY_STORAGE, fromUrl);
      url.searchParams.delete("k");
      window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
      setKey(fromUrl);
    } else {
      const stored = readStorage(KEY_STORAGE);
      setKey(stored);
      if (!stored) setStatus("no-key");
    }
    setVoice(readStorage(VOICE_STORAGE) === "1");
  }, []);

  // Reloj.
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const announce = useCallback((call: DisplayCall) => {
    setFlash(true);
    setTimeout(() => setFlash(false), 2500);
    if (soundRef.current && audioRef.current) {
      try {
        chime(audioRef.current);
      } catch {
        // sin audio: la pantalla sigue
      }
    }
    if (voiceRef.current) speak(call);
  }, []);

  // Polling del feed.
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      let next = POLL_MS;
      try {
        const res = await fetch("/api/public/waiting-room/feed", {
          headers: { "X-Display-Key": key },
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 404) {
          setStatus("unavailable");
          next = POLL_ERROR_MS;
        } else if (!res.ok) {
          setStatus("offline");
          next = POLL_ERROR_MS;
        } else {
          const json = (await res.json()) as { data: DisplayFeed };
          const data = json.data;
          setFeed(data);
          setStatus("ok");
          const sig = data.current ? `${data.current.id}:${data.current.callCount}` : null;
          if (sig && lastCallRef.current !== null && lastCallRef.current !== sig && data.current) {
            announce(data.current);
          }
          lastCallRef.current = sig;
        }
      } catch {
        if (!cancelled) {
          setStatus("offline");
          next = POLL_ERROR_MS;
        }
      }
      if (!cancelled) timer = setTimeout(load, next);
    };

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, announce]);

  function enableSound() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioRef.current ?? new Ctx();
      audioRef.current = ctx;
      void ctx.resume();
      chime(ctx);
      setSound(true);
      writeStorage(SOUND_STORAGE, "1");
    } catch {
      // sin audio disponible
    }
  }

  function disableSound() {
    setSound(false);
    writeStorage(SOUND_STORAGE, "0");
  }

  function toggleVoice() {
    const next = !voice;
    setVoice(next);
    writeStorage(VOICE_STORAGE, next ? "1" : "0");
    if (next && feed?.current) speak(feed.current);
  }

  const current = feed?.current ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-[#06120f] text-white" style={{ colorScheme: "dark" }}>
      {/* Cabecera */}
      <header className="flex items-center justify-between px-[4vw] pt-[2.5vh]">
        <div className="flex items-center gap-3 text-[2.2vh] font-semibold uppercase tracking-[0.2em] text-emerald-200/70">
          <span
            className={`h-[1.4vh] w-[1.4vh] rounded-full ${
              status === "ok" ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" : "bg-rose-400"
            }`}
          />
          Sala de espera
        </div>
        <div className="font-mono text-[4.5vh] font-semibold tabular-nums text-white/90">{clock}</div>
      </header>

      {/* Cuerpo */}
      <main className="flex flex-1 items-stretch gap-[3vw] px-[4vw] py-[3vh]">
        <section
          className={`flex flex-[1.6] flex-col items-center justify-center rounded-[3vh] border border-emerald-400/15 transition-colors duration-500 ${
            flash ? "bg-emerald-500/25" : "bg-emerald-950/40"
          }`}
        >
          {status === "no-key" ? (
            <Message title="Falta la clave de la pantalla" text="Abrí el link que genera el administrador en Configuración → Consultorio." />
          ) : status === "unavailable" ? (
            <Message title="Pantalla no habilitada" text="El módulo de sala de espera está apagado o la clave ya no es válida. Pedile un link nuevo al administrador." />
          ) : current ? (
            <>
              <div className="text-[2.6vh] font-semibold uppercase tracking-[0.3em] text-emerald-200/70">
                {current.callCount > 1 ? "Volvemos a llamar" : "Llamamos a"}
              </div>
              <div
                className="font-mono font-black leading-none tabular-nums text-white drop-shadow-[0_0_40px_rgba(52,211,153,0.35)]"
                style={{ fontSize: "min(34vh, 24vw)" }}
                aria-live="polite"
              >
                {formatTicketNumber(current.number)}
              </div>
              {current.room ? (
                <div className="mt-[2vh] flex items-center gap-[1.5vw] text-[6vh] font-bold text-emerald-100">
                  <span className="text-emerald-300/70">→</span>
                  {current.room}
                </div>
              ) : (
                <div className="mt-[2vh] text-[4vh] font-semibold text-emerald-100/80">Pase al consultorio</div>
              )}
              <div className="mt-[3vh] text-[2.2vh] text-emerald-200/50">Llamado a las {timeHHmm(current.calledAt)}</div>
            </>
          ) : (
            <Message title="Todavía no llamamos a nadie" text={status === "loading" ? "Conectando…" : "Cuando te llamen, tu número aparece acá."} />
          )}
        </section>

        <aside className="flex flex-1 flex-col rounded-[3vh] border border-white/10 bg-white/[0.03] p-[3vh]">
          <div className="text-[2.2vh] font-semibold uppercase tracking-[0.2em] text-white/50">Últimos llamados</div>
          <ul className="mt-[2vh] flex-1 space-y-[1.5vh]">
            {(feed?.recent ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-[1.5vw] rounded-[1.5vh] bg-white/[0.04] px-[1.5vw] py-[1.5vh]">
                <span className="shrink-0 font-mono text-[5vh] font-bold leading-none tabular-nums text-white/85">
                  {formatTicketNumber(c.number)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[2.6vh] font-semibold leading-tight text-emerald-100/80">
                  {c.room ?? "Consultorio"}
                </span>
                <span className="shrink-0 font-mono text-[2vh] tabular-nums text-white/40">{timeHHmm(c.calledAt)}</span>
              </li>
            ))}
            {feed && feed.recent.length === 0 && (
              <li className="text-[2.4vh] text-white/35">Sin llamados anteriores.</li>
            )}
          </ul>
          <div className="mt-[2vh] flex items-end justify-between border-t border-white/10 pt-[2vh]">
            <div>
              <div className="text-[2vh] uppercase tracking-[0.2em] text-white/45">En espera</div>
              <div className="font-mono text-[6vh] font-bold tabular-nums leading-none text-white/90">
                {feed ? feed.waitingCount : "–"}
              </div>
            </div>
            {status === "offline" && (
              <div className="flex items-center gap-2 text-[2vh] text-rose-300">
                <WifiOff className="h-[2.4vh] w-[2.4vh]" /> Sin conexión
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Pie: controles discretos para quien instala la pantalla */}
      <footer className="flex items-center justify-end gap-[1vw] px-[4vw] pb-[2vh] text-[1.8vh] text-white/40">
        {sound ? (
          <button type="button" onClick={disableSound} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 hover:text-white/80">
            <Volume2 className="h-[2vh] w-[2vh]" /> Sonido activado
          </button>
        ) : (
          <button type="button" onClick={enableSound} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-emerald-200 hover:bg-emerald-500/20">
            <VolumeX className="h-[2vh] w-[2vh]" /> Tocar para activar sonido
          </button>
        )}
        <button type="button" onClick={toggleVoice} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 hover:text-white/80">
          {voice ? <Mic className="h-[2vh] w-[2vh]" /> : <MicOff className="h-[2vh] w-[2vh]" />}
          {voice ? "Voz activada" : "Voz"}
        </button>
      </footer>
    </div>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-[60%] text-center">
      <div className="text-[5vh] font-bold text-white/85">{title}</div>
      <div className="mt-[2vh] text-[2.6vh] text-emerald-100/60">{text}</div>
    </div>
  );
}
