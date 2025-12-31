import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedSection from '../animations/AnimatedSection';

interface Testimonial {
  id: string;
  name: string;
  role: string;
  organization: string;
  content: string;
  rating: number;
  avatar: string;
}

const TestimonialsSection: React.FC = () => {
  const isVisible = true;
  const elementRef = useRef<HTMLDivElement>(null);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  const testimonials: Testimonial[] = [
    {
      id: '1',
      name: 'Sarah Johnson',
      role: 'Principal',
      organization: 'Lincoln High School',
      content: 'Mistio has been a game-changer for our school. We\'ve seen a 90% reduction in vaping incidents since installation. The real-time alerts help us respond immediately.',
      rating: 5,
      avatar: 'SJ'
    },
    {
      id: '2',
      name: 'Michael Chen',
      role: 'Facilities Manager',
      organization: 'Riverside School District',
      content: 'The installation process was seamless and the system works exactly as promised. Our staff feel much more confident in maintaining a safe environment.',
      rating: 5,
      avatar: 'MC'
    },
    {
      id: '3',
      name: 'Amanda Rodriguez',
      role: 'Dean of Students',
      organization: 'Westfield Middle School',
      content: 'Parents are thrilled with the added safety measures. Mistio helps us enforce our no-vaping policy effectively while respecting student privacy.',
      rating: 5,
      avatar: 'AR'
    },
    {
      id: '4',
      name: 'David Thompson',
      role: 'Security Director',
      organization: 'Metro School System',
      content: 'The comprehensive reporting helps us identify patterns and address issues proactively. It\'s an essential tool for modern school safety.',
      rating: 5,
      avatar: 'DT'
    },
    {
      id: '5',
      name: 'Lisa Park',
      role: 'Superintendent',
      organization: 'Green Valley Schools',
      content: 'Mistio\'s accuracy is impressive. We haven\'t had a single false positive, and the system has helped us create a healthier learning environment.',
      rating: 5,
      avatar: 'LP'
    }
  ];

  const animationConfig = {
    type: 'fade' as const,
    duration: 1,
    delay: 0.2,
    easing: 'easeOutQuart'
  };

  // Auto-rotate testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <svg
        key={i}
        className={`w-5 h-5 ${i < rating ? 'text-yellow-400' : 'text-gray-300'}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ));
  };

  return (
    <AnimatedSection id="testimonials" animationConfig={animationConfig}>
      <div ref={elementRef} className="text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-4xl md:text-5xl font-bold text-gray-900 mb-4"
        >
          What Our Clients Say
        </motion.h2>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed"
        >
          Trusted by schools and organizations nationwide to create safer, vape-free environments.
        </motion.p>

        {/* Testimonial Carousel */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-8 min-h-[300px] flex items-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTestimonial}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.5 }}
                className="w-full"
              >
                {/* Quote Icon */}
                <div className="absolute top-6 left-8">
                  <svg className="w-12 h-12 text-blue-200" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                  </svg>
                </div>

                {/* Testimonial Content */}
                <div className="text-center">
                  <p className="text-xl text-gray-700 mb-6 leading-relaxed italic">
                    "{testimonials[currentTestimonial].content}"
                  </p>
                  
                  {/* Rating */}
                  <div className="flex justify-center mb-4">
                    {renderStars(testimonials[currentTestimonial].rating)}
                  </div>
                  
                  {/* Author Info */}
                  <div className="flex items-center justify-center">
                    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold mr-4">
                      {testimonials[currentTestimonial].avatar}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-900">
                        {testimonials[currentTestimonial].name}
                      </div>
                      <div className="text-gray-600">
                        {testimonials[currentTestimonial].role}
                      </div>
                      <div className="text-sm text-blue-600">
                        {testimonials[currentTestimonial].organization}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Navigation Arrows */}
            <button
              onClick={() => setCurrentTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length)}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-blue-600 hover:shadow-xl transition-all duration-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <button
              onClick={() => setCurrentTestimonial((prev) => (prev + 1) % testimonials.length)}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-blue-600 hover:shadow-xl transition-all duration-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Dots Indicator */}
        <div className="flex justify-center space-x-2 mb-8">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentTestimonial(index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === currentTestimonial
                  ? 'bg-blue-600'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>

        {/* Statistics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="grid md:grid-cols-3 gap-8"
        >
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 mb-2">500+</div>
            <div className="text-gray-600">Schools Protected</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-green-600 mb-2">95%</div>
            <div className="text-gray-600">Customer Satisfaction</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-purple-600 mb-2">24/7</div>
            <div className="text-gray-600">Support Available</div>
          </div>
        </motion.div>
      </div>
    </AnimatedSection>
  );
};

export default TestimonialsSection;
