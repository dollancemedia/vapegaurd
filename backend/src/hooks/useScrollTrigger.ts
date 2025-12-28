import { useEffect, useRef, useState } from 'react';
import { UseScrollTriggerOptions } from '../types/animation';

export const useScrollTrigger = (options: UseScrollTriggerOptions = {
  threshold: 0,
  rootMargin: '0px',
  triggerOnce: true
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsVisible(true);
  }, [options.threshold, options.rootMargin, options.triggerOnce, options.elementId]);

  return { isVisible, elementRef };
};

export const useScrollProgress = () => {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return scrollProgress;
};
