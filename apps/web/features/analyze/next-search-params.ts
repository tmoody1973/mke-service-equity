export type NextSearchParams = Record<string, string | Array<string> | undefined>;

export function toUrlSearchParams(searchParams: NextSearchParams): URLSearchParams {
  const result = new URLSearchParams();
  for (const [name, rawValue] of Object.entries(searchParams)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value !== undefined) {
        result.append(name, value);
      }
    }
  }
  return result;
}
