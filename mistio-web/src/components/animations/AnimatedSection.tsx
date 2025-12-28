'use client';

import { motion, Variants } from 'framer-motion';
import { AnimationConfig, SectionProps } from '../../types/animation';

const AnimatedSection: React.FC<SectionProps> = ({ id, children, animationConfig }) => {
  // Check if this section is the target of the current hash
  // Using useEffect to avoid hydration mismatch
  const isHashTarget = false; 

  const getAnimationVariants = (config: AnimationConfig): Variants => {
    if (!config) return {};
    
    switch (config.type) {
      case 'fade':
        return {
          hidden: { opacity: 0 },
          visible: { 
            opacity: 1,
            transition: {
              duration: config.duration,
              delay: config.delay,
              ease: config.easing as any
            }
          }
        };
      case 'slide':
        return {
          hidden: { opacity: 0, y: 50 },
          visible: { 
            opacity: 1, 
            y: 0,
            transition: {
              duration: config.duration,
              delay: config.delay,
              ease: config.easing as any
            }
          }
        };
      case 'scale':
        return {
          hidden: { opacity: 0, scale: 0.8 },
          visible: { 
            opacity: 1, 
            scale: 1,
            transition: {
              duration: config.duration,
              delay: config.delay,
              ease: config.easing as any
            }
          }
        };
      default:
        return {
          hidden: { opacity: 0 },
          visible: { 
            opacity: 1,
            transition: {
              duration: config.duration,
              delay: config.delay,
              ease: config.easing as any
            }
          }
        };
    }
  };

  const variants = animationConfig ? getAnimationVariants(animationConfig) : {};

  return (
    <motion.section
      id={id}
      initial="visible" // Force visible for now to avoid issues if config is missing
      whileInView="visible"
      viewport={{ once: true }}
      variants={variants}
      className="min-h-screen flex items-center justify-center py-20"
    >
      <div className="max-w-6xl mx-auto px-6">
        {children}
      </div>
    </motion.section>
  );
};

export default AnimatedSection;
