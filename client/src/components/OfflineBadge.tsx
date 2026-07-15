import { useQuery } from '@tanstack/react-query';
import { HealthSchema } from '@canopy/shared';
import { apiGet } from '../lib/api';

/**
 * Quiet health probe. When the server (or network) is unreachable the
 * badge appears; all data on screen is last-good cache, so the panel
 * keeps working — this just says why nothing is updating.
 */
export function OfflineBadge() {
  const { isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet(HealthSchema, '/api/health'),
    refetchInterval: 30_000,
    retry: 1,
  });

  if (!isError) return null;
  return (
    <span className="offline-badge" title="Showing saved information">
      ⚠ Offline
    </span>
  );
}
