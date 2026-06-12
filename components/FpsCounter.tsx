import React, { useState, useEffect, useRef } from 'react';

export const FpsCounter: React.FC = () => {
  const [fps, setFps] = useState<number>(60);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    let animFrameId: number;
    
    const update = () => {
      framesRef.current += 1;
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;
      
      if (elapsed >= 1000) {
        setFps(Math.round((framesRef.current * 1000) / elapsed));
        framesRef.current = 0;
        lastTimeRef.current = now;
      }
      
      animFrameId = requestAnimationFrame(update);
    };
    
    animFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animFrameId);
  }, []);

  return (
    <span>FPS: {fps}</span>
  );
};
