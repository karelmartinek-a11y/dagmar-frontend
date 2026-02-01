import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { adminListInstances, type AdminInstance } from "../api/admin";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function yyyyMm(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export default function AdminPrintsPage() {
  const [instances, setInstances] = useState<AdminInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<"attendance" | "plan">("attendance");
  const [month, setMonth] = useState(() => yyyyMm(new Date()));
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await adminListInstances();
        if (cancelled) return;
        setInstances(res.instances);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Nepodarilo se nacist seznam instanci.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return instances;
    return instances.filter((it) => {
      const hay = `${it.display_name ?? ""} ${it.id}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [instances, query]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  function selectAll() {
    setSelectedIds(filtered.map((i) => i.id));
  }

  function clearAll() {
    setSelectedIds([]);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!month || selectedIds.length === 0) return;
    const idsParam = encodeURIComponent(selectedIds.join(","));
    const url = `/admin/tisky/preview?type=${docType}&month=${month}&ids=${idsParam}`;
    window.open(url, "_blank", "noopener");
  }

  return (
    <div className="card">
      <div className="card-header">Tisky</div>
      <div className="card-body stack" style={{ gap: 16 }}>
        <p className="muted">
          Vygeneruje PDF dochazkoveho listu nebo planu smen pro vybrane osoby. Po potvrzeni se otevre nova karta s nahledem a spusti tisk do PDF (A4, stredni okraje).
        </p>

        <form className="stack" style={{ gap: 14 }} onSubmit={onSubmit}>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <label className="stack" style={{ gap: 6 }}>
              <span className="label">Typ dokumentu</span>
              <select value={docType} onChange={(e) => setDocType(e.target.value as "attendance" | "plan")}> 
                <option value="attendance">Dochazkovy list</option>
                <option value="plan">Plan smen</option>
              </select>
            </label>

            <label className="stack" style={{ gap: 6 }}>
              <span className="label">Mesic</span>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
            </label>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <div className="flex" style={{ gap: 8, alignItems: "center" }}>
              <strong>Vyberte osoby</strong>
              <input
                type="search"
                placeholder="Hledat podle jmena nebo ID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ flex: 1, minWidth: 200 }}
              />
              <button type="button" className="btn ghost" onClick={selectAll} disabled={filtered.length === 0}>
                Oznacit vse
              </button>
              <button type="button" className="btn ghost" onClick={clearAll}>
                Vycistit
              </button>
            </div>
            <div className="list" style={{ maxHeight: 320, overflow: "auto", border: "1px solid #e4e9f2", borderRadius: 8, padding: 8 }}>
              {loading && <div className="muted">Nacitam...</div>}
              {error && <div className="error">{error}</div>}
              {!loading && filtered.length === 0 ? <div className="muted">Nic nenalezeno.</div> : null}
              {filtered.map((it) => (
                <label key={it.id} className="flex" style={{ alignItems: "center", gap: 10, padding: "4px 2px" }}>
                  <input type="checkbox" checked={selectedIds.includes(it.id)} onChange={() => toggle(it.id)} />
                  <div className="stack" style={{ gap: 2 }}>
                    <span>{it.display_name ?? it.id}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {it.id} · {it.employment_template}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex" style={{ gap: 10, justifyContent: "flex-end" }}>
            <NavLink to="/admin/instances" className="btn ghost">
              Zpet
            </NavLink>
            <button type="submit" className="btn solid" disabled={selectedIds.length === 0 || !month}>
              Vygenerovat PDF
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
