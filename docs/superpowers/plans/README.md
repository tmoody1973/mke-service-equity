# Implementation Plans

Do not use one monolithic build plan.

Create and execute six detailed plans:

1. Foundation + Database
2. Data Pipeline + Equity Baseline
3. Food Data + Accessibility + Priority
4. Atlas + Tract Profile
5. Compare + Opportunity Explorer
6. Methodology + Export + Production QA

Each plan must contain:

- exact files
- interfaces consumed/produced
- failing tests first for analytical logic
- exact commands
- expected test outcomes
- small task boundaries
- commit checkpoints
- responsive requirements where user-facing
- relevant Linear issue identifier

## Gate dependencies

Plan 2 → Gate 1 → Plan 3

Plan 4 → Gate 2 → Plan 5

Plan 6 → Gate 3 → Release

Do not bypass gates.
