import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { adminListInstances, type AdminInstance } from "../api/admin";

type DocType = "attendance" | "plan";

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
  const [docType, setDocType] = useState<DocType>("attendance");
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
        setError(err instanceof Error ? err.message : "Nepodařilo se načíst seznam zařízení.");
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

  function selectAllVisible() {
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
    <div className="card pad print-shell">
      <header className="print-hero">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Admin · Tisky</span>
          <h1 className="print-title">Hromadné PDF výstupy</h1>
          <p className="muted">
            Vyberte typ dokumentu, měsíc a osoby. Náhled se otevře v novém okně, stránka zůstane připravená pro další akci.
          </p>
        </div>
        <div className="print-counter">
          <div className="counter-number">{selectedIds.length}</div>
          <div className="counter-label">vybraných osob</div>
        </div>
      </header>

      <form className="print-grid" onSubmit={onSubmit}>
        <section className="print-panel">
          <div className="panel-head">
            <div className="eyebrow">Krok 1</div>
            <div className="panel-title">Parametry tisku</div>
          </div>
          <div className="panel-body print-params">
            <div className="stack" style={{ gap: 10 }}>
              <span className="label">Typ dokumentu</span>
              <div className="pill-group">
                <label className={`pill ${docType === "attendance" ? "pill--active" : ""}`}>
                  <input
                    type="radio"
                    name="docType"
                    value="attendance"
                    checked={docType === "attendance"}
                    onChange={() => setDocType("attendance")}
                  />
                  Docházkový list
                </label>
                <label className={`pill ${docType === "plan" ? "pill--active" : ""}`}>
                  <input type="radio" name="docType" value="plan" checked={docType === "plan"} onChange={() => setDocType("plan")} />
                  Docházkový plán
                </label>
              </div>
              <p className="muted small">Volba určuje šablonu dokumentu v náhledu.</p>
            </div>

            <div className="stack" style={{ gap: 10 }}>
              <label className="stack" style={{ gap: 6 }}>
                <span className="label">Měsíc</span>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
              </label>
              <p className="muted small">Tisky se generují pro celé zvolené kalendářní období.</p>
            </div>
          </div>
        </section>

        <section className="print-panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Krok 2</div>
              <div className="panel-title">Výběr osob</div>
              <p className="muted small">Filtrovat podle jména nebo ID, poté označit pro zahrnutí do PDF.</p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn ghost" onClick={selectAllVisible} disabled={filtered.length === 0}>
                Označit vše
              </button>
              <button type="button" className="btn ghost" onClick={clearAll} disabled={selectedIds.length === 0}>
                Vyčistit
              </button>
            </div>
          </div>

          <div className="panel-body stack" style={{ gap: 12 }}>
            <div className="row" style={{ alignItems: "center", gap: 10 }}>
              <input
                type="search"
                className="input"
                placeholder="Hledat podle jména nebo ID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ flex: 1, minWidth: 260 }}
              />
              <div className="chip">
                {filtered.length} nalezeno · {selectedIds.length} vybráno
              </div>
            </div>

            <div className="print-list">
              {loading && <div className="muted">Načítám…</div>}
              {error && <div className="error">{error}</div>}
              {!loading && filtered.length === 0 ? <div className="muted">Nic nenalezeno.</div> : null}

              {filtered.map((it) => (
                <label key={it.id} className={`print-row ${selectedIds.includes(it.id) ? "print-row--selected" : ""}`}>
                  <input type="checkbox" checked={selectedIds.includes(it.id)} onChange={() => toggle(it.id)} />
                  <div className="stack" style={{ gap: 2 }}>
                    <span className="print-name">{it.display_name ?? it.id}</span>
                    <span className="muted small">
                      {it.id} · {it.employment_template}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="print-panel">
          <div className="panel-head">
            <div className="eyebrow">Krok 3</div>
            <div className="panel-title">Potvrzení a tisk</div>
            <p className="muted small">PDF náhled se otevře v novém panelu. Původní stránka zůstane pro další tisk.</p>
          </div>
          <div className="panel-body row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="muted small">
              Vybraných osob: <strong>{selectedIds.length}</strong>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <NavLink to="/admin/instances" className="btn ghost">
                Zpět
              </NavLink>
              <button type="submit" className="btn solid" disabled={selectedIds.length === 0 || !month}>
                Vygenerovat PDF
              </button>
            </div>
          </div>
        </section>
      </form>
    </div>
  );
}
