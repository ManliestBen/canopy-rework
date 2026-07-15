import { instantToLocal, type CalendarEvent, type DateKey } from '@canopy/shared';

/** A timed event positioned inside one day column of the time grid. */
export type PositionedEvent = {
  event: CalendarEvent;
  /** Minutes from midnight, clamped to this day. */
  startMin: number;
  endMin: number;
  /** Horizontal lane when events overlap (0-based) and lane count. */
  lane: number;
  lanes: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

const MIN_BLOCK_MINUTES = 30; // short events still get a tappable block

/**
 * Position the timed events of one day, splitting multi-day events at
 * midnight (the segment on each day renders with continuation marks).
 */
export function layoutDay(events: CalendarEvent[], dayKey: DateKey): PositionedEvent[] {
  const segments = events
    .filter((e) => !e.allDay && e.startKey <= dayKey && e.endKey >= dayKey)
    .map((event) => {
      const s = instantToLocal(event.start);
      const e = instantToLocal(event.end);
      const startMin = s.dateKey === dayKey ? s.minutes : 0;
      let endMin = e.dateKey === dayKey ? e.minutes : 24 * 60;
      // An end at exactly 00:00 belongs to the previous day.
      if (e.dateKey === dayKey && e.minutes === 0 && s.dateKey !== dayKey) return null;
      endMin = Math.max(endMin, startMin + MIN_BLOCK_MINUTES);
      return {
        event,
        startMin,
        endMin: Math.min(endMin, 24 * 60),
        lane: 0,
        lanes: 1,
        continuesBefore: s.dateKey !== dayKey,
        continuesAfter: e.dateKey !== dayKey && !(e.dateKey === dayKey && e.minutes === 0),
      };
    })
    .filter((x): x is PositionedEvent => x !== null)
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // Greedy lane assignment within overlap clusters.
  let cluster: PositionedEvent[] = [];
  let clusterEnd = -1;
  const finishCluster = () => {
    const laneEnds: number[] = [];
    for (const seg of cluster) {
      let lane = laneEnds.findIndex((end) => end <= seg.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = seg.endMin;
      seg.lane = lane;
    }
    for (const seg of cluster) seg.lanes = laneEnds.length;
    cluster = [];
  };
  for (const seg of segments) {
    if (cluster.length > 0 && seg.startMin >= clusterEnd) finishCluster();
    cluster.push(seg);
    clusterEnd = Math.max(clusterEnd, seg.endMin);
  }
  finishCluster();
  return segments;
}

/** A banner (all-day/multi-day) spanning columns in a week strip. */
export type BannerPlacement = {
  event: CalendarEvent;
  /** Column indexes within the visible days (inclusive). */
  startCol: number;
  endCol: number;
  row: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

/** Events that belong in the banner lane rather than the time grid. */
export function isBanner(event: CalendarEvent): boolean {
  return event.allDay || event.startKey !== event.endKey;
}

/**
 * Pack banners into rows across a run of visible days (Skylight's
 * "Camping Trip" bars). Greedy first-fit keeps rows compact.
 */
export function layoutBanners(events: CalendarEvent[], days: DateKey[]): BannerPlacement[] {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return [];

  const placements = events
    .filter(isBanner)
    .filter((e) => e.endKey >= first && e.startKey <= last)
    .sort((a, b) => a.startKey.localeCompare(b.startKey) || b.endKey.localeCompare(a.endKey))
    .map((event) => ({
      event,
      startCol: event.startKey < first ? 0 : days.indexOf(event.startKey),
      endCol: event.endKey > last ? days.length - 1 : days.indexOf(event.endKey),
      row: 0,
      clippedStart: event.startKey < first,
      clippedEnd: event.endKey > last,
    }));

  const rowEnds: number[] = []; // last occupied column per row
  for (const p of placements) {
    let row = rowEnds.findIndex((end) => end < p.startCol);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(-1);
    }
    rowEnds[row] = p.endCol;
    p.row = row;
  }
  return placements;
}
