const baseUrl = "https://dagmar.hcasc.cz/api/v1/integration";
const placeholderToken = "dgi_REPLACE_WITH_TOKEN";

const scopes = [
  ["integration:health", "Přístup na health check integračního API."],
  ["employments:read", "Čtení seznamu úvazků."],
  ["shift_plan:read", "Čtení plánu směn."],
  ["attendance:read", "Čtení denní docházky."],
  ["punches:read", "Čtení odvozených průchodů."],
  ["locks:read", "Čtení měsíčních zámků docházky."],
  ["openapi:read", "Stažení chráněného OpenAPI JSON integračního API."],
] as const;

const endpoints = [
  {
    path: "GET /health",
    scope: "integration:health",
    purpose: "Ověření tokenu a dostupnosti API.",
    params: "Bez query parametrů.",
    note: "Vrací service name, API verzi, contract version a timezone.",
  },
  {
    path: "GET /employments",
    scope: "employments:read",
    purpose: "Seznam úvazků dostupných pro klienta.",
    params: "Volitelné: employment_id, employee_id, active, date_from, date_to, limit, cursor.",
    note: "Date filtry jen omezují průnik období úvazku. Endpoint nemá pevný 31denní limit.",
  },
  {
    path: "GET /shift-plan",
    scope: "shift_plan:read",
    purpose: "Plán směn v období.",
    params: "Povinné: date_from, date_to. Volitelné: employment_id, employee_id, include_locks, limit, cursor.",
    note: "Maximální období je 31 dnů.",
  },
  {
    path: "GET /attendances",
    scope: "attendance:read",
    purpose: "Denní docházka v období.",
    params: "Povinné: date_from, date_to. Volitelné: employment_id, employee_id, include_plan, include_locks, include_punches, include_corrections, limit, cursor.",
    note: "Maximální období je 31 dnů. include_corrections vrací aktuálně correction_status: not_tracked.",
  },
  {
    path: "GET /punches",
    scope: "punches:read",
    purpose: "Odvozené průchody z denní docházky.",
    params: "Povinné: date_from, date_to. Volitelné: employment_id, employee_id, event_type, limit, cursor.",
    note: "Vrací pouze ARRIVAL a DEPARTURE odvozené z attendance. Nejde o raw terminálové eventy.",
  },
  {
    path: "GET /locks",
    scope: "locks:read",
    purpose: "Měsíční zámky docházky.",
    params: "Zadejte year+month nebo date_from+date_to. Dále volitelně employment_id, employee_id, limit, cursor.",
    note: "Vrací pouze existující zámky. Aktuální implementace zde nemá 31denní limit.",
  },
  {
    path: "GET /openapi.json",
    scope: "openapi:read",
    purpose: "Strojově čitelný popis integračního API.",
    params: "Bez query parametrů.",
    note: "Endpoint je chráněný tokenem a scope openapi:read.",
  },
] as const;

const errorRows = [
  ["401", "missing_token", "Požadavek neposlal bearer token."],
  ["401", "invalid_token", "Token neodpovídá aktivnímu secretu nebo má neplatný formát."],
  ["403", "client_disabled", "Klient je zakázaný nebo expiroval."],
  ["403", "ip_forbidden", "IP adresa není v allowlistu klienta."],
  ["403", "insufficient_scope", "Klient nemá potřebný scope nebo žádá data mimo povolený rozsah."],
  ["400", "invalid_request", "Neplatné nebo chybějící parametry."],
  ["400", "period_too_large", "Období na shift-plan, attendances nebo punches přesáhlo 31 dnů."],
  ["404", "not_found", "Nepodporovaný endpoint v integračním namespace."],
  ["429", "rate_limited", "Byl překročen limit požadavků."],
  ["500", "internal_error", "Došlo k interní chybě."],
] as const;

const sampleError = `{
  "error": {
    "code": "missing_token",
    "message": "Chybí přístupový token.",
    "request_id": "0f86d61ffe3d448d91981d8cb373e766"
  }
}`;

