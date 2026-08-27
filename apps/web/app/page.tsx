import {ApplicationShell} from "../components/application-shell/application-shell";

export default function AtlasPage() {
  return (
    <ApplicationShell>
      <section
        aria-labelledby="atlas-heading"
        className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-6 py-10 min-[768px]:min-h-[calc(100dvh-4rem)]"
      >
        <div className="max-w-[70ch] text-center">
          <h1 className="text-foreground text-xl font-semibold tracking-[-0.02em]" id="atlas-heading">
            Food Equity Atlas
          </h1>
          <p className="text-muted mt-2 text-sm">
            The verified, data-free map foundation is being prepared.
          </p>
        </div>
      </section>
    </ApplicationShell>
  );
}
