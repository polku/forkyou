FOR-37 — clarification on what is expected and current deliverable status

Attendu ici (Definition of Done):
1. Freeze `EndgameContract v1` (request/response types, error taxonomy, timeout semantics, unsupported-position behavior).
2. Provide Syzygy vs fallback compatibility matrix.
3. Provide contract test checklist (>=10 scenarios: corruption, timeout, unsupported material, illegal positions included).
4. Post final summary to parent FOR-21 with open risks and sign-off requests.

Statut de ratification:
- CTO sign-off: ratifié le 2026-04-30.
- Arbitrages validés:
  1. `rule_mode`: `auto_75` par défaut (`fide_claim_aware` reste option diagnostique).
  2. Gates STC/LTC: `>= 0.0 Elo`, CI 95% ne doit pas passer en négatif.
  3. Quarantaine provider: si `timeout+error > 0.5%` sur fenêtre glissante de 10k probes, ou si corruption détectée.

What is now delivered:
- Contract freeze draft + semantics: `research_deliverables/FOR-37-endgames-contract-freeze-and-test-matrix.md`
- Compatibility matrix (Syzygy primary + deterministic fallback): included in same document.
- Test checklist: 12 explicit scenarios included in same document.
- Evidence table with source quality/date, assumptions, risks, and recommendation: included.

Décisions ouvertes:
- Aucune. Les 3 gates sont arbitrés par le CTO.

Proposed next action:
- CTO/Tech Lead confirms the 3 open decisions above; after confirmation, coder can implement `EndgameContract v1` and contract tests with no further research blocker.
