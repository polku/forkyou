# FOR-29 Research Deliverable: Backend Engineer Role Profile and Interview Scorecard

## 1. Summary
This deliverable proposes an evidence-based backend engineer hiring profile and interview scorecard using structured interviews plus job-relevant work-sample assessment. The strongest general finding from personnel-selection research is that structured methods outperform unstructured interviews for predicting job performance, especially when questions are anchored to a role analysis and scored with predefined rubrics. For software hiring specifically, recent empirical HCI/SE studies indicate current technical interview formats often over-index on puzzle solving and under-measure communication, collaboration, and real-task transfer, which can reduce signal quality for day-to-day engineering performance. Based on this synthesis, the recommended scorecard balances system design, production debugging judgment, coding implementation quality, and collaboration/ownership behaviors with explicit rating anchors and interviewer calibration.

## 2. Evidence
Major claim A: Structured selection methods provide higher predictive validity than unstructured interviews.
- Schmidt, F. L., & Hunter, J. E. (1998). *The validity and utility of selection methods in personnel psychology*. Psychological Bulletin, 124(2), 262-274. DOI: 10.1037/0033-2909.124.2.262
- Campion, M. A., Palmer, D. K., & Campion, J. E. (1997). *A review of structure in the selection interview*. Personnel Psychology, 50(3), 655-702. DOI: 10.1111/j.1744-6570.1997.tb00709.x
- Levashina, J., Hartwell, C. J., Morgeson, F. P., & Campion, M. A. (2014). *The structured employment interview: Narrative and quantitative review of the research literature*. Personnel Psychology, 67(1), 241-293. DOI: 10.1111/peps.12052

Major claim B: Software interview performance is affected by format design, and interviewers value communication + technical balance rather than algorithm-only performance.
- Behroozi, M., Shi, K., & Campbell, J. C. et al. (2020). *Debugging Hiring: What Went Right and What Went Wrong in the Technical Interview Process*. ESEC/FSE 2020 (ACM). DOI: 10.1145/3368089.3409670
- Shi, K., Shah, S., & Campbell, J. C. et al. (2017). *The Tech-Talk Balance: What Technical Interviewers Expect from Technical Candidates*. CHASE @ ICSE 2017 (IEEE/ACM). URL: https://www.microsoft.com/en-us/research/publication/the-tech-talk-balance-what-technical-interviewers-expect-from-technical-candidates/

Major claim C: Role-relevant work samples and standardized scoring improve practical transferability of hiring assessments.
- Schmidt, F. L., Oh, I.-S., & Shaffer, J. A. (2016). *The validity and utility of selection methods in personnel psychology: Practical and theoretical implications of 100 years of research findings* (update). (Published update summarized in Journal of Applied Psychology/SIOP review venues; use for updated effect-size interpretation alongside 1998 baseline).
- Sackett, P. R., Zhang, C., Berry, C. M., & Lievens, F. (2022). *Revisiting meta-analytic estimates of validity in personnel selection*. Journal of Applied Psychology, 107(6), 918-940. DOI: 10.1037/apl0000994

## 3. Applicability Assessment
This is directly applicable to ForChess because the team needs high-signal backend hiring under constrained interviewer bandwidth. A structured, rubric-scored loop should reduce variance across interviewers and improve prediction of on-job backend execution compared with ad hoc conversational interviews.

## 4. Engineering Follow-up Tasks
- Define backend competency matrix v1 (distributed systems, data modeling, reliability, observability, debugging, ownership).
- Implement interview packet templates (question bank + anchor rubrics) for each round.
- Build interviewer calibration session and scoring normalization checklist.
- Pilot the scorecard on next 5 candidates; compare pass-through rates and 90-day manager satisfaction.
- Add post-hire validation loop: correlate interview dimension scores with first-quarter performance signals.

## 5. Open Questions
- Which backend stack dimensions are mission-critical for ForChess in the next two quarters (e.g., Rust/Go, event-driven systems, low-latency services)?
- What hiring-level split is needed (mid vs senior), and should score weighting differ by level?
- Should a take-home or asynchronous work sample replace one live coding round to improve signal and candidate experience?
- Which legal/compliance constraints apply to score storage and interviewer note retention?

## Proposed Role Profile + Scorecard Draft (for CTO review)
### Role profile (Backend Engineer, ForChess)
- Mission: build and operate reliable backend services for chess gameplay, analysis pipelines, and data products.
- Outcomes (first 6 months): ship production features safely; improve reliability/latency metrics; reduce incident MTTD/MTTR; contribute to architecture and code-review quality.
- Core competencies:
  - Distributed systems and API design
  - Data modeling and storage trade-offs
  - Reliability engineering (SLOs, monitoring, incident response)
  - Debugging under ambiguity
  - Collaboration, ownership, and written technical communication

### Interview loop and scoring weights
- Round 1: Structured technical screen (problem decomposition + coding fundamentals) - 20%
- Round 2: Backend system design (scalable service design + trade-offs) - 30%
- Round 3: Production debugging and reliability scenario - 25%
- Round 4: Behavioral/ownership structured interview - 15%
- Round 5: Collaboration/code review simulation - 10%

### Rating rubric (1-4 anchors)
- 1: Insufficient evidence / major gaps; frequent prompting required.
- 2: Partial evidence; can solve constrained problems but misses key trade-offs.
- 3: Strong evidence; independently solves, explains trade-offs, and handles edge cases.
- 4: Exceptional evidence; anticipates failure modes, quantifies trade-offs, and elevates team decisions.

### Decision rule
- No-hire if any critical competency (reliability/debugging/ownership) is rated 1.
- Hire threshold: weighted composite >= 3.0 with no critical competency below 2.
- Debrief protocol: independent scoring before discussion, then evidence-only reconciliation.
