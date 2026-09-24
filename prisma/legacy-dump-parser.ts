// Parser del dump SQL del sistema viejo (phpMyAdmin / mysqldump).
// Extrae las filas de los INSERT INTO `tabla` (cols) VALUES (...), (...);
// Soporta strings multilínea con escapes backslash (\' \" \\ \n \r \0 \Z \t)
// y comillas dobladas (''), NULL y números.

export type LegacyValue = string | number | null;
export type LegacyRow = Record<string, LegacyValue>;

const ESCAPES: Record<string, string> = {
  "'": "'",
  '"': '"',
  "\\": "\\",
  n: "\n",
  r: "\r",
  t: "\t",
  "0": "\0",
  Z: "\x1a",
  b: "\b",
};

/**
 * Escanea el cuerpo de un VALUES desde `start` hasta el `;` terminador
 * (fuera de strings). Devuelve las tuplas crudas y la posición final.
 */
function scanValues(sql: string, start: number): { tuples: LegacyValue[][]; end: number } {
  const tuples: LegacyValue[][] = [];
  let i = start;
  let current: LegacyValue[] | null = null;
  let token = "";
  let inString = false;
  let isStringToken = false;

  const pushToken = () => {
    if (current == null) return;
    if (isStringToken) {
      current.push(token);
    } else {
      const t = token.trim();
      if (t.length === 0) return;
      if (t.toUpperCase() === "NULL") current.push(null);
      else if (/^-?\d+$/.test(t)) current.push(Number(t));
      else if (/^-?\d*\.\d+$/.test(t)) current.push(Number(t));
      else current.push(t); // literal raro: conservar crudo
    }
    token = "";
    isStringToken = false;
  };

  while (i < sql.length) {
    const ch = sql[i];

    if (inString) {
      if (ch === "\\" && i + 1 < sql.length) {
        const next = sql[i + 1];
        token += ESCAPES[next] ?? next;
        i += 2;
        continue;
      }
      if (ch === "'") {
        // '' doblada = comilla escapada
        if (sql[i + 1] === "'") {
          token += "'";
          i += 2;
          continue;
        }
        inString = false;
        i++;
        continue;
      }
      token += ch;
      i++;
      continue;
    }

    if (ch === "'") {
      inString = true;
      // Descartar whitespace acumulado antes de abrir la comilla (", '...")
      if (!isStringToken) token = "";
      isStringToken = true;
      i++;
      continue;
    }
    if (ch === "(") {
      current = [];
      token = "";
      isStringToken = false;
      i++;
      continue;
    }
    if (ch === ",") {
      if (current != null) pushToken();
      i++;
      continue;
    }
    if (ch === ")") {
      if (current != null) {
        pushToken();
        tuples.push(current);
        current = null;
      }
      i++;
      continue;
    }
    if (ch === ";" && current == null) {
      return { tuples, end: i + 1 };
    }
    if (current != null) token += ch;
    i++;
  }
  return { tuples, end: i };
}

/**
 * Parsea el dump completo. Devuelve un Map tabla → filas (acumula múltiples
 * INSERT statements de la misma tabla). Los nombres de tabla son
 * case-sensitive tal como aparecen en el dump.
 */
export function parseDump(sql: string): Map<string, LegacyRow[]> {
  const result = new Map<string, LegacyRow[]>();
  const insertRe = /INSERT INTO `([^`]+)` \(([^)]*)\) VALUES/g;

  let m: RegExpExecArray | null;
  while ((m = insertRe.exec(sql)) !== null) {
    const table = m[1];
    const cols = m[2].split(",").map((c) => c.trim().replace(/`/g, ""));
    const { tuples, end } = scanValues(sql, m.index + m[0].length);

    const rows = result.get(table) ?? [];
    for (const tuple of tuples) {
      if (tuple.length !== cols.length) {
        throw new Error(
          `Tabla ${table}: tupla con ${tuple.length} valores pero ${cols.length} columnas (fila ~${rows.length + 1})`,
        );
      }
      const row: LegacyRow = {};
      cols.forEach((c, idx) => (row[c] = tuple[idx]));
      rows.push(row);
    }
    result.set(table, rows);
    insertRe.lastIndex = end;
  }
  return result;
}

/** Datetime naive del dump (hora local AR) → Date UTC con offset -03:00 fijo. */
export function legacyDateToUtc(value: LegacyValue): Date | null {
  if (value == null || typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) {
    const d = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (d) return new Date(`${d[1]}-${d[2]}-${d[3]}T00:00:00-03:00`);
    return null;
  }
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-03:00`);
}

/** Strings vacíos o de espacios → null. */
export function emptyToNull(value: LegacyValue): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}
