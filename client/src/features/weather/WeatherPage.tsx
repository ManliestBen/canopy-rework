import { formatKey, todayKey } from '@canopy/shared';
import { Link } from 'react-router-dom';
import { useSettings } from '../../theme/ThemeProvider';
import { useWeather } from './api';
import './weather.css';

export function WeatherPage() {
  const { data: weather } = useWeather();
  const settings = useSettings();

  if (!weather?.configured) {
    return (
      <div>
        <h1 className="page-title">Weather</h1>
        <div className="panel cal-empty">
          <p style={{ fontSize: '2rem', margin: 0 }}>🌤️</p>
          <p className="muted">
            Weather needs an OpenWeatherMap API key on the server
            (OPENWEATHERMAP_API_KEY). See the setup guide.
          </p>
        </div>
      </div>
    );
  }

  if (!settings.locationQuery) {
    return (
      <div>
        <h1 className="page-title">Weather</h1>
        <div className="panel cal-empty">
          <p style={{ fontSize: '2rem', margin: 0 }}>📍</p>
          <p className="muted">Set your location to see the forecast.</p>
          <Link className="btn btn-primary" to="/settings">
            Open Settings
          </Link>
        </div>
      </div>
    );
  }

  const today = todayKey();

  return (
    <div>
      <h1 className="page-title">
        Weather{weather.location ? ` · ${weather.location.name}` : ''}
      </h1>

      {weather.alerts.map((alert) => (
        <div key={alert.event + alert.start} className="weather-alert">
          <b>⚠️ {alert.event}</b>
          <span className="muted">
            until {new Date(alert.end).toLocaleString([], { weekday: 'short', hour: 'numeric' })}
          </span>
          <p className="weather-alert-desc">{alert.description}</p>
        </div>
      ))}

      {weather.error && !weather.current && (
        <div className="cal-warning">⚠️ {weather.error}</div>
      )}

      {weather.current && (
        <div className="panel weather-now">
          <span className="weather-now-emoji">{weather.current.emoji}</span>
          <div>
            <div className="weather-now-temp">{weather.current.temp}°</div>
            <div className="weather-now-desc">{weather.current.description}</div>
          </div>
          <div className="weather-now-meta">
            <span>Feels like {weather.current.feelsLike}°</span>
            <span>💧 {weather.current.humidity}%</span>
            <span>💨 {weather.current.windMph} mph</span>
          </div>
        </div>
      )}

      <div className="weather-days">
        {weather.daily.map((day) => (
          <div key={day.dateKey} className="panel weather-day">
            <div className="weather-day-name">
              {day.dateKey === today ? 'Today' : formatKey(day.dateKey, 'EEE')}
            </div>
            <div className="weather-day-emoji">{day.emoji}</div>
            <div className="weather-day-temps">
              <b>{day.max}°</b>
              <span className="muted">{day.min}°</span>
            </div>
            {day.pop >= 0.2 && (
              <div className="weather-day-pop">💧 {Math.round(day.pop * 100)}%</div>
            )}
          </div>
        ))}
      </div>

      {weather.fetchedAt && (
        <p className="muted" style={{ marginTop: 12 }}>
          Updated{' '}
          {new Date(weather.fetchedAt).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      )}
    </div>
  );
}
