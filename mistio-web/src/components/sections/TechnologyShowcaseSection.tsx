'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import AnimatedSection from '../animations/AnimatedSection';

const TechnologyShowcaseSection: React.FC = () => {
  const elementRef = useRef<HTMLDivElement>(null);
  const isVisible = true;
  const [detectionActive, setDetectionActive] = useState(false);
  const sensorRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDetectionActive(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const animationConfig = {
    type: 'fade' as const,
    duration: 1,
    delay: 0.3,
    easing: 'easeOut'
  };

  return (
    <AnimatedSection id="technology" animationConfig={animationConfig}>
      <div ref={elementRef} className="text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-4xl md:text-5xl font-bold text-gray-900 mb-4"
        >
          How Mistio Technology Works
        </motion.h2>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed"
        >
          Our advanced sensor array detects microscopic vape particles in real-time, providing instant alerts and comprehensive monitoring.
        </motion.p>

        {/* Technology Visualization */}
        <div className="max-w-4xl mx-auto mb-12">
          <svg
            viewBox="0 0 800 500"
            className="w-full h-auto"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Background Grid */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="1" opacity="0.3" />
              </pattern>
            </defs>
            <rect width="800" height="500" fill="url(#grid)" />
            
            {/* Room Outline */}
            <rect x="100" y="100" width="600" height="300" fill="none" stroke="#6b7280" strokeWidth="2" rx="10" />
            
            {/* Sensor Array */}
            <motion.g ref={sensorRef}>
              {/* Sensor 1 - Top Left */}
              <motion.g
                initial={{ opacity: 0, scale: 0 }}
                animate={isVisible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                transition={{ duration: 0.5, delay: 0.8 }}
              >
                <circle cx="200" cy="150" r="20" fill="#3b82f6" opacity="0.2" />
                <circle cx="200" cy="150" r="12" fill="#3b82f6" />
                <circle cx="200" cy="150" r="6" fill="#ffffff" />
              </motion.g>
              
              {/* Sensor 2 - Top Right */}
              <motion.g
                initial={{ opacity: 0, scale: 0 }}
                animate={isVisible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                transition={{ duration: 0.5, delay: 1 }}
              >
                <circle cx="600" cy="150" r="20" fill="#3b82f6" opacity="0.2" />
                <circle cx="600" cy="150" r="12" fill="#3b82f6" />
                <circle cx="600" cy="150" r="6" fill="#ffffff" />
              </motion.g>
              
              {/* Sensor 3 - Bottom Left */}
              <motion.g
                initial={{ opacity: 0, scale: 0 }}
                animate={isVisible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                transition={{ duration: 0.5, delay: 1.2 }}
              >
                <circle cx="200" cy="350" r="20" fill="#3b82f6" opacity="0.2" />
                <circle cx="200" cy="350" r="12" fill="#3b82f6" />
                <circle cx="200" cy="350" r="6" fill="#ffffff" />
              </motion.g>
            </motion.g>
          </svg>
        </div>
      </div>
    </AnimatedSection>
  );
};

export default TechnologyShowcaseSection;
