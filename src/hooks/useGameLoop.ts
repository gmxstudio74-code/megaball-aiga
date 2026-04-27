import { useEffect, useRef } from 'react';

export const useGameLoop = (callback: (delta: number) => void) => {
  const requestRef = useRef<number>(null);
  const previousTimeRef = useRef<number>(null);
  const callbackRef = useRef(callback);

  // Update the ref to the latest callback on every render
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const animate = (time: number) => {
    if (previousTimeRef.current !== null) {
      const deltaTime = time - previousTimeRef.current;
      callbackRef.current(deltaTime);
    }
    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);
};
