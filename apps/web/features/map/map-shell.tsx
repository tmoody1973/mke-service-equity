import {getMapStyleUrl} from "./map-config";
import {MapCanvas} from "./map-canvas";

export function MapShell() {
  return (
    <section
      aria-label="Map workspace"
      className="relative h-[calc(100dvh-3.5rem)] min-h-96 overflow-hidden border-t border-divider bg-[var(--mke-panel)] min-[768px]:h-[calc(100dvh-4rem)]"
      role="region"
    >
      <MapCanvas styleUrl={getMapStyleUrl()} />
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 max-w-md sm:inset-x-auto sm:left-4">
        <p
          className="rounded-[var(--mke-radius-panel)] border border-divider bg-background/95 px-4 py-3 text-sm text-muted shadow-sm backdrop-blur"
          role="status"
        >
          Analytical layers are intentionally absent from this Plan 1 foundation.
        </p>
      </div>
    </section>
  );
}
