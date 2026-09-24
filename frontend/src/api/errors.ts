/**
 * Normaliza el `detail` de un error de FastAPI a un string legible.
 *
 * En un 422 de validación `detail` no es un string sino un array de objetos
 * ({type, loc, msg, input, ctx}). Pasarlo tal cual a setError() y renderizarlo
 * en JSX hace que React lance "Objects are not valid as a React child" y tumba
 * la página, ocultando el motivo real del fallo.
 */
export function errorMessage(e: any, fallback = "Error"): string {
  const detail = e?.response?.data?.detail;

  if (typeof detail === "string" && detail) return detail;

  if (Array.isArray(detail)) {
    const partes = detail
      .map((d) => {
        const campo = Array.isArray(d?.loc)
          ? d.loc.filter((p: unknown) => p !== "body" && p !== "query").join(".")
          : "";
        const msg = d?.msg ?? "";
        return campo && msg ? `${campo}: ${msg}` : msg || campo;
      })
      .filter(Boolean);
    if (partes.length) return partes.join(" · ");
  }

  if (detail && typeof detail === "object") {
    const msg = (detail as any).msg ?? (detail as any).message;
    if (typeof msg === "string" && msg) return msg;
  }

  return e?.message || fallback;
}
