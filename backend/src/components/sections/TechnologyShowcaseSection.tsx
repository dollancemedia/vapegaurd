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
    easing: 'easeOutQuart'
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
              
              {/* Sensor 4 - Bottom Right */}
              <motion.g
                initial={{ opacity: 0, scale: 0 }}
                animate={isVisible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                transition={{ duration: 0.5, delay: 1.4 }}
              >
                <circle cx="600" cy="350" r="20" fill="#3b82f6" opacity="0.2" />
                <circle cx="600" cy="350" r="12" fill="#3b82f6" />
                <circle cx="600" cy="350" r="6" fill="#ffffff" />
              </motion.g>
              
              {/* Central Hub */}
              <motion.g
                initial={{ opacity: 0, scale: 0 }}
                animate={isVisible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                transition={{ duration: 0.5, delay: 1.6 }}
              >
                <circle cx="400" cy="250" r="25" fill="#1e40af" opacity="0.3" />
                <circle cx="400" cy="250" r="15" fill="#1e40af" />
                <circle cx="400" cy="250" r="8" fill="#ffffff" />
              </motion.g>
            </motion.g>
            
            {/* Detection Waves */}
            {detectionActive && (
              <>
                {/* Wave 1 */}
                <motion.circle
                  cx="400"
                  cy="250"
                  r="50"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  initial={{ r: 25, opacity: 1 }}
                  animate={{ r: 100, opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                />
                
                {/* Wave 2 */}
                <motion.circle
                  cx="400"
                  cy="250"
                  r="50"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  initial={{ r: 25, opacity: 1 }}
                  animate={{ r: 100, opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 1 }}
                />
                
                {/* Wave 3 */}
                <motion.circle
                  cx="400"
                  cy="250"
                  r="50"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  initial={{ r: 25, opacity: 1 }}
                  animate={{ r: 100, opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 2 }}
                />
              </>
            )}
            
            {/* Vape Particles */}
            {detectionActive && (
              <>
                <motion.circle
                  cx="350"
                  cy="200"
                  r="3"
                  fill="#9ca3af"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                />
                <motion.circle
                  cx="380"
                  cy="180"
                  r="3"
                  fill="#9ca3af"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.7 }}
                />
                <motion.circle
                  cx="420"
                  cy="220"
                  r="3"
                  fill="#9ca3af"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.9 }}
                />
                <motion.circle
                  cx="450"
                  cy="190"
                  r="3"
                  fill="#9ca3af"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 1.1 }}
                />
              </>
            )}
            
            {/* Connection Lines */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 1, delay: 1.8 }}
            >
              <line x1="400" y1="250" x2="200" y2="150" stroke="#3b82f6" strokeWidth="1" opacity="0.5" strokeDasharray="5,5" />
              <line x1="400" y1="250" x2="600" y2="150" stroke="#3b82f6" strokeWidth="1" opacity="0.5" strokeDasharray="5,5" />
              <line x1="400" y1="250" x2="200" y2="350" stroke="#3b82f6" strokeWidth="1" opacity="0.5" strokeDasharray="5,5" />
              <line x1="400" y1="250" x2="600" y2="350" stroke="#3b82f6" strokeWidth="1" opacity="0.5" strokeDasharray="5,5" />
            </motion.g>
            
            {/* Labels */}
            <motion.text
              x="200"
              y="130"
              textAnchor="middle"
              className="text-sm fill-gray-600"
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.5, delay: 2 }}
            >
              Sensor 1
            </motion.text>
            <motion.text
              x="600"
              y="130"
              textAnchor="middle"
              className="text-sm fill-gray-600"
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.5, delay: 2.1 }}
            >
              Sensor 2
            </motion.text>
            <motion.text
              x="200"
              y="380"
              textAnchor="middle"
              className="text-sm fill-gray-600"
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.5, delay: 2.2 }}
            >
              Sensor 3
            </motion.text>
            <motion.text
              x="600"
              y="380"
              textAnchor="middle"
              className="text-sm fill-gray-600"
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.5, delay: 2.3 }}
            >
              Sensor 4
            </motion.text>
            <motion.text
              x="400"
              y="220"
              textAnchor="middle"
              className="text-sm fill-gray-600 font-medium"
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.5, delay: 2.4 }}
            >
              Central Hub
            </motion.text>
          </svg>
        </div>

        {/* Technology Features */}
        <div className="grid md:grid-cols-3 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, delay: 2.5 }}
            className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Instant Detection</h3>
            <p className="text-gray-600">Detects vape particles within seconds of emission using advanced sensor technology.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, delay: 2.7 }}
            className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
          >
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Smart Sensors</h3>
            <p className="text-gray-600">Multi-sensor array eliminates false positives and adapts to environmental conditions.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, delay: 2.9 }}
            className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Real-time Alerts</h3>
            <p className="text-gray-600">Immediate notifications sent to administrators via mobile app and dashboard.</p>
          </motion.div>
        </div>
      </div>
    </AnimatedSection>
  );
};

export default TechnologyShowcaseSection;
