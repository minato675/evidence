export type NumericRange = { min: string; max: string };
export function materialValueBounds(value: string): { min: number; max: number } | null;
export function matchesMaterialValueRange(value: string, range: NumericRange): boolean;
