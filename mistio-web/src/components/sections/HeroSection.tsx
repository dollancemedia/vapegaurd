'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { animateParticleSystem, animatePathDraw } from '../../utils/svgAnimations';

const HeroSection: React.FC = () => {
  // Hero section should always start visible, but we animate elements in
  const isVisible = true;
  const elementRef = useRef<HTMLDivElement>(null);
  const particleRef = useRef<SVGSVGElement>(null);
  const logoRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (isVisible && particleRef.current) {
      // Animate particle system
      animateParticleSystem(particleRef.current, 50, {
        size: 2,
        color: '#3b82f6',
        speed: 1,
        lifespan: 3
      });
    }

    if (isVisible && logoRef.current) {
      // Animate logo path drawing
      animatePathDraw(logoRef.current, 2, 0.5);
    }
  }, [isVisible]);

  return (
    <section ref={elementRef} className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* Particle Background */}
      <svg
        ref={particleRef}
        className="absolute inset-0 w-full h-full opacity-30"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Particle container - particles will be added dynamically */}
      </svg>

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 1, delay: 0.2 }}
        className="relative z-10 text-center max-w-4xl mx-auto px-6"
      >
        {/* Mistio Logo */}
        <div className="mb-8 flex justify-center">
          <svg
            width="200"
            height="80"
            viewBox="0 0 200 80"
            className="drop-shadow-lg"
          >
            {/* Mistio Logo Path */}
            <path
              ref={logoRef}
              d="M20 40 Q20 20 40 20 L60 20 Q80 20 80 40 Q80 60 100 60 L120 60 Q140 60 140 40 Q140 20 160 20 L180 20 Q180 40 160 40 Q140 40 140 60 Q120 80 100 80 L80 80 Q60 80 60 60 Q60 40 40 40 L20 40"
              stroke="#ffffff"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Logo Glow Effect */}
            <path
              d="M20 40 Q20 20 40 20 L60 20 Q80 20 80 40 Q80 60 100 60 L120 60 Q140 60 140 40 Q140 20 160 20 L180 20 Q180 40 160 40 Q140 40 140 60 Q120 80 100 80 L80 80 Q60 80 60 60 Q60 40 40 40 L20 40"
              stroke="#3b82f6"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.3"
              filter="blur(2px)"
            />
          </svg>
        </div>

        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight"
        >
          Advanced Vape Detection
          <span className="block text-blue-400">for Modern Spaces</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="text-xl md:text-2xl text-blue-100 mb-8 max-w-2xl mx-auto leading-relaxed"
        >
          Protect your environment with cutting-edge sensor technology that detects vaping incidents in real-time, ensuring safety and compliance.
        </motion.p>
      </motion.div>
    </section>
  );
};

export default HeroSection;
