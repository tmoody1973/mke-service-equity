import type {ReactNode} from "react";

import {ResponsiveSidebar} from "./responsive-sidebar";

type ApplicationShellProps = {
  children: ReactNode;
  mainId?: string;
  pageTitle?: string;
  skipLinkLabel?: string;
};

export function ApplicationShell({
  children,
  mainId = "map-workspace",
  pageTitle = "Food Equity Atlas",
  skipLinkLabel = "Skip to the Food Equity Atlas",
}: ApplicationShellProps) {
  return (
    <>
      <a className="mke-skip-link" href={`#${mainId}`}>
        {skipLinkLabel}
      </a>
      <ResponsiveSidebar mainId={mainId} pageTitle={pageTitle}>
        {children}
      </ResponsiveSidebar>
    </>
  );
}
