const hydrationWarningPrefix =
  "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.";

export function isKnownHeroUiReactAriaDevHydrationWarning(text: string): boolean {
  return process.env.MKE_ATLAS_DATA_MODE === "validated_preview"
    && Boolean(process.env.MKE_ATLAS_PREVIEW_RUN_ID)
    && text.startsWith(hydrationWarningPrefix)
    && text.includes('data-collection="react-aria-')
    && text.includes("aria-labelledby=");
}
