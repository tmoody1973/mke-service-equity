"use client";

import {Sidebar} from "@heroui-pro/react";
import {usePathname, useRouter} from "next/navigation";
import type {ReactNode} from "react";

import {primaryNavigation} from "./navigation";

type ResponsiveSidebarProps = {
  children: ReactNode;
  mainId: string;
  pageTitle: string;
};

function Brand() {
  return (
    <div className="flex min-h-11 items-center px-2">
      <span className="text-foreground text-sm font-semibold tracking-[-0.01em]">
        MKE Service Equity
      </span>
    </div>
  );
}

function PrimaryNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary">
      {primaryNavigation.map((group) => {
        const labelId = `navigation-group-${group.id}`;
        return (
          <Sidebar.Group key={group.id}>
            <Sidebar.GroupLabel
              className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted"
              id={labelId}
            >
              {group.label}
            </Sidebar.GroupLabel>
            <Sidebar.Menu aria-labelledby={labelId}>
              {group.items.map((item) => {
                const isCurrent = pathname === item.href
                  || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
                return (
                  <Sidebar.MenuItem
                    className="min-h-11"
                    href={item.href}
                    id={item.id}
                    isCurrent={isCurrent}
                    key={item.id}
                    textValue={item.label}
                  >
                    <Sidebar.MenuLabel>
                      {item.label}
                      {isCurrent ? <span className="sr-only">Current page</span> : null}
                    </Sidebar.MenuLabel>
                  </Sidebar.MenuItem>
                );
              })}
            </Sidebar.Menu>
          </Sidebar.Group>
        );
      })}
    </nav>
  );
}

export function ResponsiveSidebar({children, mainId, pageTitle}: ResponsiveSidebarProps) {
  const router = useRouter();

  return (
    <Sidebar.Provider
      className="min-h-dvh bg-[var(--mke-canvas)]"
      collapsible="offcanvas"
      navigate={router.push}
      toggleShortcut={false}
    >
      <Sidebar aria-label="Application navigation">
        <Sidebar.Header>
          <Brand />
        </Sidebar.Header>
        <Sidebar.Content>
          <PrimaryNavigation />
        </Sidebar.Content>
      </Sidebar>

      <Sidebar.Mobile backdrop="blur">
        <Sidebar.Header>
          <div className="flex min-h-14 items-center justify-between gap-3 px-2">
            <Brand />
            <Sidebar.Trigger aria-label="Close navigation" className="min-h-11 min-w-11" />
          </div>
        </Sidebar.Header>
        <Sidebar.Content>
          <PrimaryNavigation />
        </Sidebar.Content>
      </Sidebar.Mobile>

      <Sidebar.Main
        className="min-w-0 overflow-hidden bg-[var(--mke-canvas)]"
        id={mainId}
        tabIndex={-1}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 px-3 min-[768px]:h-16 min-[769px]:hidden">
          <Sidebar.Trigger
            aria-label="Open navigation"
            className="min-h-11 min-w-11 min-[769px]:hidden"
          />
          <div className="min-w-0 min-[769px]:hidden">
            <p className="truncate text-xs font-medium text-foreground">MKE Service Equity</p>
            <p className="truncate text-sm font-semibold text-foreground">{pageTitle}</p>
          </div>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </Sidebar.Main>
    </Sidebar.Provider>
  );
}
