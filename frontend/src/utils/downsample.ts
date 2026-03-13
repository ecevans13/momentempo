/**
 * Step-based downsampling: sample `target` evenly-spaced points from the
 * input array, always including the last point.
 */
export function downsample(points: [number, number][], target: number): [number, number][] {
  if (points.length <= target) return points;
  const step = points.length / target;
  const result: [number, number][] = [];
  for (let i = 0; i < target; i++) {
    result.push(points[Math.floor(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}

/**
 * Downsample multiple parallel arrays in sync, preserving index alignment.
 * Useful for keeping latlng and velocity arrays aligned after sampling.
 * All arrays must have the same length.
 */
export function downsampleParallel<T>(arrays: T[][], target: number): T[][] {
  if (arrays.length === 0 || arrays[0].length <= target) return arrays;
  const step = arrays[0].length / target;
  const indices: number[] = [];
  for (let i = 0; i < target; i++) indices.push(Math.floor(i * step));
  indices.push(arrays[0].length - 1);
  return arrays.map((arr) => indices.map((idx) => arr[idx]));
}
