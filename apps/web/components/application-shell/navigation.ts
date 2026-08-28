export type PrimaryNavigationItem = {
  href: string;
  id: string;
  isCurrent: boolean;
  label: string;
};

export const primaryNavigation = [
  {
    href: "/",
    id: "atlas",
    isCurrent: true,
    label: "Atlas",
  },
] as const satisfies readonly PrimaryNavigationItem[];
