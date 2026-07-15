import { Link } from 'react-router-dom';
import { useWeather } from './api';
import './weather.css';

/** Header chip: current temp + icon; red dot when an alert is active. */
export function WeatherChip() {
  const { data: weather } = useWeather();
  if (!weather?.current) return null;
  return (
    <Link to="/weather" className="weather-chip" aria-label="Weather forecast">
      <span>{weather.current.emoji}</span>
      <span>{weather.current.temp}°</span>
      {weather.alerts.length > 0 && <span className="weather-chip-alert" />}
    </Link>
  );
}
