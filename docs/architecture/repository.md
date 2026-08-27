# Repository Structure

```text
mke-service-equity/
├── apps/
│   └── web/
│       ├── app/
│       ├── components/
│       ├── features/
│       ├── lib/
│       ├── styles/
│       └── tests/
├── packages/
│   ├── database/
│   │   ├── schema/
│   │   ├── migrations/
│   │   ├── queries/
│   │   └── seeds/
│   ├── contracts/
│   ├── design-system/
│   └── config/
├── pipelines/
│   ├── common/
│   ├── census/
│   ├── places/
│   ├── usda/
│   ├── mcts/
│   ├── milwaukee/
│   ├── accessibility/
│   └── scoring/
├── data/
│   ├── manual/
│   ├── fixtures/
│   └── README.md
├── sql/
│   ├── analytics/
│   ├── spatial/
│   ├── materialized-views/
│   └── validation/
├── tests/
│   ├── data/
│   ├── scoring/
│   ├── spatial/
│   └── integration/
├── docs/
├── scripts/
└── .github/workflows/
```

## Feature orientation

The web app should group implementation by product feature:

```text
features/
  atlas/
  tract-profile/
  compare/
  opportunity-explorer/
  methodology/
  search/
  food-resources/
```

Keep files focused and interfaces explicit.

## Shared contracts

`packages/contracts/` should contain Zod schemas and TypeScript contracts crossing system boundaries.

Example conceptual `TractProfile`:

- geoid
- name
- population
- equityBaseline
- foodNeed
- foodPriority
- indicators
- resources
- qualityStatus
- methodologyVersion
