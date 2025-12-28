'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
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
    easing: 'easeOut'
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
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          viewport={{ once: true }}
          className="text-4xl md:text-5xl font-bold text-gray-900 mb-4"
        >
          Trusted by Educators
        </motion.h2>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          viewport={{ once: true }}
          className="text-xl text-gray-600 mb-16 max-w-3xl mx-auto leading-relaxed"
        >
          See what school administrators and facility managers are saying about Mistio.
        </motion.p>

        <div className="relative max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-12 min-h-[400px] flex items-center justify-center">
          {/* Quote Icon Background */}
          <div className="absolute top-8 left-8 text-blue-100">
            <svg className="w-24 h-24 opacity-50" fill="currentColor" viewBox="0 0 32 32">
              <path d="M10 8c-3.3 0-6 2.7-6 6v10h10V14H6c0-2.2 1.8-4 4-4V8zM26 8c-3.3 0-6 2.7-6 6v10h10V14h-8c0-2.2 1.8-4 4-4V8z" />
            </svg>
          </div>

          <div className="relative z-10 w-full">
             {testimonials.map((testimonial, index) => (
               index === currentTestimonial && (
                 <motion.div
                   key={testimonial.id}
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   transition={{ duration: 0.5 }}
                   className="flex flex-col items-center"
                 >
                   <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-6">
                     {testimonial.avatar}
                   </div>
                   
                   <p className="text-xl md:text-2xl text-gray-700 italic mb-8 text-center leading-relaxed">
                     "{testimonial.content}"
                   </p>
                   
                   <div className="flex space-x-1 mb-4">
                     {renderStars(testimonial.rating)}
                   </div>
                   
                   <h4 className="text-lg font-bold text-gray-900">{testimonial.name}</h4>
                   <p className="text-blue-600 font-medium">{testimonial.role}</p>
                   <p className="text-gray-500 text-sm">{testimonial.organization}</p>
                 </motion.div>
               )
             ))}
          </div>

          {/* Navigation Dots */}
          <div className="absolute bottom-6 left-0 right-0 flex justify-center space-x-2">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentTestimonial(index)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  index === currentTestimonial ? 'bg-blue-600 w-6' : 'bg-gray-300'
                }`}
                aria-label={`Go to testimonial ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </AnimatedSection>
  );
};

export default TestimonialsSection;
