'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
        'Exportable reports',
        'Compliance documentation'
      ],
      color: 'red'
    }
  ];

  const animationConfig = {
    type: 'fade' as const,
    duration: 0.8,
    delay: 0.2,
    easing: 'easeOut'
  };

  return (
    <AnimatedSection id="features" animationConfig={animationConfig}>
      <div ref={elementRef} className="container mx-auto px-4">
        <motion.div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Comprehensive Protection
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Everything you need to maintain a safe and healthy environment.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className={`bg-white rounded-xl p-8 shadow-lg border-t-4 hover:shadow-xl transition-shadow cursor-pointer ${
                expandedFeature === feature.id ? 'ring-2 ring-blue-500' : ''
              }`}
              style={{ borderColor: feature.color }}
              onClick={() => setExpandedFeature(expandedFeature === feature.id ? null : feature.id)}
            >
              <div className={`text-${feature.color}-600 mb-6`}>
                {feature.icon}
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">{feature.title}</h3>
              <p className="text-gray-600 mb-6">{feature.description}</p>
              
              <motion.div
                initial={false}
                animate={{ height: expandedFeature === feature.id ? 'auto' : 0, opacity: expandedFeature === feature.id ? 1 : 0 }}
                className="overflow-hidden"
              >
                <ul className="space-y-2 pt-4 border-t border-gray-100">
                  {feature.details.map((detail, idx) => (
                    <li key={idx} className="flex items-center text-sm text-gray-500">
                      <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {detail}
                    </li>
                  ))}
                </ul>
              </motion.div>
              
              <button 
                className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center"
              >
                {expandedFeature === feature.id ? 'Show Less' : 'Learn More'}
                <svg 
                  className={`w-4 h-4 ml-1 transform transition-transform ${expandedFeature === feature.id ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
};

export default FeaturesGallerySection;
