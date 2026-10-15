import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const H = (role: string) => ({
  "x-demo-role": role,
  "x-demo-actor": "demo-user",
  "content-type": "application/json",
});
const R = (role: string) => ({ "x-demo-role": role, "x-demo-actor": "demo-user" }); // no content-type: bodyless
const api = (p: string, o?: RequestInit) => fetch(p, o).then((r) => r.json());
const showErr = (r: any): string => {
  const e = r?.error;
  if (!e) return "";
  return typeof e === "string"
    ? `${e}${r.message ? ": " + r.message : ""}` // fastify framework errors {statusCode,error,message}
    : `${e.code}: ${e.message}`; // app envelope {error:{code,message}}
};

const ENVS = ["dev", "staging", "prod"] as const;
const ROLES = ["viewer", "flag_editor", "flag_admin"] as const;
const envTone = (env: string) =>
  env === "prod" ? "tone-bad" : env === "staging" ? "tone-warn" : "tone-info";

export function App() {
  const { t } = useTranslation();
  const [flags, setFlags] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [role, setRole] = useState<(typeof ROLES)[number]>("flag_editor");
  const [key, setKey] = useState("");
  const [env, setEnv] = useState<(typeof ENVS)[number]>("dev");
  const [err, setErr] = useState("");
  const [demoFlag, setDemoFlag] = useState<any>(null);
  const [uid] = useState("demo-user-1");
  const [del, setDel] = useState<Record<string, string>>({});
  const [rules, setRules] = useState<Record<string, string>>({});

  const load = () => {
    api("/api/flags").then((d) => setFlags(d.flags ?? []));
    api("/api/flags/audit").then((d) => setEvents(d.events ?? []));
  };
  useEffect(load, []);
  useEffect(() => {
    api(`/api/flags/evaluate?key=demo-hero&userId=${uid}&env=dev`).then(setDemoFlag);
  }, [flags, uid]);

  const create = async (targeting?: any) => {
    const r = await api("/api/flags", {
      method: "POST",
      headers: H(role),
      body: JSON.stringify(targeting === undefined ? { key, env } : { key, env, targeting }),
    });
    const e = showErr(r);
    if (e) setErr(e);
    else {
      setErr("");
      setKey("");
    }
    load();
  };
  const createWithRules = async () => {
    const raw = rules.__create ?? "";
    let parsed: any;
    try {
      parsed = raw.trim() === "" ? {} : JSON.parse(raw);
    } catch {
      setErr(t("rules.badjson"));
      return;
    }
    await create(parsed);
    setRules({ ...rules, __create: "" });
  };
  const del1 = async (f: any) => {
    const r = await api(
      `/api/flags/${f.id}?confirm=${encodeURIComponent(del[f.id] ?? "")}`,
      { method: "DELETE", headers: R(role) },
    );
    const e = showErr(r);
    if (e) setErr(e);
    else setErr("");
    load();
  };
  const flip = async (f: any) => {
    const r = await api(`/api/flags/${f.id}`, {
      method: "PUT",
      headers: H(role),
      body: JSON.stringify({
        // toggle the base switch, never silently drop a targeting rule
        targeting: { ...(f.targeting ?? {}), default_enabled: !(f.targeting?.default_enabled === true) },
      }),
    });
    const e = showErr(r);
    if (e) setErr(e);
    load();
  };
  const saveRules = async (f: any) => {
    const raw = rules[f.id] ?? "";
    let parsed: any;
    try {
      parsed = raw.trim() === "" ? {} : JSON.parse(raw);
    } catch {
      setErr(t("rules.badjson"));
      return;
    }
    const r = await api(`/api/flags/${f.id}`, {
      method: "PUT",
      headers: H(role),
      body: JSON.stringify({ targeting: parsed }),
    });
    const e = showErr(r);
    if (e) setErr(e);
    else setErr("");
    load();
  };

  return (
    <>
      <header className="appbar">
        <div className="appbar-inner">
          <div className="appbar-brand">
            <span className="eyebrow">{t("app.eyebrow")}</span>
            <h1 className="title">{t("app.title")}</h1>
          </div>
          <div className="appbar-side">
            <span className="pill tone-warn">{t("app.demo.badge")}</span>
            <label>
              {t("role.label")}
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
              >
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <div className="dock">
              <span className="dock-item">
                <kbd>R</kbd> {t("dock.refresh")}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="shell shell-narrow">
        <p className="demo-label">{t("app.demo.label")}</p>

        <form
          className="flagform"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input
            placeholder={t("create.placeholder")}
            aria-label={t("create.placeholder")}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <div className="seg">
            {ENVS.map((en) => (
              <button
                key={en}
                type="button"
                aria-pressed={env === en}
                onClick={() => setEnv(en)}
              >
                {en}
              </button>
            ))}
          </div>
          <button type="submit" className="btn-primary">
            {t("create.button")}
          </button>
        </form>
        <details className="panel" style={{ marginTop: 0 }}>
          <summary className="keys">{t("rules.create")}</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createWithRules();
            }}
          >
            <textarea
              value={rules.__create ?? ""}
              onChange={(e) => setRules({ ...rules, __create: e.target.value })}
              placeholder={t("rules.placeholder")}
              aria-label={t("rules.placeholder")}
              className="mono"
              rows={3}
            />
            <button type="submit" className="btn-primary">
              {t("rules.createbtn")}
            </button>
          </form>
        </details>
        {err && <p className="error-card">{err}</p>}

        <div className="table-card">
          <p className="panel-title">{t("flags.title")}</p>
          <p className="panel-sub">{t("flags.subtitle")}</p>
          <table className="rows">
            <thead>
              <tr>
                <th>{t("flags.key")}</th>
                <th>{t("flags.env")}</th>
                <th>{t("flags.state")}</th>
                <th>{t("flags.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {flags.length === 0 && (
                <tr>
                  <td colSpan={4} className="keys">
                    {t("flags.empty")}
                  </td>
                </tr>
              )}
              {flags.map((f) => (
                <tr key={f.id}>
                  <td className="mono">{f.key}</td>
                  <td>
                    <span className={`chip ${envTone(String(f.env))}`}>{f.env}</span>
                  </td>
                  <td>
                    <span
                      className={`pill ${f.targeting?.default_enabled ? "tone-ok" : "tone-zinc"}`}
                    >
                      {f.targeting?.default_enabled ? t("state.on") : t("state.off")}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="btn-ghost" onClick={() => void flip(f)}>
                        {t("action.flip")}
                      </button>
                      <details className="rules-editor">
                        <summary
                          onClick={() =>
                            setRules((r) => ({
                              ...r,
                              [f.id]: r[f.id] ?? JSON.stringify(f.targeting ?? {}, null, 2),
                            }))
                          }
                        >
                          {t("rules.edit")}
                        </summary>
                        <textarea
                          className="mono"
                          rows={4}
                          aria-label={`${t("rules.edit")} ${String(f.key)}`}
                          value={rules[f.id] ?? JSON.stringify(f.targeting ?? {}, null, 2)}
                          onChange={(e) => setRules({ ...rules, [f.id]: e.target.value })}
                        />
                        <button className="btn-ghost" onClick={() => void saveRules(f)}>
                          {t("rules.save")}
                        </button>
                      </details>
                      <input
                        className="del-input"
                        placeholder={t("action.delete.placeholder")}
                        aria-label={`${t("action.delete.placeholder")} ${String(f.key)}`}
                        value={del[f.id] ?? ""}
                        onChange={(e) => setDel({ ...del, [f.id]: e.target.value })}
                      />
                      <button className="btn-danger" onClick={() => void del1(f)}>
                        {t("action.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="panel">
          <h2>
            {t("demo.title")} — {t("demo.subtitle")}
          </h2>
          <div className={`flip-zone ${demoFlag?.enabled ? "on" : ""}`}>
            {demoFlag?.enabled ? (
              <>
                <p className="variant">{t("demo.hero")}</p>
                <p className="vsub">
                  {t("demo.hero.sub")} <span className="mono">{uid}</span>
                </p>
              </>
            ) : (
              <>
                <p className="variant">{t("demo.control")}</p>
                <p className="vsub">
                  {t("demo.control.sub")} <span className="mono">{uid}</span>
                </p>
              </>
            )}
          </div>
        </section>

        <div className="table-card">
          <p className="panel-title">{t("audit.title")}</p>
          <p className="panel-sub">{t("audit.subtitle")}</p>
          <table className="rows">
            <thead>
              <tr>
                <th>{t("audit.when")}</th>
                <th>{t("audit.actor")}</th>
                <th>{t("audit.action")}</th>
                <th>{t("audit.flag")}</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="keys">
                    {t("audit.empty")}
                  </td>
                </tr>
              )}
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{new Date(e.at).toLocaleString()}</td>
                  <td>{e.actor}</td>
                  <td>
                    <span className="chip tone-info">{e.action}</span>
                  </td>
                  <td className="mono">{e.key ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
