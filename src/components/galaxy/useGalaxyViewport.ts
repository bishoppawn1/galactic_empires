import { useCallback, useEffect, useRef, useState } from 'react';
import type { GalaxyViewportBounds } from './geometry';

const VIEWPORT_OVERSCAN = 480;
const VIEWPORT_STEP = 240;

export function useGalaxyViewport(zoom: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const [bounds, setBounds] = useState<GalaxyViewportBounds>();

  const measure = useCallback(() => {
    const viewport = scrollRef.current;
    if (!viewport || !viewport.clientWidth || !viewport.clientHeight) return;
    const left = viewport.scrollLeft / zoom, top = viewport.scrollTop / zoom;
    const right = (viewport.scrollLeft + viewport.clientWidth) / zoom;
    const bottom = (viewport.scrollTop + viewport.clientHeight) / zoom;
    const next = {
      left: Math.max(0, Math.floor(left / VIEWPORT_STEP) * VIEWPORT_STEP - VIEWPORT_OVERSCAN),
      top: Math.max(0, Math.floor(top / VIEWPORT_STEP) * VIEWPORT_STEP - VIEWPORT_OVERSCAN),
      right: Math.ceil(right / VIEWPORT_STEP) * VIEWPORT_STEP + VIEWPORT_OVERSCAN,
      bottom: Math.ceil(bottom / VIEWPORT_STEP) * VIEWPORT_STEP + VIEWPORT_OVERSCAN,
    };
    setBounds(current => current && current.left === next.left && current.top === next.top && current.right === next.right && current.bottom === next.bottom ? current : next);
  }, [zoom]);

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current !== undefined) return;
    frameRef.current = window.requestAnimationFrame(() => { frameRef.current = undefined; measure(); });
  }, [measure]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const preventWheelNavigation = (event: WheelEvent) => event.preventDefault();
    measure();
    viewport.addEventListener('scroll', scheduleMeasure, { passive: true });
    viewport.addEventListener('wheel', preventWheelNavigation, { passive: false });
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleMeasure);
    observer?.observe(viewport);
    window.addEventListener('resize', scheduleMeasure);
    return () => {
      viewport.removeEventListener('scroll', scheduleMeasure);
      viewport.removeEventListener('wheel', preventWheelNavigation);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      if (frameRef.current !== undefined) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = undefined;
      }
    };
  }, [measure, scheduleMeasure]);

  return { scrollRef, viewportBounds: bounds, scheduleViewportMeasure: scheduleMeasure };
}
