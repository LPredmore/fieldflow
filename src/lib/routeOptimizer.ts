// Pure-TS nearest-neighbor + 2-opt route optimizer.
// Input: drive-time matrix in minutes (NxN), index 0 = start (home base or first stop).
// Output: ordered indices (excluding start) that minimize total drive minutes.
export type Matrix = (number | null)[][];

function tourCost(order: number[], m: Matrix): number {
  let cost = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const v = m[order[i]]?.[order[i + 1]];
    cost += v ?? 9999;
  }
  return cost;
}

function nearestNeighbor(m: Matrix, start: number): number[] {
  const n = m.length;
  const visited = new Set<number>([start]);
  const tour = [start];
  let cur = start;
  while (visited.size < n) {
    let best = -1;
    let bestCost = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      const c = m[cur]?.[j] ?? Infinity;
      if (c < bestCost) {
        bestCost = c;
        best = j;
      }
    }
    if (best === -1) break;
    tour.push(best);
    visited.add(best);
    cur = best;
  }
  return tour;
}

function twoOpt(tour: number[], m: Matrix): number[] {
  let improved = true;
  let best = tour.slice();
  let bestCost = tourCost(best, m);
  // Skip swap on index 0 (the start) — we keep start fixed.
  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 2; i++) {
      for (let k = i + 1; k < best.length - 1; k++) {
        const next = best
          .slice(0, i)
          .concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const c = tourCost(next, m);
        if (c + 0.0001 < bestCost) {
          best = next;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return best;
}

export interface OptimizeResult {
  /** Ordered indices into the input matrix (start included at position 0). */
  order: number[];
  totalDriveMinutes: number;
}

export function optimizeRoute(matrix: Matrix, startIndex = 0): OptimizeResult {
  if (matrix.length <= 2) {
    const order = matrix.length === 0 ? [] : Array.from(matrix.keys());
    return { order, totalDriveMinutes: tourCost(order, matrix) };
  }
  const nn = nearestNeighbor(matrix, startIndex);
  const polished = twoOpt(nn, matrix);
  return { order: polished, totalDriveMinutes: tourCost(polished, matrix) };
}
