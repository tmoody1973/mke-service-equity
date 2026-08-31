import {
  compareRequestSchema,
  compareUrlStateSchema,
  type CompareRequest,
  type CompareUrlState,
} from "@mke/contracts";

type SearchParamsReader = {
  getAll(name: string): Array<string>;
  toString(): string;
};

type CompareUrlBase = {
  canonicalSearchParams: URLSearchParams;
  needsCanonicalization: boolean;
};

export type CompareUrlParseResult = CompareUrlBase & (
  | {
    state: "setup";
    reason: "no_tracts" | "needs_one_more";
    value: CompareUrlState;
  }
  | {
    state: "ready";
    value: CompareRequest;
  }
  | {
    state: "invalid";
    reason: "invalid_tract" | "duplicate_tract" | "too_many_tracts";
  }
);

export function buildCompareSearchParams(
  current: SearchParamsReader,
  stateInput: unknown,
): URLSearchParams {
  const state = compareUrlStateSchema.safeParse(stateInput);
  if (!state.success) {
    throw new Error("Invalid Compare URL state");
  }

  const next = new URLSearchParams(current.toString());
  next.delete("tract");
  for (const tract of state.data.tracts) {
    next.append("tract", tract);
  }
  return next;
}

function invalidResult(
  searchParams: SearchParamsReader,
  reason: Extract<CompareUrlParseResult, {state: "invalid"}>["reason"],
): CompareUrlParseResult {
  const canonicalSearchParams = buildCompareSearchParams(searchParams, {tracts: []});
  return {
    state: "invalid",
    reason,
    canonicalSearchParams,
    needsCanonicalization: canonicalSearchParams.toString() !== searchParams.toString(),
  };
}

export function parseCompareUrlState(
  searchParams: SearchParamsReader,
): CompareUrlParseResult {
  const tracts = searchParams.getAll("tract");
  if (tracts.length > 5) {
    return invalidResult(searchParams, "too_many_tracts");
  }

  const urlState = compareUrlStateSchema.safeParse({tracts});
  if (!urlState.success) {
    const allTractsValid = tracts.every((tract) => /^\d{11}$/.test(tract));
    return invalidResult(
      searchParams,
      allTractsValid ? "duplicate_tract" : "invalid_tract",
    );
  }

  const canonicalSearchParams = buildCompareSearchParams(searchParams, urlState.data);
  const base = {
    canonicalSearchParams,
    needsCanonicalization: canonicalSearchParams.toString() !== searchParams.toString(),
  };
  if (urlState.data.tracts.length < 2) {
    return {
      ...base,
      state: "setup",
      reason: urlState.data.tracts.length === 0 ? "no_tracts" : "needs_one_more",
      value: urlState.data,
    };
  }

  const request = compareRequestSchema.parse(urlState.data);
  return {...base, state: "ready", value: request};
}

export function compareHref(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
