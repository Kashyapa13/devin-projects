/** Thin fetch layer — session token lives in localStorage (dev SSO shim;
 * prod: the IdP login flow sets it). Server-side RBAC still enforces. */
export async function api(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${localStorage.getItem("refundlens_token") ?? ""}`,
    },
    body: opts.body === undefined ? null : JSON.stringify(opts.body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; detail?: unknown } }).error;
    const e = new Error(err?.message ?? `request failed (${res.status})`);
    (e as { code?: string }).code = err?.code ?? "HTTP_" + res.status;
    (e as { detail?: unknown }).detail = err?.detail;
    throw e;
  }
  return json;
}
