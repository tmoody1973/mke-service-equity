"use client";

import {Sidebar} from "@heroui-pro/react";
import {useRouter} from "next/navigation";
import type {ReactNode} from "react";

import {primaryNavigation} from "./navigation";

type ResponsiveSidebarProps = {
  children: ReactNode;
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
  return (
    <nav aria-label="Primary">
      <Sidebar.Menu aria-label="Atlas">
        {primaryNavigation.map((item) => (
          <Sidebar.MenuItem
            href={item.href}
            id={item.id}
            isCurrent={item.isCurrent}
            key={item.id}
            textValue={item.label}
          >
            <Sidebar.MenuLabel>
              {item.label}
              {item.isCurrent ? <span className="sr-only">Current page</span> : null}
            </Sidebar.MenuLabel>
          </Sidebar.MenuItem>
        ))}
      </Sidebar.Menu>
    </nav>
  );
}

export function ResponsiveSidebar({children}: ResponsiveSidebarProps) {
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
          <Sidebar.Group>
            <PrimaryNavigation />
          </Sidebar.Group>
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
          <Sidebar.Group>
            <PrimaryNavigation />
          </Sidebar.Group>
        </Sidebar.Content>
      </Sidebar.Mobile>

      <Sidebar.Main
        className="min-w-0 overflow-hidden bg-[var(--mke-canvas)]"
        id="map-workspace"
        tabIndex={-1}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 px-3 min-[768px]:h-16 min-[769px]:px-4">
          <Sidebar.Trigger
            aria-label="Open navigation"
            className="min-h-11 min-w-11 min-[769px]:hidden"
          />
          <div className="min-w-0 min-[769px]:hidden">
            <p className="truncate text-xs font-medium text-foreground">MKE Service Equity</p>
            <p className="truncate text-sm font-semibold text-foreground">Food Equity Atlas</p>
          </div>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </Sidebar.Main>
    </Sidebar.Provider>
  );
}
