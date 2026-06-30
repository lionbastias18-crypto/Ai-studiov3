
import React, { useState, useRef, useEffect } from 'react';

interface JoystickProps {
  onMove: (vector: { x: number; y: number }) => void;
  onEnd: () => void;
  size?: number;
}

const Joystick: React.FC<JoystickProps> = ({ onMove, onEnd, size = 160 }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouch = (e: React.TouchEvent | React.MouseEvent) => {
    // Prevent the touch from bubbling up to the camera rotation handlers
    e.stopPropagation();
    
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const clientX = 'touches' in e ? e.targetTouches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.targetTouches[0].clientY : (e as React.MouseEvent).clientY;
    
    const relX = clientX - rect.left - centerX;
    const relY = clientY - rect.top - centerY;
    
    const distance = Math.sqrt(relX * relX + relY * relY);
    const maxRadius = size / 2 - 20;
    
    let moveX = relX;
    let moveY = relY;
    
    if (distance > maxRadius) {
      moveX = (relX / distance) * maxRadius;
      moveY = (relY / distance) * maxRadius;
    }
    
    setPosition({ x: moveX, y: moveY });
    onMove({ x: moveX / maxRadius, y: -moveY / maxRadius });
  };

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    setIsActive(true);
    handleTouch(e);
  };

  const handleEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    setIsActive(false);
    setPosition({ x: 0, y: 0 });
    onEnd();
  };

  useEffect(() => {
    if (isActive) {
      const moveHandler = (e: MouseEvent) => {
          // Note: for global moves we don't always want stopPropagation 
          // but since this is attached to window when active, it's fine
          handleTouch(e as unknown as React.MouseEvent);
      };
      const endHandler = (e: MouseEvent) => handleEnd(e as unknown as React.MouseEvent);
      window.addEventListener('mousemove', moveHandler);
      window.addEventListener('mouseup', endHandler);
      return () => {
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('mouseup', endHandler);
      };
    }
  }, [isActive]);

  return (
    <div 
      ref={containerRef}
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      onTouchMove={handleTouch}
      onTouchEnd={handleEnd}
      className="bg-black/30 rounded-full border-4 border-white/20 flex items-center justify-center relative touch-none shadow-inner"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <div 
        className="bg-white/50 rounded-full shadow-lg pointer-events-none transition-transform duration-75"
        style={{ 
          width: `${size * 0.4}px`, 
          height: `${size * 0.4}px`,
          transform: `translate(${position.x}px, ${position.y}px)` 
        }}
      />
    </div>
  );
};

export default Joystick;
