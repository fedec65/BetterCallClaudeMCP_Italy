# citation-verify-ita

MCP server per la **verifica di esistenza** delle citazioni giuridiche italiane.

## Tool

### `citation-verify-ita_check_existence`

Verifica che una citazione giuridica esista interrogando le fonti ufficiali.

**Input:**

| Parametro | Tipo | Note |
|---|---|---|
| `citazione` | string (required) | Es. `Cass. n. 12345/2024`, `D.Lgs. 231/2001`, `art. 1456 c.c.` |
| `italgiure_cookie` | string (optional) | Cookie di sessione ItalGiure, necessario per citazioni di giurisprudenza |

**Citazioni riconosciute:**

- **Sentenze Cassazione** — `Cass. n. 12345/2024`, `Cassazione civile Sez. 3, n. 32127 del 2024` → verifica su **ItalGiure** (API Solr CED Ministero della Giustizia)
- **Atti normativi** — `D.Lgs. 231/2001`, `Legge 24 agosto 2017, n. 123`, `D.P.R. 445/2000` → verifica su **Normattiva Open Data**
- **Codici abbreviati** — `art. 1456 c.c.`, `art. 360 c.p.c.`, `art. 24 Cost.` → verifica l'atto istitutivo (c.c. → R.D. 262/1942, c.p.c. → R.D. 1443/1940, c.p. → R.D. 1398/1930, c.p.p. → D.P.R. 447/1988)

**Output:**

```json
{
  "success": true,
  "data": {
    "exists": true,
    "fonte": "cassazione | normattiva | null",
    "riferimento_normalizzato": {
      "tipo": "Sentenza Corte di Cassazione",
      "numero": "32127",
      "anno": 2024,
      "sezione": "3",
      "url": "https://..."
    },
    "note": ["..."]
  }
}
```

## Limiti

- Verifica solo l'**esistenza** della fonte, non l'**implicazione** (se il contenuto supporta una claim). La verifica di implicazione resta responsabilità del client/LLM.
- Citazione non riconosciuta → `exists: false, fonte: null` con nota esplicativa.
- Se la fonte non è raggiungibile (cookie ItalGiure assente/scaduto, Normattiva down) → errore `SOURCE_UNAVAILABLE`. Il tool **non inventa mai contenuto**.
- Per le sentenze Cassazione serve il cookie ItalGiure: vedi [docs/05-CASSAZIONE-ITALGIURE.md](../../docs/05-CASSAZIONE-ITALGIURE.md).

## Affidabilità fonti

| Fonte | Tipo | Affidabilità |
|---|---|---|
| Normattiva | Open Data API | ✅ Alta |
| ItalGiure | API Solr autenticata (cookie) | ⚠️ Media (richiede SPID/credenziali professionali) |
