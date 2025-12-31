import { motion } from 'framer-motion';
import AnimatedSection from '../animations/AnimatedSection';

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  duration: string;
}

const InstallationProcessSection: React.FC = () => {
  const isVisible = true;
  const elementRef = { current: null } as React.RefObject<HTMLDivElement>;

  const steps: Step[] = [
    {
      id: 'consultation',
      title: 'Free Consultation',
      description: 'Our experts assess your space and recommend optimal sensor placement',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      duration: '30 min'
    },
    {
      id: 'site-survey',
      title: 'Site Survey',
      description: 'Detailed analysis of your facility layout and environmental factors',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
      duration: '1 hour'
    },
    {
      id: 'installation',
      title: 'Professional Installation',
      description: 'Certified technicians install sensors with minimal disruption',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      duration: '2-4 hours'
    },
    {
      id: 'configuration',
      title: 'System Configuration',
      description: 'Customize alert settings, user access, and reporting preferences',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
      duration: '1 hour'
    },
    {
      id: 'training',
      title: 'Staff Training',
      description: 'Comprehensive training on system operation and incident response',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      duration: '45 min'
    },
    {
      id: 'activation',
      title: 'Go Live',
      description: 'System activation with 24/7 monitoring and support',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      duration: '15 min'
    }
  ];

  const animationConfig = {
    type: 'fade' as const,
    duration: 1,
    delay: 0.2,
    easing: 'easeOutQuart'
  };

  return (
    <AnimatedSection id="installation" animationConfig={animationConfig}>
      <div ref={elementRef} className="container mx-auto px-4 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-4xl md:text-5xl font-bold text-gray-900 mb-4"
        >
          Installation Process
        </motion.h2>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed"
        >
          Our streamlined installation process gets your vape detection system up and running quickly with minimal disruption to your operations.
        </motion.p>

        {/* Timeline */}
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            {/* Vertical Line */}
            <motion.div
              initial={{ height: 0 }}
              animate={isVisible ? { height: '100%' } : { height: 0 }}
              transition={{ duration: 2, delay: 0.8 }}
              className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-blue-600"
            />
            
            {/* Steps */}
            <div className="space-y-8">
              {steps.map((step, index) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -30 }}
                  animate={isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
                  transition={{ duration: 0.6, delay: 0.8 + index * 0.2 }}
                  className="relative flex items-start"
                >
                  {/* Step Number */}
                  <div className="flex-shrink-0 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg z-10">
                    {index + 1}
                  </div>
                  
                  {/* Step Content */}
                  <div className="ml-6 flex-1">
                    <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xl font-semibold text-gray-900">
                          {step.title}
                        </h3>
                        <span className="text-sm text-blue-600 font-medium bg-blue-50 px-3 py-1 rounded-full">
                          {step.duration}
                        </span>
                      </div>
                      <p className="text-gray-600 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Process Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 2.5 }}
          className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-8 border border-blue-100"
        >
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-600 mb-2">4-6 Hours</div>
              <div className="text-gray-600">Total Installation Time</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600 mb-2">0%</div>
              <div className="text-gray-600">Operational Disruption</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-purple-600 mb-2">24/7</div>
              <div className="text-gray-600">Support Available</div>
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 2.8 }}
          className="mt-12"
        >
          <p className="text-lg text-gray-600 mb-6">
            Ready to protect your facility with Mistio?
          </p>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105">
            Get Started Today
          </button>
        </motion.div>
      </div>
    </AnimatedSection>
  );
};

export default InstallationProcessSection;
