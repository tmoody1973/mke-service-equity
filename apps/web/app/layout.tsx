import type {Metadata} from "next";
import type {ReactNode} from "react";

import "./globals.css";

const directionContract =
  "<!-- THESIS: Evidence leads in a restrained civic workspace that refuses the category-default wall of dashboard cards. OWN-WORLD: HeroUI Pro Operate mode, quiet civic neutrals, semantic project tokens, no invented decoration. STORY: Enter Atlas, orient through one primary navigation, inspect the map workspace, retain a plain-language data state. FIRST VIEWPORT: One header, one responsive Sidebar, one dominant map region, one concise status. FORM: Operate mode, first-ranked approved form; seed mke-plan1-heroui-operate; high legibility, WCAG 2.2 AA focus and touch targets, responsive access, reduced-motion-safe components. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->";

export const metadata: Metadata = {
  description: "Explore how food access and community conditions vary across Milwaukee County.",
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
