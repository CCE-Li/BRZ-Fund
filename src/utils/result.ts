export interface VResult<T> {
  ok: boolean;
  value: T | null;
  errors: string[];
}

export function valid<T>(value: T): VResult<T> {
  return { ok: true, value, errors: [] };
}

export function invalid<T>(errors: string[]): VResult<T> {
  return { ok: false, value: null, errors };
}

export function collectErrors(results: ReadonlyArray<VResult<unknown>>): string[] {
  return results.flatMap((result) => result.errors);
}

export function allValid(results: ReadonlyArray<VResult<unknown>>): boolean {
  return results.every((result) => result.ok);
}
