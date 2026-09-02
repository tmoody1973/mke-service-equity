"use client";

import {Accordion, Card} from "@heroui/react";
import {
  tractEvidenceColumnRegistry,
  type TractEvidenceExportAvailability,
} from "@mke/contracts";

type DataPageProps = {
  availability: TractEvidenceExportAvailability;
};

const groups = [
  ["tract", "Tract basics"],
  ["neighborhood", "City neighborhood reference"],
  ["equity_indicator", "Equity Baseline measures"],
  ["equity_result", "Equity Baseline results"],
  ["food_metric", "Food Access measures"],
  ["food_result", "Food Equity results"],
  ["release", "Release and source details"],
] as const;

function unavailableMessage(reason: Exclude<TractEvidenceExportAvailability, {state: "available"}>["reason"]): string {
  switch (reason) {
    case "no_published_run":
      return "No public data file is available yet. The Atlas will offer a file after a complete, approved public release is available.";
    case "preview_not_allowed":
      return "This data is being checked privately. It is not available for public download yet.";
    case "data_incomplete":
      return "A public file is not available because the release did not pass all of its consistency checks.";
    default:
      return "The data download is temporarily unavailable. Please try again later.";
  }
}

function formatPublicationDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function DataPage({availability}: DataPageProps) {
  const isAvailable = availability.state === "available";
  const dictionaryGroups = groups.map(([group, label]) => ({
    group,
    label,
    columns: tractEvidenceColumnRegistry.filter((column) => column.group === group),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold text-accent">MKE Service Equity</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Download data
        </h1>
        <p className="text-base leading-7 text-muted sm:text-lg">
          This file has the complete public dataset behind the map: all 302 Milwaukee County Census
          tracts, not just the area you are looking at right now.
        </p>
      </div>

      <Card className="mt-6 w-full" variant={isAvailable ? "secondary" : "default"}>
        <Card.Header>
          <Card.Title>{isAvailable ? "The public tract data file is ready" : "The public tract data file is not ready"}</Card.Title>
          <Card.Description>
            {isAvailable
              ? `Published ${formatPublicationDate(availability.publication.publishedAt)}. This file has ${availability.tractCount} Census tracts.`
              : unavailableMessage(availability.reason)}
          </Card.Description>
        </Card.Header>
        {isAvailable ? (
          <Card.Footer className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted">
              Publication ID: <span className="break-all font-mono text-xs text-foreground">{availability.publication.id}</span>
            </p>
            <a
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground no-underline outline-none transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:w-auto"
              href="/api/exports/tract-evidence.csv"
            >
              Download all tract data (CSV)
            </a>
          </Card.Footer>
        ) : null}
      </Card>

      <section aria-labelledby="using-the-file" className="mt-8 max-w-4xl">
        <h2 className="text-2xl font-semibold text-foreground" id="using-the-file">How to use this file</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Card variant="default">
            <Card.Header>
              <Card.Title>Read missing values carefully</Card.Title>
              <Card.Description>Missing is not the same as zero. Empty number cells come with a state that explains why.</Card.Description>
            </Card.Header>
          </Card>
          <Card variant="default">
            <Card.Header>
              <Card.Title>Use uncertainty</Card.Title>
              <Card.Description>Margins of error and confidence ranges show how much an estimate may vary.</Card.Description>
            </Card.Header>
          </Card>
          <Card variant="default">
            <Card.Header>
              <Card.Title>Do not force a neighborhood</Card.Title>
              <Card.Description>Neighborhood names describe area overlap, not where every resident lives or one official tract label.</Card.Description>
            </Card.Header>
          </Card>
        </div>
      </section>

      <section aria-labelledby="file-limits" className="mt-10 max-w-4xl">
        <h2 className="text-2xl font-semibold text-foreground" id="file-limits">What is and is not in the file</h2>
        <p className="mt-3 leading-7 text-muted">
          The file includes tract-level scores, the measures behind them, quality information, and
          publication details. It does not include personal information, map shapes, exact
          coordinates, food-site records, emergency-food records, public-investment data, or ZIP-code guesses.
        </p>
        <p className="mt-3 leading-7 text-muted">
          Food Equity Priority is a signal for where to look more closely. It is not a decision
          about funding, policy, or any individual person.
        </p>
      </section>

      <section aria-labelledby="column-dictionary" className="mt-10">
        <h2 className="text-2xl font-semibold text-foreground" id="column-dictionary">What each column means</h2>
        <p className="mt-2 max-w-3xl leading-7 text-muted">
          The column names stay the same every time. Open a section to see the plain-language
          meaning of every field in the download.
        </p>
        <Accordion allowsMultipleExpanded className="mt-4 w-full" variant="surface">
          {dictionaryGroups.map(({group, label, columns}) => (
            <Accordion.Item id={group} key={group}>
              <Accordion.Heading>
                <Accordion.Trigger>
                  <span>{label} ({columns.length})</span>
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>
                  <dl className="space-y-4">
                    {columns.map((column) => (
                      <div key={column.id}>
                        <dt className="font-mono text-sm font-semibold text-foreground">{column.id}</dt>
                        <dd className="mt-1 text-sm leading-6 text-muted">{column.definition}</dd>
                      </div>
                    ))}
                  </dl>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </section>

      <section aria-labelledby="learn-more" className="mt-10 max-w-4xl pb-4">
        <h2 className="text-2xl font-semibold text-foreground" id="learn-more">Learn more</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          <li><a className="underline underline-offset-4" href="https://github.com/tmoody1973/mke-service-equity/blob/main/docs/methodology/scoring-governance.md">How scores and priorities are governed</a></li>
          <li><a className="underline underline-offset-4" href="https://github.com/tmoody1973/mke-service-equity/blob/main/docs/data/source-registry.md">Sources, credit, and data limitations</a></li>
          <li><a className="underline underline-offset-4" href="https://github.com/tmoody1973/mke-service-equity/blob/main/docs/data/data-quality.md">Data quality and uncertainty</a></li>
        </ul>
      </section>
    </div>
  );
}
