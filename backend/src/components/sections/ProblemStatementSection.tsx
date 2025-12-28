import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { animateCounter } from '../../utils/svgAnimations';
import AnimatedSection from '../animations/AnimatedSection';

const ProblemStatementSection: React.FC = () => {
  // Remove useInView for children to rely on parent variant propagation
  const elementRef = useRef<HTMLDivElement>(null);
  // We use a state to track if we've entered viewport for the one-off counter animations
  const [hasEntered, setHasEntered] = useState(true);
  
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
  const itemVariants = {
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
    easing: 'easeOutQuart'
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
          <svg
            viewBox="0 0 600 400"
            className="w-full h-auto"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* School Building */}
            <rect x="100" y="150" width="400" height="200" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="2" rx="8" />
            <rect x="150" y="200" width="80" height="120" fill="#f3f4f6" stroke="#6b7280" strokeWidth="1" />
            <rect x="270" y="200" width="80" height="120" fill="#f3f4f6" stroke="#6b7280" strokeWidth="1" />
            <rect x="390" y="200" width="80" height="120" fill="#f3f4f6" stroke="#6b7280" strokeWidth="1" />
            
            {/* Windows */}
            <rect x="165" y="220" width="20" height="25" fill="#3b82f6" opacity="0.7" />
            <rect x="195" y="220" width="20" height="25" fill="#3b82f6" opacity="0.7" />
            <rect x="165" y="260" width="20" height="25" fill="#3b82f6" opacity="0.7" />
            <rect x="195" y="260" width="20" height="25" fill="#3b82f6" opacity="0.7" />
            
            {/* Vape Smoke Detection */}
            <motion.g
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { delay: 0.5 } } }}
            >
              {/* Vape Device */}
              <rect x="320" y="280" width="8" height="30" fill="#374151" rx="4" />
              <circle cx="324" cy="278" r="3" fill="#ef4444" />
              
              {/* Smoke Waves */}
              <motion.path
                d="M324 278 Q330 270 335 275 Q340 280 345 275"
                stroke="#9ca3af"
                strokeWidth="3"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={hasEntered ? { pathLength: 1 } : { pathLength: 0 }}
                transition={{ duration: 2, delay: 0.8 }}
              />
              
              <motion.path
                d="M324 278 Q315 270 310 275 Q305 280 300 275"
                stroke="#9ca3af"
                strokeWidth="3"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={hasEntered ? { pathLength: 1 } : { pathLength: 0 }}
                transition={{ duration: 2, delay: 1 }}
              />
            </motion.g>
            
            {/* Detection Sensor */}
            <motion.g
              variants={{
                hidden: { opacity: 0, scale: 0 },
                visible: { opacity: 1, scale: 1, transition: { delay: 1.2 } }
              }}
            >
              <circle cx="324" cy="240" r="15" fill="#10b981" opacity="0.3" />
              <circle cx="324" cy="240" r="8" fill="#10b981" />
              <circle cx="324" cy="240" r="4" fill="#ffffff" />
            </motion.g>
            
            {/* Alert Icon */}
            <motion.g
              variants={{
                hidden: { opacity: 0, y: -10 },
                visible: { opacity: 1, y: 0, transition: { delay: 1.5 } }
              }}
            >
              <polygon points="324,220 330,210 330,200 318,200 318,210" fill="#f59e0b" />
              <circle cx="324" cy="205" r="2" fill="#ffffff" />
              <rect x="323" y="207" width="2" height="4" fill="#ffffff" />
            </motion.g>
          </svg>
        </motion.div>

        <motion.div
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { delay: 1.8 } }
          }}
          className="text-center mt-8"
        >
          <p className="text-lg text-gray-600">
            Traditional detection methods are reactive and often too late. 
            <span className="font-semibold text-blue-600">Mistio changes everything.</span>
          </p>
        </motion.div>
      </motion.div>
    </AnimatedSection>
  );
};

export default ProblemStatementSection;
