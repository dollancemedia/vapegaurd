import { motion } from 'framer-motion';
import { AnimationConfig, SectionProps } from '../../types/animation';

const AnimatedSection: React.FC<SectionProps> = ({ id, children, animationConfig }) => {
  // Check if this section is the target of the current hash
  const isHashTarget = typeof window !== 'undefined' && window.location.hash === `#${id}`;

  const getAnimationVariants = (config: AnimationConfig) => {
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

  const variants = getAnimationVariants(animationConfig);

  return (
    <motion.section
      id={id}
      initial="visible"
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
