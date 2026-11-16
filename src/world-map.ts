import { mapBridgeDetails, mapTerrain } from './map-art';
import { mapHeight, mapRegions, mapRoad, mapRoadLength, mapRoadPose, mapStops, mapWidth } from './map-route';

export type WorldStop = { name: string; completed: boolean; locked: boolean; stars?: number };
export type WorldMapState = { current: number; destination: number; stops: readonly WorldStop[] };
type TripResult = 'arrived' | 'skipped' | 'cancelled';
type Trip = { frame: number; from: number; to: number; resolve: (result: TripResult) => void };

const truckArt = `<svg viewBox="0 0 54 30" aria-hidden="true">
  <path d="M9 4h32a11 11 0 0 1 11 11v2a11 11 0 0 1-11 11H9a7 7 0 0 1-7-7V11a7 7 0 0 1 7-7Z" fill="#253f34" opacity=".2"/>
  <g fill="#293c32"><rect x="8" y="1" width="9" height="5" rx="1.8"/><rect x="8" y="24" width="9" height="5" rx="1.8"/><rect x="37" y="1" width="8" height="5" rx="1.8"/><rect x="37" y="24" width="8" height="5" rx="1.8"/></g>
  <path d="M28 5h13c3 0 9 4 11 8v4c-2 4-8 8-11 8H28Z" stroke="#214537" stroke-width="1.5" fill="#518f73"/>
  <path d="M40 7q7 3 8 6v4q-2 4-8 6l2-6v-4Z" stroke="#345f52" stroke-width=".7" fill="#a7d1c3"/>
  <path d="M48 10l3 3m-3 7 3-3" fill="none" stroke="#ffdf91" stroke-width="2.2" stroke-linecap="round"/>
  <rect x="3" y="4" width="30" height="22" rx="3.5" stroke="#724f32" stroke-width="1.5" fill="#ebc386"/>
  <path d="M6 8h23v14H6Z" fill="#f6d89e" stroke="#a87e4d" stroke-width=".7"/>
  <path d="M15 8v14m8-14v14" stroke="#cd9c5e" stroke-width=".8"/>
  <rect x="8" y="12" width="6" height="4" fill="#fff1ca"/>
 </svg>`;

const roadGrain = Array.from({ length: Math.floor(mapRoadLength / 26) }, (_, index) => {
  const pose = mapRoadPose(index * 26 + 13);
  const angle = pose.angle * Math.PI / 180;
  const across = ((index * 11) % 19 - 9) * 1.25;
  const x = pose.x - Math.sin(angle) * across;
  const y = pose.y + Math.cos(angle) * across;
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${index % 4 === 0 ? 2 : 1.35}"/>`;
}).join('');

const escapeMapText = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] ?? char));

// The authored map starts at y=0. Display the start at the bottom of the sheet.
function displayMapY(y: number): number {
  return mapHeight - y;
}

function stopMarkup(stop: WorldStop, ordinal: number, current: number, destination: number): string {
  const { x, y, side } = mapStops[ordinal];
  const selected = ordinal === current;
  const next = ordinal === destination && !selected && !stop.locked;
  const status = stop.locked ? 'locked' : stop.completed ? 'complete' : selected ? 'current' : 'available';
  const description = stop.locked ? 'Locked' : next ? 'Destination' : selected ? 'Current delivery' : stop.completed ? 'Complete' : 'Ready to play';
  const rating = Math.max(0, Math.min(3, Number.isInteger(stop.stars) ? stop.stars! : 0));
  const ratingMarkup = rating ? `<span class="world-stop-stars" aria-hidden="true">${'★'.repeat(rating)}</span>` : '';
  const labelMarkup = selected || next ? `<span class="world-stop-label" aria-hidden="true"><strong>Level ${ordinal + 1}</strong><span>${escapeMapText(stop.name)}</span>${ratingMarkup}</span>` : '';
  return `<button class="world-stop ${side} ${status}${selected ? ' selected' : ''}${next ? ' next-stop' : ''}" type="button"
    data-world-stop="${ordinal}" ${stop.locked ? 'disabled' : ''} ${selected ? 'aria-current="step"' : ''}
    style="--map-x:${x / mapWidth * 100}%;--map-y:${displayMapY(y) / mapHeight * 100}%"
    title="${escapeMapText(stop.name)}" aria-label="Level ${ordinal + 1}, ${escapeMapText(stop.name)}, ${description}">
    <span class="world-stop-pin" aria-hidden="true">${ordinal + 1}<i>${status === 'complete' ? '✓' : ''}</i></span>
    ${labelMarkup}
   </button>`;
}

