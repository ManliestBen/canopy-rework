import { QueryClient } from '@tanstack/react-query';

/**
 * Tuned for a 24/7 wall panel: keep last-good data on errors, retry with
 * backoff quietly, and never blank the screen because one poll failed.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 3,
      refetchOnWindowFocus: false,
      placeholderData: (prev: unknown) => prev,
    },
  },
});
