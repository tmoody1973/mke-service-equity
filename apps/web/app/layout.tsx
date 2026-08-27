import type {Metadata} from "next";
import type {ReactNode} from "react";

import "./globals.css";

const directionContract =
  "<!-- THESIS: A restrained public-sector decision workspace where evidence leads. OWN-WORLD: HeroUI Pro Operate mode, quiet civic neutrals, semantic project tokens, no invented decoration. STORY: Enter Atlas, orient through one primary navigation, inspect the map workspace, retain a plain-language data state. FIRST VIEWPORT: One header, one responsive Sidebar, one dominant map region, one concise status. FORM: High legibility, WCAG 2.2 AA focus and touch targets, responsive access, reduced-motion-safe components. FINISH: mke-plan1-heroui-operate -->";

export const metadata: Metadata = {
  description: "A transparent public decision-support platform for Milwaukee service equity.",
  title: "MKE Service Equity",
};

export default function RootLayout({children}: Readonly<{children: ReactNode}>) {
  return (
    <html lang="en">
      <body>
        <template
          data-direction-contract="operate"
          dangerouslySetInnerHTML={{__html: directionContract}}
        />
        {children}
      </body>
    </html>
  );
}
