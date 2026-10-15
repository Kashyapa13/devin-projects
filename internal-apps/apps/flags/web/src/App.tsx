import React, { useEffect, useState } from "react";
const LABEL = "capability demo — production continues on Power Apps";
const H = (role: string) => ({ "x-demo-role": role, "x-demo-actor": "demo-user",
  "content-type": "application/json" });
const api = (p: string, o?: RequestInit) => fetch(p, o).then((r) => r.json());

export function App() {
  const [flags, setFlags] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [role, setRole] = useState("flag_editor");
  const [key, setKey] = useState(""); const [env, setEnv] = useState("dev");
  const [err, setErr] = useState(""); const [demoFlag, setDemoFlag] = useState<any>(null);
  const [uid] = useState("demo-user-1"); const [del, setDel] = useState<Record<string, string>>({});
  const load = () => { api("/api/flags").then((d) => setFlags(d.flags ?? []));
    api("/api/flags/audit").then((d) => setEvents(d.events ?? [])); };
  useEffect(load, []);
  useEffect(() => { const k = "demo-hero";
    api(`/api/flags/evaluate?key=${k}&userId=${uid}&env=dev`).then(setDemoFlag); }, [flags]);
  const create = async () => { const r = await api("/api/flags",
    { method: "POST", headers: H(role), body: JSON.stringify({ key, env }) });
    if (r.error) setErr(`${r.error.code}: ${r.error.message}`); else { setErr(""); setKey(""); } load(); };
  const del1 = async (f: any) => { const r = await api(
    `/api/flags/${f.id}?confirm=${encodeURIComponent(del[f.id] ?? "")}`,
    { method: "DELETE", headers: H(role) });
    if (r.error) setErr(`${r.error.code}: ${r.error.message}`); else setErr(""); load(); };
  const flip = async (f: any) => { await api(`/api/flags/${f.id}`, { method: "PUT",
    headers: H(role), body: JSON.stringify({ targeting:
      { default_enabled: !(f.targeting?.default_enabled === true) } }) }); load(); };
  return <div>
    <div className="banner">{LABEL} — synthetic flags only, demo-tier.</div>
    <h1>Flags <small style={{fontSize:".6em",color:"#666"}}>demo replica</small></h1>
    <div className="row">role: <select value={role} onChange={(e) => setRole(e.target.value)}>
      <option>viewer</option><option>flag_editor</option><option>flag_admin</option></select>
      <input placeholder="flag key" value={key} onChange={(e) => setKey(e.target.value)} />
      <select value={env} onChange={(e) => setEnv(e.target.value)}>
        <option>dev</option><option>staging</option><option>prod</option></select>
      <button onClick={create}>Create</button></div>
    {err && <p className="err">{err}</p>}
    <table><thead><tr><th>key</th><th>env</th><th>state</th><th></th></tr></thead><tbody>
      {flags.map((f) => <tr key={f.id}><td>{f.key}</td><td>{f.env}</td>
        <td>{f.targeting?.default_enabled ? "on" : "off"}</td>
        <td className="row"><button className="ghost" onClick={() => flip(f)}>flip</button>
          <input placeholder="type key to delete" value={del[f.id] ?? ""}
            onChange={(e) => setDel({ ...del, [f.id]: e.target.value })} />
          <button className="ghost" onClick={() => del1(f)}>delete</button></td></tr>)}
    </tbody></table>
    <div className="demopage"><b>/demo page</b> — flips with <code>demo-hero</code>:
      {demoFlag?.enabled
        ? <p style={{color:"#059669",fontWeight:600}}>HERO VARIANT — flag is ON for {uid}</p>
        : <p style={{color:"#6b7280"}}>control — flag is off for {uid}</p>}</div>
    <h2>audit</h2>
    <table><thead><tr><th>when</th><th>actor</th><th>action</th><th>flag</th></tr></thead><tbody>
      {events.map((e) => <tr key={e.id}><td>{new Date(e.at).toLocaleString()}</td>
        <td>{e.actor}</td><td>{e.action}</td><td>{e.key ?? "—"}</td></tr>)}
    </tbody></table></div>;
}
