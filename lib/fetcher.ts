export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error("Error al cargar datos");
    throw error;
  }
  const json = await res.json();
  return json.data ?? json;
}
