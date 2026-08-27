import {getMapStyleUrl} from "./map-config";
import {MapCanvas} from "./map-canvas";

export function MapShell() {
  return (
    <section
      aria-label="Map workspace"
      className="relative h-[calc(100dvh-3.5rem)] min-h-96 overflow-hidden border-t border-divider bg-default min-[768px]:h-[calc(100dvh-4rem)]"
      role="region"
    >
      <MapCanvas styleUrl={getMapStyleUrl()} />
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 max-w-md sm:inset-x-auto sm:left-4">
        <p
          className="rounded-[var(--mke-radius-panel)] border border-divider bg-background px-4 py-3 text-sm text-foreground"
          role="status"
        >
          No published Food Equity data is available yet.
        </p>
      </div>
    </section>
  );
}
