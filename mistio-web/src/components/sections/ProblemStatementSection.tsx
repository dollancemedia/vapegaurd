'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { animateCounter } from '../../utils/svgAnimations';
import AnimatedSection from '../animations/AnimatedSection';

const ProblemStatementSection: React.FC = () => {
  const elementRef = useRef<HTMLDivElement>(null);
  
  const stat1Ref = useRef<HTMLDivElement>(null);
  const stat2Ref = useRef<HTMLDivElement>(null);
  const stat3Ref = useRef<HTMLDivElement>(null);

  // Function to trigger imperative animations
  useEffect(() => {
    if (stat1Ref.current) animateCounter(stat1Ref.current, 0, 78, 2, '%');
    if (stat2Ref.current) animateCounter(stat2Ref.current, 0, 2.5, 2, 'M');
    if (stat3Ref.current) animateCounter(stat3Ref.current, 0, 15, 2, ' min');
  }, []);

  // Define variants for children
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.8, ease: "easeOut" }
    }
  };

  const animationConfig = {
    type: 'slide' as const,
    duration: 0.8,
    delay: 0.2,
    easing: 'easeOut'
  };

  return (
    <AnimatedSection id="problem" animationConfig={animationConfig}>
      <motion.div 
        ref={elementRef} 
        className="text-center"
      >
        <motion.h2
          variants={itemVariants}
          className="text-4xl md:text-5xl font-bold text-gray-900 mb-4"
        >
          The Vaping Epidemic in Our Schools
        </motion.h2>
        
        <motion.p
          variants={itemVariants}
          className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed"
        >
          Vaping has become a serious concern in educational environments, with students using e-cigarettes in bathrooms, hallways, and even classrooms.
        </motion.p>

        {/* Statistics Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <motion.div
            variants={itemVariants}
            className="bg-white rounded-xl p-8 shadow-lg border border-gray-100"
          >
            <div className="text-5xl font-bold text-blue-600 mb-2" ref={stat1Ref}>
              0%
            </div>
            <div className="text-gray-600 font-medium">of high school students have tried vaping</div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="bg-white rounded-xl p-8 shadow-lg border border-gray-100"
          >
            <div className="text-5xl font-bold text-red-600 mb-2" ref={stat2Ref}>
              0M
            </div>
            <div className="text-gray-600 font-medium">American middle and high school students vape</div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="bg-white rounded-xl p-8 shadow-lg border border-gray-100"
          >
            <div className="text-5xl font-bold text-green-600 mb-2" ref={stat3Ref}>
              0 min
            </div>
            <div className="text-gray-600 font-medium">average time to detect and respond</div>
          </motion.div>
        </div>

        {/* SVG Illustration */}
        <motion.div
          variants={{
            hidden: { opacity: 0, scale: 0.9 },
            visible: { opacity: 1, scale: 1, transition: { duration: 1 } }
          }}
          className="max-w-2xl mx-auto"
        >
            {/* SVG placeholder or graphic can go here */}
        </motion.div>
      </motion.div>
    </AnimatedSection>
  );
};

export default ProblemStatementSection;
