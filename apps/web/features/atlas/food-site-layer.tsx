"use client";

import type {
  AtlasFoodSiteProperties,
  AtlasFoodSitesLayerResponse,
} from "@mke/contracts";
import {Button, Card, Link, Switch} from "@heroui/react";

type FoodSiteLayerControlProps = {
  enabled: boolean;
  idPrefix: string;
  layer: AtlasFoodSitesLayerResponse;
  onChange: (enabled: boolean) => void;
};

type FoodSiteDetailsProps = {
  idPrefix: string;
  onClose: () => void;
  site: AtlasFoodSiteProperties;
  sourceUrl: string;
};

const SITE_TYPE_LABELS = {
  food_bank: "Food bank",
  food_pantry: "Food pantry",
  meal_program: "Meal program",
} as const;

export function FoodSiteLayerControl({
  enabled,
  idPrefix,
  layer,
  onChange,
}: FoodSiteLayerControlProps) {
  return (
    <section aria-labelledby={`${idPrefix}-food-sites-heading`} className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold" id={`${idPrefix}-food-sites-heading`}>
          Community food help
        </h2>
        <p className="text-xs leading-relaxed text-muted">
          This optional map layer is for finding places. It never changes a tract’s score or priority.
        </p>
      </div>
      {layer.state === "available" ? (
        <>
          <Switch isSelected={enabled} onChange={onChange}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              Show food pantries and meal sites
            </Switch.Content>
          </Switch>
          <div className="space-y-1 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs text-warning-soft-foreground">
            <p>
              <strong>Check before visiting.</strong> These {layer.source.featureCount} places are listed by the source, but we have not independently confirmed their current hours or services.
            </p>
            <p>
              Credit: {layer.source.attribution}.{" "}
              <Link
                aria-label="Open the original Milwaukee Food Environment Map in a new tab"
                href={layer.source.sourceUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                View original map
                <Link.Icon aria-hidden="true" />
              </Link>
            </p>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-divider bg-surface-secondary p-3 text-xs text-muted">
          Food-site locations are unavailable because the approved source snapshot could not be verified.
        </p>
      )}
    </section>
  );
}

export function FoodSiteDetails({
  idPrefix,
  onClose,
  site,
  sourceUrl,
}: FoodSiteDetailsProps) {
  return (
    <Card aria-labelledby={`${idPrefix}-food-site-name`} className="gap-3" variant="secondary">
      <Card.Header className="gap-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {SITE_TYPE_LABELS[site.siteType]}
            </p>
            <Card.Title id={`${idPrefix}-food-site-name`}>{site.name}</Card.Title>
          </div>
          <Button aria-label="Close food-site details" isIconOnly onPress={onClose} size="sm" variant="ghost">
            <span aria-hidden="true">×</span>
          </Button>
        </div>
        <Card.Description>
          {site.address}, {site.city}, WI {site.zipCode}
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-3 text-sm">
        <div className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-warning-soft-foreground">
          <strong>Check before visiting.</strong> This place is listed by the source, but its current hours and services have not been independently confirmed.
        </div>
        {site.details ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Source note</p>
            <p>{site.details}</p>
          </div>
        ) : null}
        {site.serviceArea ? (
          <p><strong>Service area listed by source:</strong> {site.serviceArea}</p>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {site.phone ? <Link href={`tel:${site.phone.replaceAll("-", "")}`}>Call {site.phone}</Link> : null}
          {site.website ? (
            <Link href={site.website} rel="noopener noreferrer" target="_blank">
              Provider website
              <Link.Icon aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </Card.Content>
      <Card.Footer className="block text-xs text-muted">
        Source: {" "}
        <Link href={sourceUrl} rel="noopener noreferrer" target="_blank">
          Milwaukee Food Environment Map
          <Link.Icon aria-hidden="true" />
        </Link>
        . This location does not affect the Atlas scores.
      </Card.Footer>
    </Card>
  );
}
