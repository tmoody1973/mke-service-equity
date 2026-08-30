import type {ComponentPropsWithoutRef, ReactElement, ReactNode} from "react";
import {cloneElement, createContext, useContext, useState} from "react";

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

type SheetContextValue = {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
};

const SheetContext = createContext<SheetContextValue | null>(null);

function useTestSheet() {
  const value = useContext(SheetContext);
  if (!value) {
    throw new Error("Sheet compounds must be rendered inside Sheet");
  }
  return value;
}

function SheetRoot({
  children,
  isOpen = false,
  onOpenChange,
}: {
  children: ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  [key: string]: unknown;
}) {
  return (
    <SheetContext.Provider value={{
      isOpen,
      setOpen: (open) => onOpenChange?.(open),
    }}>
      {children}
    </SheetContext.Provider>
  );
}

function SheetTrigger({children}: {children: ReactElement<{onPress?: () => void}>}) {
  const {setOpen} = useTestSheet();
  return cloneElement(children, {
    onPress: () => {
      children.props.onPress?.();
      setOpen(true);
    },
  });
}

function SheetBackdrop({children}: {children: ReactNode; variant?: string}) {
  const {isOpen} = useTestSheet();
  return isOpen ? <div data-sheet-backdrop>{children}</div> : null;
}

function SheetCloseTrigger(props: ComponentPropsWithoutRef<"button">) {
  const {setOpen} = useTestSheet();
  return <button {...props} onClick={() => setOpen(false)} type="button">×</button>;
}

function SheetDialog(props: ComponentPropsWithoutRef<"div">) {
  return <div role="dialog" {...props} />;
}

function SheetHeading(props: ComponentPropsWithoutRef<"h2">) {
  return <h2 {...props} />;
}

function SheetElement(props: ComponentPropsWithoutRef<"div">) {
  return <div {...props} />;
}

function SheetHandle() {
  return <div aria-hidden="true" data-sheet-handle />;
}

export const Sheet = Object.assign(SheetRoot, {
  Backdrop: SheetBackdrop,
  Body: SheetElement,
  CloseTrigger: SheetCloseTrigger,
  Content: SheetElement,
  Dialog: SheetDialog,
  Handle: SheetHandle,
  Header: SheetElement,
  Heading: SheetHeading,
  Trigger: SheetTrigger,
});
