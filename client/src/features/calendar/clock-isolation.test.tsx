import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { HeaderClock } from '../../components/HeaderClock';

// Proves the minute tick re-renders only the clock leaf, not its parent.
function Harness({ onParentRender }: { onParentRender: () => void }) {
  const renders = useRef(0);
  renders.current += 1;
  onParentRender();
  return (
    <div>
      <span data-testid="parent-renders">{renders.current}</span>
      <HeaderClock />
    </div>
  );
}

describe('HeaderClock isolation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('re-renders the clock on the minute without re-rendering the parent', () => {
    // Fix "now" so the rendered time is deterministic.
    vi.setSystemTime(new Date(2026, 6, 15, 9, 30, 0));
    const parent = vi.fn();
    const { getByTestId } = render(<Harness onParentRender={parent} />);

    const initialParentRenders = parent.mock.calls.length;
    expect(getByTestId('parent-renders').textContent).toBe('1');

    // Advance to 9:31 and let useNow's scheduled setTimeout fire.
    act(() => {
      vi.setSystemTime(new Date(2026, 6, 15, 9, 31, 0));
      vi.advanceTimersByTime(60_000);
    });

    // The parent did not re-render even though the clock ticked.
    expect(parent.mock.calls.length).toBe(initialParentRenders);
    expect(getByTestId('parent-renders').textContent).toBe('1');
  });

  it('renders a plausible h:mm a time string', () => {
    vi.setSystemTime(new Date(2026, 6, 15, 14, 5, 0));
    const { container } = render(<HeaderClock />);
    expect(container.querySelector('.header-clock')?.textContent).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)$/i);
  });
});
