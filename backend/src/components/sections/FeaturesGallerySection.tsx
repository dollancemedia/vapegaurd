import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedSection from '../animations/AnimatedSection';

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  details: string[];
  color: string;
}

const FeaturesGallerySection: React.FC = () => {
  const isVisible = true;
  const elementRef = useRef<HTMLDivElement>(null);
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  const features: Feature[] = [
    {
      id: '24-7-monitoring',
      title: '24/7 Monitoring',
      description: 'Continuous surveillance with no downtime',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      details: [
        'Real-time sensor monitoring',
        'Automatic system health checks',
        'Instant failure notifications',
        'Redundant backup systems'
      ],
      color: 'blue'
    },
    {
      id: 'instant-alerts',
      title: 'Instant Alerts',
      description: 'Immediate notifications when vaping is detected',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      ),
      details: [
        'SMS and email notifications',
        'Mobile app push alerts',
        'Dashboard notifications',
        'Custom alert rules'
      ],
      color: 'green'
    },
    {
      id: 'ai-powered',
      title: 'AI-Powered Detection',
      description: 'Machine learning eliminates false positives',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      details: [
        'Advanced particle analysis',
        'Environmental adaptation',
        'Pattern recognition',
        'Continuous learning'
      ],
      color: 'purple'
    },
    {
      id: 'easy-installation',
      title: 'Easy Installation',
      description: 'Quick setup with minimal disruption',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      details: [
        'Wireless connectivity',
        'Battery or AC powered',
        'No structural modifications',
        'Professional installation included'
      ],
      color: 'orange'
    },
    {
      id: 'comprehensive-reporting',
      title: 'Comprehensive Reporting',
      description: 'Detailed analytics and incident tracking',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      details: [
        'Incident timeline tracking',
        'Usage pattern analysis',
        'Compliance reporting',
        'Export capabilities'
      ],
      color: 'indigo'
    },
    {
      id: 'privacy-focused',
      title: 'Privacy-Focused',
      description: 'No audio recording or video surveillance',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      details: [
        'No personal data collection',
        'Anonymous incident reporting',
        'GDPR compliant',
        'Local data processing'
      ],
      color: 'pink'
    }
  ];

  const animationConfig = {
    type: 'slide' as const,
    duration: 0.8,
    delay: 0.2,
    easing: 'easeOutQuart'
  };

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; text: string; border: string }> = {
      blue: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200' },
      green: { bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' },
      purple: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-200' },
      orange: { bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200' },
      indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600', border: 'border-indigo-200' },
      pink: { bg: 'bg-pink-100', text: 'text-pink-600', border: 'border-pink-200' }
    };
    return colorMap[color] || colorMap.blue;
  };

  return (
    <AnimatedSection id="features" animationConfig={animationConfig}>
      <div ref={elementRef} className="container mx-auto px-4 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-4xl md:text-5xl font-bold text-gray-900 mb-4"
        >
          Powerful Features
        </motion.h2>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed"
        >
          Discover the comprehensive suite of features that make Mistio the most advanced vape detection system available.
        </motion.p>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const colors = getColorClasses(feature.color);
            const isExpanded = expandedFeature === feature.id;
            
            return (
              <motion.div
                key={feature.id}
                initial={{ opacity: 0, y: 30 }}
                animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                transition={{ duration: 0.6, delay: 0.7 + index * 0.1 }}
                className={`bg-white rounded-xl border-2 transition-all duration-300 cursor-pointer ${
                  isExpanded ? `${colors.border} shadow-lg` : 'border-gray-100 hover:border-gray-200'
                }`}
                onClick={() => setExpandedFeature(isExpanded ? null : feature.id)}
              >
                <div className="p-6">
                  {/* Icon */}
                  <div className={`w-16 h-16 ${colors.bg} ${colors.text} rounded-xl flex items-center justify-center mb-4 mx-auto transition-transform duration-300 ${
                    isExpanded ? 'scale-110' : ''
                  }`}>
                    {feature.icon}
                  </div>
                  
                  {/* Title */}
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  
                  {/* Description */}
                  <p className="text-gray-600 mb-4">
                    {feature.description}
                  </p>
                  
                  {/* Expand Indicator */}
                  <div className="flex items-center justify-center text-sm text-gray-500">
                    <span>{isExpanded ? 'Show less' : 'Learn more'}</span>
                    <svg 
                      className={`w-4 h-4 ml-1 transition-transform duration-300 ${
                        isExpanded ? 'rotate-180' : ''
                      }`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  
                  {/* Expanded Details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mt-4 pt-4 border-t border-gray-100"
                      >
                        <ul className="space-y-2">
                          {feature.details.map((detail, detailIndex) => (
                            <motion.li
                              key={detailIndex}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.3, delay: detailIndex * 0.1 }}
                              className="flex items-start text-sm text-gray-600"
                            >
                              <svg 
                                className={`w-4 h-4 ${colors.text} mr-2 mt-0.5 flex-shrink-0`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              {detail}
                            </motion.li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 1.5 }}
          className="mt-12"
        >
          <p className="text-lg text-gray-600 mb-6">
            Ready to see how Mistio can protect your environment?
          </p>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105">
            Schedule a Demo
          </button>
        </motion.div>
      </div>
    </AnimatedSection>
  );
};

export default FeaturesGallerySection;
