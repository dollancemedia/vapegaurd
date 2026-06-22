'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronsLeftRight } from 'lucide-react';

interface ImageComparisonProps {
  beforeImage: string;
  afterImage: string;
  altBefore?: string;
  altAfter?: string;
}

export const ImageComparison = ({
  beforeImage,
  afterImage,
  altBefore = 'Before',
  altAfter = 'After',
}: ImageComparisonProps) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let newPosition = ((clientX - rect.left) / rect.width) * 100;
    newPosition = Math.max(0, Math.min(100, newPosition));
    setSliderPosition(newPosition);
  }, []);

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = useCallback(() => setIsDragging(false), []);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) handleMove(e.clientX);
  };
  const handleTouchStart = () => setIsDragging(true);
  const handleTouchEnd = () => setIsDragging(false);
  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging) handleMove(e.touches[0].clientX);
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-4xl mx-auto select-none rounded-xl overflow-hidden shadow-2xl cursor-crosshair touch-pan-y"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute top-0 left-0 h-full w-full overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <img src={afterImage} alt={altAfter} className="h-full w-full object-cover object-left" draggable="false" />
      </div>
      <img src={beforeImage} alt={altBefore} className="block h-full w-full object-cover object-left" draggable="false" />
      <div
        className="absolute top-0 bottom-0 w-1.5 bg-white/80 cursor-ew-resize flex items-center justify-center z-10"
        style={{ left: `calc(${sliderPosition}% - 0.375rem)` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className={`bg-white rounded-full h-12 w-12 flex items-center justify-center shadow-md transition-all duration-200 ease-in-out ${isDragging ? 'scale-110 shadow-xl' : ''}`}>
          <ChevronsLeftRight className="text-gray-700 w-6 h-6" />
        </div>
      </div>
    </div>
  );
};
