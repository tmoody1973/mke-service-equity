"use client";

import type {CompareAvailableResponse} from "@mke/contracts";

import {buildComparisonSummaryRows} from "./comparison-presentation";
import {ComparisonValue} from "./comparison-value";

export function ComparisonMatrix({comparison}: {comparison: CompareAvailableResponse}) {
  const rows = buildComparisonSummaryRows(comparison);

  return (
    <div className="overflow-hidden rounded-[var(--mke-radius-panel)] border border-divider bg-background">
      <table aria-label="Comparison summary" className="w-full table-fixed border-collapse">
        <thead className="bg-default text-left">
          <tr>
            <th className="w-[18%] p-3 text-sm font-semibold" scope="col">Measure</th>
            {comparison.tracts.map(({tract}) => (
              <th className="p-3 align-top" key={tract.geoid} scope="col">
                <span className="block text-sm font-semibold">{tract.name}</span>
                <span className="mt-1 block text-xs font-normal text-muted">
                  Census tract ID {tract.geoid}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-divider" key={row.id}>
              <th className="p-3 text-left align-top text-sm font-medium" scope="row">
                {row.label}
              </th>
                {row.cells.map((cell) => (
                  <td className="p-3 align-top" key={cell.tractGeoid}>
                    <ComparisonValue cell={cell} />
                  </td>
                ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
