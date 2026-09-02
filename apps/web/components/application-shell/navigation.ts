export type PrimaryNavigationItem = {
  href: string;
  id: string;
  label: string;
};

export type PrimaryNavigationGroup = {
  id: string;
  label: string;
  items: ReadonlyArray<PrimaryNavigationItem>;
};

export const primaryNavigation = [
  {
    id: "explore",
    label: "Explore",
    items: [{
      href: "/",
      id: "atlas",
      label: "Atlas",
    }],
  },
  {
    id: "analyze",
    label: "Analyze",
    items: [
      {
        href: "/analyze/compare",
        id: "compare-areas",
        label: "Compare Areas",
      },
      {
        href: "/analyze/opportunity",
        id: "opportunity-explorer",
        label: "Opportunity Explorer",
      },
    ],
  },
  {
    id: "data",
    label: "Data",
    items: [{
      href: "/data",
      id: "download-data",
      label: "Download data",
    }],
  },
] as const satisfies readonly PrimaryNavigationGroup[];
