/** Helpers for reading normalized Express request header values. */

export function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}
