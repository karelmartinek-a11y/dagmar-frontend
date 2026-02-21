# Forenzní audit (PULS) — dagmar-frontend

Datum: 2026-02-20  
Rozsah: pouze obsah tohoto repozitáře (statická forenzní kontrola), bez tvrzení o runtime stavu produkční domény.

## Metodika
- Prošel jsem všechny verzované soubory (`git ls-files`), cíleně ověřil routy, API kontrakty, UX toky a CI/CD konfiguraci.
- Spustil jsem technické kontroly (`npm run lint`, `npm run build`).
- Níže je auditní tabulka **PULS**.

## PULS tabulka

| P | U | L | S |
|---|---|---|---|
| **Kritická** | Po přihlášení admina může přijít redirect na neexistující route a uživatel skončí mimo funkční workflow. | `src/pages/AdminLoginPage.tsx` (default `nextPath` je `/admin/instances`, ale tato route není v routeru). | Změnit default na existující route (`/admin/users` nebo `/admin/dochazka`) a přidat e2e smoke test login→landing. |
| **Vysoká** | V modulu tisků je tlačítko „Zpět“ na neexistující stránku, UX slepá funkce. | `src/pages/AdminPrintsPage.tsx` (`NavLink to="/admin/instances"`). | Opravit na existující URL; doporučeně kontextové „Zpět na Uživatelé“/„Zpět na dashboard“. |
| **Vysoká** | Požadovaný scénář správy uživatelů (editace jméno/e-mail/telefon) není ve frontend UI implementován. | `src/pages/AdminUsersPage.tsx` (jen vytvoření, reset, migrace; bez edit formuláře/tabulky polí). | Doplnit inline/edit modal pro name/email/phone + validace + optimistic/error stavy. |
| **Vysoká** | API vrstva frontendu neumí update uživatele v rozsahu name/email/phone, jen `profile_instance_id`; vzniká funkční odchylka vůči požadavku. | `src/api/admin.ts` (`adminUpdateUser` přijímá pouze `{ profile_instance_id?: string | null }`). | Rozšířit API typ + request payload o `name`, `email`, `phone`; sladit s backend kontraktem. |
| **Vysoká** | Odhlášení admina obchází API klienta a posílá navigaci přes `window.location.assign`, pravděpodobně GET; riziko nekonzistentního odhlášení/CSRF toku. | `src/pages/AdminLayout.tsx` (`onLogout`) vs `src/api/admin.ts` (`adminLogout` je POST s CSRF). | Používat jednotně `adminLogout()` + serverový POST endpoint; odstranit duální mechanismus. |
| **Střední** | Odkaz na admin APK je velmi pravděpodobně nefunkční (soubor v repozitáři není). | `src/pages/AdminLoginPage.tsx` (`/download/admin.apk`), `public/` obsahuje jen `site.webmanifest`. | Buď dodat artifact + release flow, nebo odkaz skrýt za feature flag/konfiguraci dostupnosti. |
| **Střední** | V repo je přítomen velký ZIP artefakt; zvyšuje riziko driftu, duplikace a obtížné forenzní dohledatelnosti změn. | `dagmar-frontend.zip` v rootu. | Přesunout mimo runtime repo (release asset), případně archivovat do artifacts storage; v repu držet jen zdroj. |
| **Střední** | Legacy terminologie „instance/entity/device“ je stále výrazně přítomná; může způsobovat doménové nejasnosti po přechodu na login přes uživatele. | API a UI názvy: `instance_id`, `adminListInstances`, texty „Výběr instance“, „ID entity“. | Zavést slovník domény a migrační mapu názvů (`uživatel/profil/zařízení`) + postupný rename bez rozbití API. |
| **Střední** | Migrační utilita generuje fallback e-mail doménu `@migration.local`; potenciálně neodesílatelné adresy a provozní nejasnost. | `src/pages/AdminUsersPage.tsx` (`makeEmailFromAttendanceName`). | Přidat povinné potvrzení admina, validaci domény a report neplatných záznamů před uložením. |
| **Nízká** | Jazyková/typografická nekonzistence v CZ copy (bez diakritiky v části textů) snižuje profesionální důvěryhodnost UI. | Např. `PortalResetPage`, části AdminUsers/Reset textů. | Projít mikrocopy pass + sjednotit tón/diakritiku/terminologii; zavést textové SSOT. |
| **Nízká** | Build hlásí velký JS chunk (>500 kB), může zhoršovat první načtení. | Výstup `vite build` (`dist/assets/index-*.js` ~857 kB). | Zavést code splitting (lazy routes), případně optimalizovat PDF knihovny načítané jen na demand. |
| **Info** | Požadavek „admin napevno na provoz@hotelchodovasc.cz + speciální help mail při zapomenutém hesle“ nelze v tomto FE repu prokázat ani vyvrátit (je to backend/mail policy). | V repu není implementace mail server logiky ani hard-coded admin identity na této adrese. | Audit doplnit nad backend repozitářem + SMTP templaty + integrační testy e-mail toku. |

## Doplňující doporučení
1. Založit `docs/regen/parity/` jako živý kontrakt feature parity (UI+API+RBAC).
2. Přidat minimální e2e smoke testy (admin login, users edit/reset, prints back link, logout).
3. Přidat check na neexistující interní routy/linky (lint pravidlo nebo test přes route manifest).


# Parity gap matrix (forenzní výchozí stav)

| Oblast | Stav v repozitáři | Gap vůči požadovanému chování |
|---|---|---|
| Admin landing po loginu | Default směřuje na `/admin/instances` | Route neexistuje, nutná oprava defaultu |
| Admin správa uživatelů | Create + reset + migrace | Chybí editace name/email/phone |
| Reset hesla | Uživatelský token reset přes `/reset` | Speciální admin „help e-mail“ tok není ve FE prokazatelný |
| Terminologie | Smíšené `instance/entity/user` | Nutná doménová konsolidace po přechodu na user-login model |
| Navigace tisky | „Zpět“ na `/admin/instances` | Slepá navigace |
