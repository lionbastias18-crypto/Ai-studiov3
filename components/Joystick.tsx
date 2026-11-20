import React, { useState, useRef, useEffect, useCallback } from 'react';

interface JoystickProps {
  onMove: (vector: { x: number; y: number }) => void;
  onEnd: () => void;
  size?: number;
  screenRotationDeg?: 0 | 90 | -90;
}

const Joystick: React.FC<JoystickProps> = ({ onMove, onEnd, size = 140, screenRotationDeg = 0 }) => {
  const [isActive, setIsActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const centerRef = useRef<{ cx: number; cy: number; maxRadius: number }>({
    cx: 0,
    cy: 0,
    maxRadius: Math.max(20, size / 2 - 15),
  });
  const lastSentRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const screenRotationDegRef = useRef<0 | 90 | -90>(screenRotationDeg);
  screenRotationDegRef.current = screenRotationDeg;
  const onMoveRef = useRef(onMove);
  const onEndRef = useRef(onEnd);
  onMoveRef.current = onMove;
  onEndRef.current = onEnd;

  const setThumbTransform = useCallback((x: number, y: number) => {
    if (thumbRef.current) {
      thumbRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }, []);

  const updatePosition = useCallback((clientX: number, clientY: number) => {
    const { cx, cy, maxRadius } = centerRef.current;
    const rawDx = clientX - cx;
    const rawDy = clientY - cy;
    const rot = screenRotationDegRef.current;
    const relX = rot === 90 ? rawDy : rot === -90 ? -rawDy : rawDx;
    const relY = rot === 90 ? -rawDx : rot === -90 ? rawDx : rawDy;
    const distance = Math.hypot(relX, relY);

    let moveX = relX;
    let moveY = relY;

    if (distance > maxRadius && distance > 0.0001) {
      const scale = maxRadius / distance;
      moveX = relX * scale;
      moveY = relY * scale;
    }

    const normalizedDist = Math.min(1, distance / maxRadius);
    if (normalizedDist < 0.08) {
      setThumbTransform(0, 0);
      if (lastSentRef.current.x !== 0 || lastSentRef.current.y !== 0) {
        lastSentRef.current = { x: 0, y: 0 };
        onMoveRef.current({ x: 0, y: 0 });
      }
      return;
    }

    setThumbTransform(moveX, moveY);

    const nx = Math.round((moveX / maxRadius) * 100) / 100;
    const ny = Math.round((-moveY / maxRadius) * 100) / 100;
    if (
      Math.abs(nx - lastSentRef.current.x) >= 0.015 ||
      Math.abs(ny - lastSentRef.current.y) >= 0.015
    ) {
      lastSentRef.current = { x: nx, y: ny };
      onMoveRef.current({ x: nx, y: ny });
    }
  }, [setThumbTransform]);

  const resetStick = useCallback(() => {
    if (activePointerIdRef.current === null && lastSentRef.current.x === 0 && lastSentRef.current.y === 0) {
      return;
    }
    const ptrId = activePointerIdRef.current;
    activePointerIdRef.current = null;
    if (ptrId !== null && containerRef.current) {
      try {
        if (containerRef.current.hasPointerCapture(ptrId)) {
          containerRef.current.releasePointerCapture(ptrId);
        }
      } catch {
        // Ignore if pointer already released
      }
    }
    setIsActive(false);
    setThumbTransform(0, 0);
    lastSentRef.current = { x: 0, y: 0 };
    onEndRef.current();
  }, [setThumbTransform]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignore secondary touches while the joystick already owns an active pointer
    if (activePointerIdRef.current !== null) return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    centerRef.current = {
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      maxRadius: Math.max(20, size / 2 - 15),
    };

    activePointerIdRef.current = e.pointerId;
    try {
      containerRef.current.setPointerCapture(e.pointerId);
    } catch {
      // Window listeners below act as fallback when pointer capture isn't supported
    }

    setIsActive(true);
    updatePosition(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    updatePosition(e.clientX, e.clientY);
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    resetStick();
  };

  useEffect(() => {
    if (!isActive) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      updatePosition(e.clientX, e.clientY);
    };

    const handleWindowPointerEnd = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      resetStick();
    };

    const handleVisibilityOrBlur = () => {
      resetStick();
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: true });
    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);
    window.addEventListener('blur', handleVisibilityOrBlur);
    document.addEventListener('visibilitychange', handleVisibilityOrBlur);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
      window.removeEventListener('blur', handleVisibilityOrBlur);
      document.removeEventListener('visibilitychange', handleVisibilityOrBlur);
    };
  }, [isActive, updatePosition, resetStick]);

  useEffect(() => {
    centerRef.current.maxRadius = Math.max(20, size / 2 - 15);
    resetStick();
  }, [size, screenRotationDeg, resetStick]);

  useEffect(() => {
    return () => {
      activePointerIdRef.current = null;
      lastSentRef.current = { x: 0, y: 0 };
      onEndRef.current();
    };
  }, []);

  const stopBubble = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onLostPointerCapture={handlePointerUpOrCancel}
      onTouchStart={stopBubble}
      onTouchMove={stopBubble}
      onTouchEnd={stopBubble}
      onTouchCancel={stopBubble}
      onMouseDown={stopBubble}
      onMouseMove={stopBubble}
      onMouseUp={stopBubble}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`rounded-full border-2 flex items-center justify-center relative touch-none select-none transition-colors duration-100 ${
        isActive
          ? 'bg-black/65 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
          : 'bg-black/45 border-white/25 shadow-lg'
      }`}
      style={{ width: `${size}px`, height: `${size}px`, touchAction: 'none', WebkitUserSelect: 'none' }}
    >
      {/* Direction Cross Indicators */}
      <span className="absolute top-1 text-white/30 text-[9px] font-bold pointer-events-none">▲</span>
      <span className="absolute bottom-1 text-white/30 text-[9px] font-bold pointer-events-none">▼</span>
      <span className="absolute left-1.5 text-white/30 text-[9px] font-bold pointer-events-none">◀</span>
      <span className="absolute right-1.5 text-white/30 text-[9px] font-bold pointer-events-none">▶</span>

      {/* Outer tracking ring */}
      <div
        className="rounded-full border border-white/10 pointer-events-none absolute"
        style={{ width: `${size * 0.75}px`, height: `${size * 0.75}px` }}
      />

      {/* Stick Thumb Puck */}
      <div
        ref={thumbRef}
        className={`rounded-full pointer-events-none flex items-center justify-center border will-change-transform ${
          isActive
            ? 'bg-gradient-to-b from-emerald-400 to-teal-500 border-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.8)]'
            : 'bg-white/40 border-white/60 shadow-md transition-transform duration-150 ease-out'
        }`}
        style={{
          width: `${size * 0.42}px`,
          height: `${size * 0.42}px`,
          transform: 'translate3d(0px, 0px, 0)',
        }}
      >
        <div className={`w-3.5 h-3.5 rounded-full ${isActive ? 'bg-white/80' : 'bg-white/40'}`} />
      </div>
    </div>
  );
};

export default Joystick;

