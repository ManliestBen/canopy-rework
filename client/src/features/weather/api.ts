import { useQuery } from '@tanstack/react-query';
import { WeatherSchema } from '@canopy/shared';
import { apiGet } from '../../lib/api';

export function useWeather() {
  return useQuery({
    queryKey: ['weather'],
    queryFn: () => apiGet(WeatherSchema, '/api/weather'),
    refetchInterval: 5 * 60_000,
  });
}
