export const COMPARISON_FOOD_METRICS = [
  {slug: "sram_snap_low_access_share_1mi", label: "Residents beyond one driving mile from a SNAP-authorized retailer"},
  {slug: "full_service_grocery_walk_access", label: "Walk to the nearest full-service grocery"},
  {slug: "households_no_vehicle", label: "Households with no vehicle available"},
  {slug: "scheduled_transit_service_intensity", label: "Scheduled transit service within a ten-minute walk"},
] as const;

export const COMPARISON_EQUITY_GROUPS = [
  {
    id: "demographic",
    label: "Demographic and structural indicators",
    metrics: [
      {slug: "people_of_color", label: "People of color"},
      {slug: "limited_english_proficiency", label: "Speaks English less than ‘very well,’ age 5+"},
      {slug: "foreign_born", label: "Foreign born"},
    ],
  },
  {
    id: "socioeconomic",
    label: "Socioeconomic indicators",
    metrics: [
      {slug: "below_200_percent_fpl", label: "Population below 200 percent of the federal poverty level"},
      {slug: "unemployment", label: "Unemployment"},
      {slug: "less_than_high_school", label: "Less than high school education"},
      {slug: "housing_cost_burden", label: "Housing cost burden"},
    ],
  },
  {
    id: "health",
    label: "Health indicators",
    metrics: [
      {slug: "diagnosed_diabetes", label: "Diagnosed diabetes"},
      {slug: "obesity", label: "Obesity"},
      {slug: "current_asthma", label: "Current asthma"},
      {slug: "any_disability", label: "Any disability"},
      {slug: "frequent_mental_distress", label: "Frequent mental distress"},
      {slug: "no_leisure_time_physical_activity", label: "No leisure-time physical activity"},
    ],
  },
] as const;

export const COMPARISON_METRIC_PRESENTATION_ORDER = [
  ...COMPARISON_FOOD_METRICS.map((metric) => ({category: "food_access" as const, ...metric})),
  ...COMPARISON_EQUITY_GROUPS.flatMap((group) => group.metrics.map((metric) => ({
    category: "equity_baseline" as const,
    ...metric,
  }))),
];

export type ComparisonMetricRegistryItem = typeof COMPARISON_METRIC_PRESENTATION_ORDER[number];
