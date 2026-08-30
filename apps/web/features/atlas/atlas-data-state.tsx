import type {AtlasResponse} from "@mke/contracts";

type AtlasDataStateProps = {
  response: AtlasResponse;
};

export function AtlasDataState({response}: AtlasDataStateProps) {
  if (response.state === "available" && response.mode === "published") {
    return null;
  }

  const noPublishedRun = response.state === "unavailable"
    && response.reason === "no_published_run";
  const preview = response.state === "available"
    && response.mode === "validated_preview";

  const message = preview
    ? "Validated preview — not published"
    : noPublishedRun
      ? "No published Food Equity data is available yet."
      : "Atlas data is temporarily unavailable.";

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-20 z-10 max-w-md min-[600px]:inset-x-auto min-[600px]:bottom-3 min-[600px]:left-4">
      <p
        className="rounded-[var(--mke-radius-panel)] border border-divider bg-background px-4 py-3 text-sm text-foreground"
        role={preview || noPublishedRun ? "status" : "alert"}
      >
        {message}
      </p>
    </div>
  );
}