const healthExample = `curl -sS \\
  -H "Authorization: Bearer ${placeholderToken}" \\
  ${baseUrl}/health`;

const punchesExample = `curl -sS \\
  -H "Authorization: Bearer ${placeholderToken}" \\
  "${baseUrl}/punches?date_from=2026-06-10&date_to=2026-06-16"`;

const paginationExample = `curl -sS \\
  -H "Authorization: Bearer ${placeholderToken}" \\
  "${baseUrl}/employments?limit=100&cursor=eyJjdXJzb3Jfa2V5IjoxMDF9"`;

const periodErrorExample = `curl -sS \\
  -H "Authorization: Bearer ${placeholderToken}" \\
  "${baseUrl}/attendances?date_from=2026-06-01&date_to=2026-07-15"`;

export default function IntegrationApiDocsPage() {
  return (
    <main className="integration-docs">
      <section className="integration-docs-hero">
        <div className="integration-docs-hero-copy">
          <div className="integration-docs-eyebrow">Read-only integrační API</div>
          <h1>Dokumentace integračního API Dagmar</h1>
          <p>
            Veřejná partnerská dokumentace k externímu API pod <code>/api/v1/integration</code>. Popisuje aktuálně
            implementovaný stav a je určená pro technického partnera, který potřebuje bezpečně číst úvazky, plán směn,
            docházku, odvozené průchody a zámky.
          </p>
          <div className="integration-docs-badges">
            <span>Base URL: {baseUrl}</span>
            <span>API verze: v1</span>
            <span>Contract version: 2026-06-22</span>
            <span>Datum dokumentace: 2026-06-23</span>
          </div>
        </div>
        <aside className="integration-docs-summary">
          <div className="integration-docs-summary-title">Rychlý start</div>
          <ol>
            <li>Získejte od správce Dagmar integrační bearer token.</li>
            <li>Posílejte jej v hlavičce <code>Authorization: Bearer {placeholderToken}</code>.</li>
            <li>Začněte endpointem <code>/health</code>.</li>
            <li>Potom integrujte <code>employments</code>, <code>shift-plan</code>, <code>attendances</code>, <code>punches</code> a <code>locks</code>.</li>
          </ol>
          <p className="integration-docs-small">
            API není určené pro zápis. Nepoužívejte admin session ani zaměstnanecký bearer token.
          </p>
        </aside>
      </section>

      <section className="integration-docs-grid">
        <article className="integration-docs-card">
          <h2>Autentizace</h2>
          <p>
            Integrační API používá samostatný bearer token s prefixem <code>dgi_</code>. Token je oddělený od admin
            session i od zaměstnaneckého tokenu.
          </p>
          <pre><code>{`Authorization: Bearer ${placeholderToken}`}</code></pre>
          <ul>
            <li>Token získává partner od správce Dagmar mimo API.</li>
            <li>Token neposílejte v URL ani v query stringu.</li>
            <li>Používejte pouze HTTPS.</li>
            <li>Po úniku tokenu požádejte správce o okamžitou rotaci.</li>
          </ul>
        </article>

        <article className="integration-docs-card">
          <h2>Datový model</h2>
          <ul>
            <li><code>employee_id</code> je identifikátor osoby v systému Dagmar.</li>
            <li><code>employment_id</code> je identifikátor konkrétního úvazku.</li>
            <li>Jeden zaměstnanec může mít více úvazků.</li>
            <li>Lokální časy jsou vracené jako <code>HH:MM</code>.</li>
            <li>UTC timestampy jako <code>2026-06-22T22:28:47Z</code>.</li>
            <li>Timezone datových endpointů je <code>Europe/Prague</code>.</li>
          </ul>
        </article>
      </section>

      <section className="integration-docs-card">
        <h2>Scopes a oprávnění</h2>
        <div className="integration-docs-table-wrap">
          <table className="integration-docs-table">
            <thead>
              <tr>
                <th>Scope</th>
                <th>Význam</th>
              </tr>
            </thead>
            <tbody>
              {scopes.map(([scope, description]) => (
                <tr key={scope}>
                  <td><code>{scope}</code></td>
                  <td>{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="integration-docs-note">
          Klient může být navíc omezený na konkrétní <code>employment_id</code> a <code>employee_id</code>. Bez
          explicitního filtru API vrací jen povolený rozsah. Pokud klient explicitně požádá o data mimo svůj rozsah,
          vrátí <code>403 insufficient_scope</code>.
        </p>
      </section>

      <section className="integration-docs-card">
        <h2>Endpointy</h2>
        <div className="integration-docs-endpoints">
          {endpoints.map((endpoint) => (
            <article key={endpoint.path} className="integration-docs-endpoint">
              <div className="integration-docs-endpoint-head">
                <h3>{endpoint.path}</h3>
                <span>{endpoint.scope}</span>
              </div>
              <p>{endpoint.purpose}</p>
              <p><strong>Parametry:</strong> {endpoint.params}</p>
              <p><strong>Poznámka:</strong> {endpoint.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="integration-docs-grid">
        <article className="integration-docs-card">
          <h2>Stránkování</h2>
          <p>
            List endpointy vrací obálku <code>data</code> + <code>pagination</code>. Výchozí <code>limit</code> je
            100, maximum 500. Klient iteruje přes opaque <code>next_cursor</code>.
          </p>
          <pre><code>{`{
  "pagination": {
    "limit": 100,
    "next_cursor": "eyJjdXJzb3Jfa2V5IjoxMDF9",
    "has_more": true
  }
}`}</code></pre>
          <pre><code>{paginationExample}</code></pre>
        </article>

        <article className="integration-docs-card">
          <h2>Limity a rate limiting</h2>
          <ul>
            <li><code>shift-plan</code>, <code>attendances</code> a <code>punches</code> mají maximum 31 dnů.</li>
            <li><code>health</code> má limit 60 požadavků za minutu.</li>
            <li>Datové endpointy mají limit 120 požadavků za minutu.</li>
            <li><code>openapi.json</code> má limit 10 požadavků za minutu.</li>
            <li>Při <code>429 rate_limited</code> použijte backoff a snižte paralelismus.</li>
          </ul>
        </article>
      </section>

      <section className="integration-docs-card">
        <h2>Chybové odpovědi</h2>
        <div className="integration-docs-table-wrap">
          <table className="integration-docs-table">
            <thead>
              <tr>
                <th>HTTP</th>
                <th>Kód</th>
                <th>Význam</th>
              </tr>
            </thead>
            <tbody>
              {errorRows.map(([status, code, meaning]) => (
                <tr key={`${status}-${code}`}>
                  <td>{status}</td>
                  <td><code>{code}</code></td>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre><code>{sampleError}</code></pre>
      </section>

      <section className="integration-docs-grid">
        <article className="integration-docs-card">
          <h2>Příklady</h2>
          <h3>Health</h3>
          <pre><code>{healthExample}</code></pre>
          <h3>Odvozené průchody</h3>
          <pre><code>{punchesExample}</code></pre>
          <h3>Příliš velké období</h3>
          <pre><code>{periodErrorExample}</code></pre>
        </article>

        <article className="integration-docs-card">
          <h2>OpenAPI a nepodporované funkce</h2>
          <ul>
            <li>OpenAPI JSON je dostupný na <code>{baseUrl}/openapi.json</code>.</li>
            <li>OpenAPI endpoint je chráněný a vyžaduje scope <code>openapi:read</code>.</li>
            <li><code>/changes</code> není implementovaný endpoint.</li>
            <li>API nepodporuje zápis docházky, úpravy plánů, zámky ani správu zaměstnanců.</li>
            <li><code>punches</code> vrací jen odvozené průchody z denní docházky, ne raw terminálové eventy.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