/** Owns map presentation and travel. The game decides which stops are unlocked or playable. */
export class WorldMap {
  private state: WorldMapState | null = null;
  private world: HTMLElement | null = null;
  private truck: HTMLElement | null = null;
  private routeHighlight: SVGPathElement | null = null;
  private trip: Trip | null = null;
  private travelled = 0;
  private distance = 0;
  private reverse = false;
  private paddingTop = 0;
  private resizeObserver?: ResizeObserver;

  constructor(
    private sheet: HTMLElement,
    private onSelect: (ordinal: number) => void,
    private reducedMotion: boolean,
  ) {
    sheet.tabIndex = 0;
    sheet.setAttribute('role', 'region');
    sheet.setAttribute('aria-label', 'Delivery route');
    sheet.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-world-stop]');
      if (!button || button.disabled || this.trip) return;
      const ordinal = Number(button.dataset.worldStop);
      if (this.state?.stops[ordinal]?.locked === false) this.onSelect(ordinal);
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.focusTruck());
    }
  }

  show(state: WorldMapState): void {
    this.cancelTrip();
    this.state = state;
    const firstPending = state.stops.findIndex(stop => !stop.completed);
    this.travelled = firstPending < 0 ? mapRoadLength : mapStops[firstPending - 1]?.distance ?? 0;
    this.sheet.innerHTML = `<div class="world-map-frame"><div class="world-map" style="--world-size:${mapWidth} / ${mapHeight};--world-min-height:${mapHeight * .82}px">
      <svg class="world-map-terrain" viewBox="0 0 ${mapWidth} ${mapHeight}" preserveAspectRatio="none" aria-hidden="true">
       <g transform="translate(0 ${mapHeight}) scale(1 -1)">
        ${mapTerrain()}
        <path class="world-main-road-shadow" d="${mapRoad}"/>
        <path class="world-main-road-edge" d="${mapRoad}"/>
        <path class="world-main-road" d="${mapRoad}"/>
        <path class="world-main-road-dirt" d="${mapRoad}"/>
        <path class="world-main-road-travelled" d="${mapRoad}" pathLength="${mapRoadLength}" stroke-dasharray="${this.travelled} ${mapRoadLength}"/>
        <g class="world-main-road-grain">${roadGrain}</g>
        ${mapBridgeDetails()}
       </g>
      </svg>
      ${mapRegions.map(({name, labelX, labelY}) => `<span class="world-map-place" style="--map-x:${labelX / mapWidth * 100}%;--map-y:${displayMapY(labelY) / mapHeight * 100}%">${escapeMapText(name)}</span>`).join('')}
      ${state.stops.slice(0, mapStops.length).map((stop, ordinal) => stopMarkup(stop, ordinal, state.current, state.destination)).join('')}
      <span class="world-map-truck" aria-hidden="true">${truckArt}</span>
     </div></div>`;
    this.resizeObserver?.disconnect();
    this.world = this.sheet.querySelector('.world-map');
    this.truck = this.sheet.querySelector('.world-map-truck');
    this.routeHighlight = this.sheet.querySelector('.world-main-road-travelled');
    if (this.world) {
      this.resizeObserver?.observe(this.world);
      this.resizeObserver?.observe(this.sheet);
    }
    this.distance = mapStops[state.current]?.distance ?? 0;
    this.reverse = false;
    this.focusTruck();
  }

  /** Give the camera enough room to center even the first and last stops. */
  focusTruck(): void {
    const height = this.world?.clientHeight ?? 0;
    const halfViewport = this.sheet.clientHeight / 2;
    if (!height || !halfViewport) return;
    const highestY = displayMapY(mapStops[mapStops.length - 1].y) / mapHeight * height;
    const lowestY = displayMapY(mapStops[0].y) / mapHeight * height;
    this.paddingTop = Math.max(0, Math.ceil(halfViewport - highestY));
    const paddingBottom = Math.max(0, Math.ceil(halfViewport - (height - lowestY)));
    this.sheet.style.setProperty('--map-pad-top', `${this.paddingTop}px`);
    this.sheet.style.setProperty('--map-pad-bottom', `${paddingBottom}px`);
    this.positionTruck(this.distance, this.reverse, true);
  }

  drive(from: number, to: number): Promise<TripResult> {
    this.cancelTrip();
    const start = mapStops[from]?.distance;
    const end = mapStops[to]?.distance;
    if (start === undefined || end === undefined) return Promise.resolve('cancelled');
    const reverse = end < start;
    if (this.reducedMotion || start === end || !this.world) {
      this.positionTruck(end, reverse, true);
      this.extendHighlight(end);
      return Promise.resolve('arrived');
    }

    this.positionTruck(start, reverse, true);
    this.sheet.classList.add('is-driving');
    const duration = Math.max(680, Math.min(1375, 430 + Math.abs(end - start) * 4));
    return new Promise(resolve => {
      const trip: Trip = { frame: 0, from: start, to: end, resolve };
      let startedAt: number | undefined;
      const tick = (time: number) => {
        if (this.trip !== trip) return;
        startedAt ??= time;
        const progress = Math.min(1, (time - startedAt) / duration);
        if (progress === 1) {
          this.finishTrip('arrived');
          return;
        }
        const eased = progress * progress * (3 - 2 * progress);
        const distance = start + (end - start) * eased;
        this.positionTruck(distance, reverse, true);
        this.extendHighlight(distance);
        trip.frame = requestAnimationFrame(tick);
      };
      this.trip = trip;
      trip.frame = requestAnimationFrame(tick);
    });
  }

  skipTrip(): void { this.finishTrip('skipped'); }
  cancelTrip(): void { this.finishTrip('cancelled'); }

  private finishTrip(result: TripResult): void {
    const trip = this.trip;
    if (!trip) return;
    this.trip = null;
    cancelAnimationFrame(trip.frame);
    this.sheet.classList.remove('is-driving');
    const cancelled = result === 'cancelled';
    this.positionTruck(cancelled ? trip.from : trip.to, !cancelled && trip.to < trip.from, !cancelled);
    this.extendHighlight(cancelled ? this.travelled : trip.to);
    trip.resolve(result);
  }

  private extendHighlight(distance: number): void {
    this.routeHighlight?.setAttribute('stroke-dasharray', `${Math.max(this.travelled, distance)} ${mapRoadLength}`);
  }

  private positionTruck(distance: number, reverse: boolean, follow = false): void {
    this.distance = distance;
    this.reverse = reverse;
    if (!this.world || !this.truck) return;
    const pose = mapRoadPose(distance);
    const width = this.world.clientWidth;
    const height = this.world.clientHeight;
    const x = pose.x / mapWidth * width;
    const y = displayMapY(pose.y) / mapHeight * height;
    const tangent = pose.angle * Math.PI / 180;
    const heading = Math.atan2(-Math.sin(tangent) * height / mapHeight, Math.cos(tangent) * width / mapWidth) * 180 / Math.PI;
    this.truck.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%) rotate(${heading + (reverse ? 180 : 0)}deg)`;
    if (follow && height) this.sheet.scrollTop = this.paddingTop + y - this.sheet.clientHeight / 2;
  }
}
