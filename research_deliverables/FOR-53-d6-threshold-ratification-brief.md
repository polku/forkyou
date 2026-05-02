# FOR-53 Research Deliverable: Ratify D6 STC/LTC Threshold Values

## 1) Question and Scope
Question: Should FOR-42C ratify the current D6 STC/LTC threshold values for deterministic benchmark gates, and under what decision conditions?

Scope:
- Validate whether current `ci_gate` (STC) and `release_gate` (LTC) values are internally consistent with project governance and implementation.
- Assess evidence strength for immediate ratification versus adjustment.
- Exclude full threshold retuning experiments (requires fresh benchmark campaign data).

Decision date context: May 2, 2026.

## 2) Key Findings
1. D6 is a formally required dependency with explicit ownership and acceptance criteria, and this issue is the governance ratification step for threshold values.
2. Candidate threshold numbers already exist in the canonical policy file `benchmarks/endgames/thresholds.json` with separate STC (`ci_gate`) and LTC (`release_gate`) profiles.
3. Governance docs require staged gating: STC for frequent merge-path checks and LTC for release/default-enable decisions.
4. Existing evidence quality is high for policy shape (two-tier gates) but medium for numeric optimality (values are documented as provisional pending ratification).
5. Main operational risk is policy/implementation drift if all benchmark runners do not enforce explicit gate-key selection consistently.
6. No conflicting in-thread comments were provided in this wake; ratification can proceed now with explicit effective date and re-baseline trigger conditions.

## 3) Evidence Table
| Claim | Source | Source quality | Source date | Strength | Notes |
|---|---|---|---|---|---|
| D6 is required and tied to STC/LTC threshold definition | `docs/adr/FOR-19-dependency-matrix-v1.md` | Internal primary governance artifact | 2026-04-30 | High | Defines D6 ownership and DoD criteria for thresholds + CI gating. |
| STC for merge path, LTC for release/default-on | `docs/adr/FOR-15-adr-hardening-v2.md` | Internal primary ADR | 2026-04-30 | High | Explicitly states staged gate requirement. |
| Candidate numeric values already codified | `benchmarks/endgames/thresholds.json` | Internal primary config | 2026-04-30 | High | `ci_gate`: p50<=10/p95<=40/p99<=100/fail<=2%/correct>=98%; `release_gate`: p50<=5/p95<=25/p99<=60/fail<=0.5%/correct>=99.5%. |
| Ratification remains identified as open action | `research_deliverables/FOR-42-remaining-work-checklist.md` | Internal working artifact | 2026-04-30 | Medium-High | Lists threshold ratification as remaining governance step. |
| Staged STC->LTC testing pattern aligns with established engine process | `research_deliverables/FOR-37-endgames-contract-freeze-and-test-matrix.md` (cites official Stockfish docs, retrieved 2026-04-30) | Internal synthesis of external primary docs | 2026-04-30 retrieval | Medium-High | Supports process pattern, not exact local numeric cutoffs. |

## 4) Assumptions and Uncertainty
Assumptions:
- `benchmarks/endgames/thresholds.json` is the intended source of truth for D6 values.
- Hardware variance and runtime conditions are within expected CI/release envelopes assumed by current values.
- No newer superseding threshold proposal exists outside this repository snapshot.

Uncertainty:
- Numeric strictness calibration remains medium-confidence without a fresh multi-run benchmark sample on current CI and release hardware.
- If workload mix changes materially, thresholds may require re-baselining.

## 5) Risks and Tradeoffs
- Risk (too strict): false negatives in CI/release gates, slowing integration.
- Risk (too lenient): silent performance/correctness regressions passing gates.
- Tradeoff: ratify now for governance closure and enforceability vs defer for additional calibration data at cost of delayed D6 closure.
- Process risk: if gate selection is not explicit and consistent across runners, ratified policy may not be uniformly enforced.

## 6) Recommendation and Next Actions
Recommendation:
- Ratify current D6 values as **effective immediately on May 2, 2026** for policy closure, with an explicit follow-up re-baseline trigger.

Proposed ratification text:
- STC (`ci_gate`): `maxP50Ms=10`, `maxP95Ms=40`, `maxP99Ms=100`, `maxFailureRate=0.02`, `minCorrectStatusRate=0.98`.
- LTC (`release_gate`): `maxP50Ms=5`, `maxP95Ms=25`, `maxP99Ms=60`, `maxFailureRate=0.005`, `minCorrectStatusRate=0.995`.
- Review trigger: re-evaluate thresholds after first 200 gated runs or any sustained >20% failure increase vs trailing 30-day baseline.

Next actions:
1. CTO: approve/reject these exact values and effective date (owner: CTO).
2. Engineering owner: confirm all benchmark entrypoints require explicit gate-key selection and emit gate key in artifacts/logs.
3. Researcher: if CTO requests adjustment, run a narrow recalibration analysis from recent benchmark artifacts and return a revised threshold proposal.
