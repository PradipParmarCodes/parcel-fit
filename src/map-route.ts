export const mapWidth = 620;
export const mapHeight = 4160;

const regionBoundaries = [0, 412, 835, 1248, 1648, 2078, 2485, 2893, 3318, 3725, mapHeight];
const towns = [
  { name: 'Maple Depot', labelX: 426, labelY: 87 },
  { name: 'Cloverhill', labelX: 464, labelY: 519 },
  { name: 'Brineport', labelX: 171, labelY: 917 },
  { name: 'Sunfield', labelX: 452, labelY: 1381 },
  { name: 'Alder Pass', labelX: 181, labelY: 1763 },
  { name: 'Moonmere', labelX: 171, labelY: 2177 },
  { name: 'Bell School', labelX: 449, labelY: 2571 },
  { name: 'Bramley', labelX: 171, labelY: 3011 },
  { name: 'Willow Lock', labelX: 444, labelY: 3400 },
  { name: 'Beacon Bay', labelX: 498, labelY: 3890 },
];

export const mapRegions = towns.map((town, index) => ({
  ...town,
  y: regionBoundaries[index],
  height: regionBoundaries[index + 1] - regionBoundaries[index],
}));

// The highway runs south through the valley. Each waypoint is [east, south].
const waypoints = [
  [140, 30], [169, 104], [177, 192], [297, 278], [350, 354], [340, 422],
  [219, 490], [157, 576], [191, 660], [301, 725], [447, 804], [460, 887],
  [431, 978], [344, 1062], [248, 1122], [195, 1202], [238, 1297],
  [197, 1380], [156, 1457], [263, 1541], [393, 1628], [455, 1749],
  [401, 1839], [279, 1918], [300, 1979], [404, 2057], [451, 2162],
  [421, 2264], [347, 2333], [218, 2408], [152, 2487], [165, 2581],
  [278, 2690], [372, 2776], [450, 2862], [457, 2971], [402, 3075],
  [254, 3148], [179, 3260], [198, 3342], [171, 3430], [225, 3544],
  [370, 3637], [444, 3714], [378, 3790], [287, 3850], [204, 3927],
  [242, 3993], [365, 4067], [438, 4134],
] as const;

function slopeAt(index: number): number {
  const [ax, ay] = waypoints[Math.max(0, index - 1)];
  const [bx, by] = waypoints[Math.min(waypoints.length - 1, index + 1)];
  return (bx - ax) / (by - ay);
}

const segments = waypoints.slice(1).map(([x1, y1], i) => {
  const [x0, y0] = waypoints[i];
  const rise = (y1 - y0) / 3;
  return { x0, y0, x1, y1, ax: x0 + slopeAt(i) * rise, bx: x1 - slopeAt(i + 1) * rise };
});

export const mapRoad = `M${waypoints[0].join(' ')}${segments.map(({ y0, x1, y1, ax, bx }) => {
  const rise = (y1 - y0) / 3;
  return `C${ax} ${y0 + rise} ${bx} ${y1 - rise} ${x1} ${y1}`;
}).join('')}`;

function curvePose(segmentIndex: number, t: number) {
  const { x0, y0, x1, y1, ax, bx } = segments[segmentIndex];
  const u = 1 - t;
  const x = u ** 3 * x0 + 3 * u ** 2 * t * ax + 3 * u * t ** 2 * bx + t ** 3 * x1;
  const tangentX = 3 * (u ** 2 * (ax - x0) + 2 * u * t * (bx - ax) + t ** 2 * (x1 - bx));
  const tangentY = y1 - y0;
  return { x, y: y0 + tangentY * t, angle: Math.atan2(tangentY, tangentX) * 180 / Math.PI };
}

// Sample arc length once. Rendering and motion both use the same Bézier segments.
const samples = [{ ...curvePose(0, 0), segment: 0, t: 0, distance: 0 }];
for (const [segment, { y0, y1 }] of segments.entries()) {
  const steps = Math.ceil((y1 - y0) / .8);
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const pose = curvePose(segment, t);
    const previous = samples[samples.length - 1];
    const distance = previous.distance + Math.hypot(pose.x - previous.x, pose.y - previous.y);
    samples.push({ ...pose, segment, t, distance });
  }
}

export const mapRoadLength = samples[samples.length - 1].distance;

function searchSamples(value: number, key: 'distance' | 'y'): [number, number] {
  let low = 0, high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle][key] < value) low = middle;
    else high = middle;
  }
  return [low, high];
}

/** Sample the road in travel order, with an undistorted heading in degrees. */
export function mapRoadPose(distance: number) {
  const along = Math.max(0, Math.min(mapRoadLength, Number.isNaN(distance) ? 0 : distance));
  const [low, high] = searchSamples(along, 'distance');
  const before = samples[low], after = samples[high];
  const fraction = (along - before.distance) / (after.distance - before.distance);
  const start = before.segment === after.segment ? before.t : 0;
  return curvePose(after.segment, start + (after.t - start) * fraction);
}

export function mapDistanceAtY(y: number): number {
  const along = Math.max(waypoints[0][1], Math.min(waypoints[waypoints.length - 1][1], Number.isNaN(y) ? 0 : y));
  const [low, high] = searchSamples(along, 'y');
  const before = samples[low], after = samples[high];
  return before.distance + (after.distance - before.distance) * (along - before.y) / (after.y - before.y);
}

const stopOffsets = [67, 128, 191, 252, 315, 377];
export const mapStops = mapRegions.flatMap(({ y: north }) => stopOffsets.map(offset => {
  const distance = mapDistanceAtY(north + offset);
  const { x, y } = mapRoadPose(distance);
  return { x, y, distance, side: x > mapWidth / 2 ? 'left' as const : 'right' as const };
}));
