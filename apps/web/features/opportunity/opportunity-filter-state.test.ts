import {describe, expect, it} from "vitest";

import {
  draftFromOpportunityFilters,
  EMPTY_OPPORTUNITY_FILTERS,
  validateOpportunityFilterDraft,
} from "./opportunity-filter-state";

describe("validateOpportunityFilterDraft", () => {
  it("keeps blank optional controls inactive and observed zero explicit", () => {
    const draft = draftFromOpportunityFilters(EMPTY_OPPORTUNITY_FILTERS);
    draft.noVehicleMinimumPercent = "0";

    expect(validateOpportunityFilterDraft(draft)).toMatchObject({
      success: true,
      filters: {
        equityPercentileMinimum: null,
        noVehicleMinimumPercent: 0,
      },
    });
  });

  it("rejects range, precision-step, nonnumeric, and unknown categorical values", () => {
    const range = draftFromOpportunityFilters(EMPTY_OPPORTUNITY_FILTERS);
    range.equityPercentileMinimum = "101";
    expect(validateOpportunityFilterDraft(range)).toMatchObject({
      success: false,
      errors: {equityPercentileMinimum: expect.stringContaining("0 through 100")},
    });

    const step = draftFromOpportunityFilters(EMPTY_OPPORTUNITY_FILTERS);
    step.noVehicleMinimumPercent = "0.001";
    expect(validateOpportunityFilterDraft(step)).toMatchObject({
      success: false,
      errors: {noVehicleMinimumPercent: expect.stringContaining("two decimal places")},
    });

    const nonnumeric = draftFromOpportunityFilters(EMPTY_OPPORTUNITY_FILTERS);
    nonnumeric.groceryWalkMinimumMinutes = "NaN";
    expect(validateOpportunityFilterDraft(nonnumeric)).toMatchObject({
      success: false,
      errors: {groceryWalkMinimumMinutes: expect.any(String)},
    });

    const unknown = draftFromOpportunityFilters(EMPTY_OPPORTUNITY_FILTERS);
    unknown.foodNeedBands = ["unknown"];
    expect(validateOpportunityFilterDraft(unknown)).toMatchObject({
      success: false,
      errors: {form: expect.stringContaining("not recognized")},
    });
  });
});
