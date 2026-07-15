import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@canopy/shared';
import { App } from './App';
import { ThemeProvider } from '../theme/ThemeProvider';

function renderApp(route = '/') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/users')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/api/auth/status')) {
        return new Response(
          JSON.stringify({ isPanel: true, authenticated: false, hasPin: false }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ ...DEFAULT_SETTINGS, onboarded: true }),
        { status: 200 },
      );
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('App shell', () => {
  it('renders the rail with all eight sections once settings load', async () => {
    renderApp();
    expect(await screen.findByRole('link', { name: 'Calendar' })).toBeInTheDocument();
    for (const label of [
      'Chores',
      'Rewards',
      'Meals',
      'Photos',
      'Lists',
      'Sleep',
      'Settings',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('shows the clock and default family name in the header', async () => {
    renderApp();
    expect(await screen.findByText('Our Family')).toBeInTheDocument();
    // Clock renders a h:mm a time.
    expect(screen.getByText(/^\d{1,2}:\d{2} (AM|PM)$/)).toBeInTheDocument();
  });

  it('redirects unknown routes to the calendar', async () => {
    renderApp('/nowhere');
    expect(await screen.findByText(/Calendar is growing/i)).toBeInTheDocument();
  });

  it('shows onboarding before setup is complete', () => {
    renderApp();
    // Before the settings query resolves, defaults (onboarded: false) apply.
    expect(screen.getByText(/Welcome to Canopy/i)).toBeInTheDocument();
  });
});
