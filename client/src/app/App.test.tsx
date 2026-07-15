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
    vi.fn(async () => new Response(JSON.stringify(DEFAULT_SETTINGS), { status: 200 })),
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
  it('renders the rail with all eight sections', () => {
    renderApp();
    for (const label of [
      'Calendar',
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

  it('shows the clock and default family name in the header', () => {
    renderApp();
    expect(screen.getByText('Our Family')).toBeInTheDocument();
    // Clock renders a h:mm a time.
    expect(screen.getByText(/^\d{1,2}:\d{2} (AM|PM)$/)).toBeInTheDocument();
  });

  it('redirects unknown routes to the calendar', () => {
    renderApp('/nowhere');
    expect(screen.getByText(/Calendar is growing/i)).toBeInTheDocument();
  });
});
