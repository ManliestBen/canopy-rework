import { addDaysToKey, formatTime, todayKey } from '@canopy/shared';
import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useNow } from '../../hooks/useNow';
import { useSettings } from '../../theme/ThemeProvider';
import { useEventsRange } from '../calendar/api';
import { useWeather } from '../weather/api';
import { usePhotos } from './api';
import { STARTER_PHOTOS } from './starterPhotos';
import './screensaver.css';

/**
 * Full-screen slideshow with crossfade and glanceable overlay widgets
 * (clock, date, next event, weather) — the panel stays useful asleep.
 * Any tap wakes it (parent handles dismissal via onWake).
 */
export function Slideshow({ onWake, dim }: { onWake: () => void; dim?: boolean }) {
  const settings = useSettings();
  const { data } = usePhotos();
  const photos = useMemo(
    () => (data && data.photos.length > 0 ? data.photos : STARTER_PHOTOS),
    [data],
  );

  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Crossfade: toggle visibility, then advance while hidden.
  useEffect(() => {
    if (dim || photos.length < 2) return;
    const interval = setInterval(
      () => {
        setVisible(false);
        setTimeout(() => {
          setIndex((i) => (i + 1) % photos.length);
          setVisible(true);
        }, 900);
      },
      Math.max(5, settings.slideshowIntervalSeconds) * 1000,
    );
    return () => clearInterval(interval);
  }, [photos.length, settings.slideshowIntervalSeconds, dim]);

  const nextPhoto = photos[(index + 1) % photos.length];

  return (
    <div className={`screensaver${dim ? ' dim' : ''}`} onPointerDown={onWake}>
      {!dim && (
        <>
          <img className={`screensaver-img${visible ? ' visible' : ''}`} src={photos[index]?.url} alt="" />
          {/* Preload the next photo invisibly. */}
          {nextPhoto && <link rel="preload" as="image" href={nextPhoto.url} />}
          <div className="screensaver-scrim" />
        </>
      )}
      <OverlayWidgets />
    </div>
  );
}

function OverlayWidgets() {
  const now = useNow();
  const { data: weather } = useWeather();
  const today = todayKey();
  const { data: eventsData } = useEventsRange(today, addDaysToKey(today, 1));

  const nextEvent = useMemo(() => {
    const nowIso = new Date().toISOString();
    return (eventsData?.events ?? [])
      .filter((e) => !e.allDay && e.start > nowIso)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
  }, [eventsData]);

  return (
    <div className="screensaver-widgets">
      <div className="screensaver-clock">{format(now, 'h:mm')}</div>
      <div className="screensaver-date">{format(now, 'EEEE, MMMM d')}</div>
      <div className="screensaver-row">
        {weather?.current && (
          <span>
            {weather.current.emoji} {weather.current.temp}°
          </span>
        )}
        {nextEvent && (
          <span>
            Next: {nextEvent.title} · {formatTime(nextEvent.start)}
          </span>
        )}
      </div>
    </div>
  );
}
