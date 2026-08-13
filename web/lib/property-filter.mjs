export function materialValueBounds(value) {
  const normalized = String(value).replace(/,/g, "").replace(/[−﹣－]/g, "-").replace(/(\d)\s*[-–—~]\s*(?=\d)/g, "$1 ");
  const values = (normalized.match(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
}

export function matchesMaterialValueRange(value, range) {
  if (!range.min && !range.max) return true;
  const bounds = materialValueBounds(value);
  if (!bounds) return false;
  const requestedMin = range.min === "" ? Number.NEGATIVE_INFINITY : Number(range.min);
  const requestedMax = range.max === "" ? Number.POSITIVE_INFINITY : Number(range.max);
  const lower = Math.min(requestedMin, requestedMax);
  const upper = Math.max(requestedMin, requestedMax);
  return bounds.max >= lower && bounds.min <= upper;
}
