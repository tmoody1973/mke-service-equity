import type {ComponentPropsWithoutRef, ReactNode} from "react";
import {createContext, useContext, useState} from "react";

type ProviderProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
  collapsible?: "icon" | "offcanvas" | "none";
  toggleShortcut?: string | false | null;
};

type SidebarContextValue = {
  collapsible: "icon" | "offcanvas" | "none";
  isMobile: boolean;
  isMobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
  rememberOpener: (opener: HTMLButtonElement) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useTestSidebar() {
  const value = useContext(SidebarContext);

  if (!value) {
    throw new Error("Sidebar compounds must be rendered inside Sidebar.Provider");
  }

  return value;
}

function Provider({children, collapsible, toggleShortcut, ...props}: ProviderProps) {
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const [isMobileOpen, setMobileOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);

  void toggleShortcut;

  function closeMobile() {
    setMobileOpen(false);
    queueMicrotask(() => opener?.focus());
  }

  return (
    <SidebarContext.Provider
      value={{
        closeMobile,
        collapsible: collapsible ?? "icon",
        isMobile,
        isMobileOpen,
        openMobile: () => setMobileOpen(true),
        rememberOpener: setOpener,
      }}
    >
      <div data-collapsible={collapsible} {...props}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function SidebarRoot({children, ...props}: ComponentPropsWithoutRef<"aside">) {
  const {collapsible, isMobile} = useTestSidebar();

  return isMobile ? null : <aside data-collapsible={collapsible} {...props}>{children}</aside>;
}

function Mobile({children}: {backdrop?: "blur" | "opaque" | "transparent"; children: ReactNode}) {
  const {isMobile, isMobileOpen} = useTestSidebar();

  return isMobile && isMobileOpen ? <aside data-mobile-sidebar>{children}</aside> : null;
}

function Trigger({children, onClick, ...props}: ComponentPropsWithoutRef<"button">) {
  const {closeMobile, isMobileOpen, openMobile, rememberOpener} = useTestSidebar();
  const isOpenTrigger = props["aria-label"] === "Open navigation";

  return (
    <button
      {...props}
      onClick={(event) => {
        if (onClick) onClick(event);
        if (!event.defaultPrevented) {
          if (isMobileOpen) {
            closeMobile();
          } else {
            if (isOpenTrigger) rememberOpener(event.currentTarget);
            openMobile();
          }
        }
      }}
      type="button"
    >
      {children}
    </button>
  );
}

function Menu({children, ...props}: ComponentPropsWithoutRef<"div">) {
  return <div role="tree" {...props}>{children}</div>;
}

function MenuItem({children, href, isCurrent, textValue, ...props}: ComponentPropsWithoutRef<"a"> & {
  isCurrent?: boolean;
  textValue?: string;
}) {
  const {closeMobile, isMobile} = useTestSidebar();

  void textValue;

  return (
    <a
      {...props}
      aria-current={isCurrent ? "page" : undefined}
      aria-selected={isCurrent}
      href={href}
      onClick={(event) => {
        if (props.onClick) props.onClick(event);
        if (isMobile) closeMobile();
      }}
      role="treeitem"
    >
      {children}
    </a>
  );
}

function Element({as: Tag = "div", children, ...props}: ComponentPropsWithoutRef<"div"> & {
  as?: "div" | "header" | "span";
}) {
  return <Tag {...props}>{children}</Tag>;
}

function Main(props: ComponentPropsWithoutRef<"main">) {
  return <main {...props} />;
}

export const Sidebar = Object.assign(SidebarRoot, {
  Content: Element,
  Group: Element,
  Header: Element,
  Main,
  Menu,
  MenuItem,
  MenuLabel: Element,
  Mobile,
  Provider,
  Trigger,
});
