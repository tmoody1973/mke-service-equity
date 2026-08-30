import type {ReactNode} from "react";

import {ResponsiveSidebar} from "./responsive-sidebar";

type ApplicationShellProps = {
  children: ReactNode;
};

export function ApplicationShell({children}: ApplicationShellProps) {
  return (
    <>
      <a className="mke-skip-link" href="#map-workspace">
        Skip to the Food Equity Atlas
      </a>
      <ResponsiveSidebar>{children}</ResponsiveSidebar>
    </>
  );
}
