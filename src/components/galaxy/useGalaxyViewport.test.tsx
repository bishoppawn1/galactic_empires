import { StrictMode, useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGalaxyViewport } from './useGalaxyViewport';

function ViewportHarness({ target }: { target: number }) {
  const { scrollRef, viewportBounds, scheduleViewportMeasure } = useGalaxyViewport(1);
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollLeft = target;
    scheduleViewportMeasure();
  }, [scheduleViewportMeasure, scrollRef, target]);
  return <div ref={scrollRef} data-testid="viewport"><output data-testid="viewport-left">{viewportBounds?.left ?? 'unset'}</output></div>;
}

describe('galaxy viewport tracking', () => {
  afterEach(() => vi.restoreAllMocks());

  it('recovers after StrictMode cancels an initial scheduled measurement', () => {
    const frames = new Map<number, FrameRequestCallback>(); let nextFrame = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrame++; frames.set(id, callback); return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(850);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);

    const view = render(<StrictMode><ViewportHarness target={1_000} /></StrictMode>);
    view.rerender(<StrictMode><ViewportHarness target={5_000} /></StrictMode>);
    act(() => {
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(callback => callback(0));
    });

    expect(screen.getByTestId('viewport-left')).toHaveTextContent('4320');
  });

  it('prevents the mouse wheel from moving the galaxy camera', () => {
    render(<ViewportHarness target={1_000} />);
    const viewport = screen.getByTestId('viewport');
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });

    expect(viewport.dispatchEvent(wheel)).toBe(false);
    expect(wheel.defaultPrevented).toBe(true);
  });
});
