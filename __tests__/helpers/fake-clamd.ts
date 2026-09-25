// clamd falso para tests: acepta INSTREAM por TCP y responde con `verdict`.
// No usa la firma EICAR real (el antivirus del equipo marcaría el repo).
import net from "node:net";

export const TEST_MARKER = "TEST-MALWARE-MARKER";

export const markerVerdict = (content: Buffer) =>
  content.includes(TEST_MARKER) ? "stream: Test.Marker FOUND" : "stream: OK";

export interface FakeClamd {
  port: number;
  close: () => Promise<void>;
}

export function fakeClamd(verdict: (content: Buffer) => string = markerVerdict): Promise<FakeClamd> {
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    let started = false;
    const content: Buffer[] = [];
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      if (!started) {
        const nul = buf.indexOf(0);
        if (nul < 0) return;
        if (buf.subarray(0, nul).toString() !== "zINSTREAM") return void sock.end("UNKNOWN COMMAND\0");
        started = true;
        buf = buf.subarray(nul + 1);
      }
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (len === 0) return void sock.end(`${verdict(Buffer.concat(content))}\0`);
        if (buf.length < 4 + len) return;
        content.push(buf.subarray(4, 4 + len));
        buf = buf.subarray(4 + len);
      }
    });
    sock.on("error", () => {});
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        port: (server.address() as net.AddressInfo).port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      }),
    ),
  );
}

/** Puerto local sin nadie escuchando (para simular clamd caído). */
export async function closedPort(): Promise<number> {
  const tmp = await fakeClamd(() => "stream: OK");
  await tmp.close();
  return tmp.port;
}
