import type {CompareAvailableResponse} from "@mke/contracts";

import {ComparisonCards} from "./comparison-cards";
import {ComparisonEvidence} from "./comparison-evidence";
import {ComparisonMatrix} from "./comparison-matrix";

export function ComparisonSummary({comparison}: {comparison: CompareAvailableResponse}) {
  return (
    <section aria-labelledby="comparison-summary-heading" className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground" id="comparison-summary-heading">
          Comparison summary
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted">
          Start with population, Priority, Equity Baseline, Food Access Need, and four food-access
          measures. Percentile shows where a tract falls among Milwaukee County tracts with enough
          data. Missing information is not counted as zero.
        </p>
      </div>
      <div className="hidden lg:block" data-comparison-layout="desktop">
        <ComparisonMatrix comparison={comparison} />
      </div>
      <div className="lg:hidden" data-comparison-layout="mobile">
        <ComparisonCards comparison={comparison} />
      </div>
      <ComparisonEvidence comparison={comparison} />
    </section>
  );
}
