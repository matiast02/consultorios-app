// Antivirus opcional para adjuntos: clamd por TCP con el protocolo INSTREAM.
//
//   CLAMAV_HOST        host de clamd (si no está definido, no se escanea)
//   CLAMAV_PORT        puerto (default 3310)
//   CLAMAV_TIMEOUT_MS  tope para conectar + escanear (default 30000)
//
// Protocolo (man clamd): "zINSTREAM\0", luego chunks [longitud uint32 BE][datos],
// y un chunk de longitud 0 para terminar. clamd responde una línea terminada en
// \0: "stream: OK", "stream: <firma> FOUND" o "<motivo> ERROR".
//
// Política: si CLAMAV_HOST está configurado y el escaneo no se puede completar
// (clamd caído, timeout, ERROR), la subida se RECHAZA (fail closed): un
// antivirus configurado que no responde no debe dejar pasar archivos.

import net from "node:net";

/** Chunk máximo por mensaje INSTREAM (clamd acepta más; 64 KiB es conservador). */
const MAX_CHUNK = 64 * 1024;

export interface ClamavConfig {
  host: string;
  port: number;
  timeoutMs: number;
}

export type ClamavVerdict = { clean: true } | { clean: false; signature: string };

export class ClamavUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClamavUnavailableError";
  }
}

/** Config desde el entorno, o null si el antivirus no está habilitado. */
export function clamavConfig(): ClamavConfig | null {
  const host = process.env.CLAMAV_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  const timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS ?? 30_000);
  return {
    host,
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 3310,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
  };
}

/** Interpreta la respuesta de clamd. Lanza ClamavUnavailableError si no es OK/FOUND. */
export function parseClamdResponse(raw: string): ClamavVerdict {
  const line = raw.replace(/\0/g, "").trim();
  if (/^stream: OK$/i.test(line)) return { clean: true };
  const found = /^stream: (.+) FOUND$/i.exec(line);
  if (found) return { clean: false, signature: found[1].trim() };
  throw new ClamavUnavailableError(`Respuesta inesperada de clamd: ${line.slice(0, 200) || "(vacía)"}`);
}

/**
 * Escanea el contenido (en claro) con clamd. `source` se consume completo
 * salvo que clamd responda antes (p. ej. "size limit exceeded").
 */
export async function scanWithClamav(
  source: AsyncIterable<Uint8Array>,
  config: ClamavConfig,
): Promise<ClamavVerdict> {
  const socket = net.createConnection({ host: config.host, port: config.port });
  let response = "";
  let settled = false;

  // Respuesta de clamd: se resuelve al recibir el \0 final o al cerrarse el socket.
  const answer = new Promise<string>((resolve, reject) => {
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (response) resolve(response);
      else reject(err ?? new ClamavUnavailableError("clamd cerró la conexión sin responder"));
    };
    socket.on("data", (d: Buffer) => {
      response += d.toString("utf8");
      if (response.includes("\0")) finish();
    });
    socket.on("end", () => finish());
    socket.on("close", () => finish());
    socket.on("error", (e) => finish(new ClamavUnavailableError(`clamd no disponible: ${e.message}`)));
  });
  // Evita un unhandledRejection si falla la escritura antes de esperar la respuesta.
  answer.catch(() => {});

  const timer = setTimeout(() => {
    socket.destroy(new Error(`timeout de ${config.timeoutMs} ms`));
  }, config.timeoutMs);

  const write = (buf: Buffer) =>
    new Promise<void>((resolve, reject) => {
      socket.write(buf, (err) =>
        err ? reject(new ClamavUnavailableError(`No se pudo enviar el archivo a clamd: ${err.message}`)) : resolve(),
      );
    });

  try {
    await write(Buffer.from("zINSTREAM\0", "latin1"));
    outer: for await (const chunk of source) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      for (let off = 0; off < buf.length; off += MAX_CHUNK) {
        // clamd ya respondió (típicamente un ERROR por tamaño): no seguir enviando.
        if (settled || response) break outer;
        const part = buf.subarray(off, Math.min(off + MAX_CHUNK, buf.length));
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length, 0);
        await write(Buffer.concat([len, part]));
      }
    }
    if (!settled && !response) await write(Buffer.alloc(4)); // fin del stream
  } catch (e) {
    // Si clamd ya contestó (y cortó), la respuesta manda; si no, no hay
    // veredicto. Los errores de la fuente (no de clamd) se propagan tal cual.
    if (!response || !(e instanceof ClamavUnavailableError)) {
      clearTimeout(timer);
      socket.destroy();
      throw e;
    }
  }

  try {
    return parseClamdResponse(await answer);
  } finally {
    clearTimeout(timer);
    socket.destroy();
  }
}
