import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from './Button';

export const Hero = () => {
  return (
    <div className="relative w-full min-h-screen flex items-center overflow-hidden bg-gray-50 pt-32 lg:pt-20">
      {/* Background Image Layer */}
      <div className="absolute inset-0 z-0">
        <img
          src="/alternatebg1.png"
          alt="Background"
          className="w-full h-full object-cover translate-x-[0px] translate-y-[35px]"
        />
        {/* Gradient overlay to ensure text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/40 to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left Content */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left space-y-6 max-w-lg mx-auto lg:mx-0">
          <h1 className="text-5xl md:text-6xl font-bold text-mistio-dark leading-tight tracking-tight">
            Eliminate Vaping <br />
            <span className="text-mistio-teal">in Your School</span>
          </h1>
          
          <p className="text-xl text-mistio-gray leading-relaxed">
            Mistio empowers administrators with real-time detection to reclaim bathrooms, protect student health, and restore a safe learning environment.
          </p>

          <div className="pt-4">
            <Button 
              variant="gradient" 
              size="lg" 
              className="group pl-8 pr-6"
              onClick={() => {
                const contactSection = document.getElementById('contact');
                if (contactSection) {
                  contactSection.scrollIntoView({ behavior: 'smooth' });
                }
              }}
            >
              Get Started
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>

        {/* Right Visual */}
        <div className="relative flex justify-center lg:justify-end">
          <div className="relative w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] lg:w-[500px] lg:h-[500px] animate-float">
            
            <img
              src="/sensor.png"
              alt="Mistio Vape Detector"
              className="relative w-full h-full object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-500 ease-out cursor-pointer hover:drop-shadow-[0_20px_50px_rgba(0,210,211,0.3)] lg:-translate-x-[30px]"
              onClick={() => {
                const featuresSection = document.getElementById('features');
                if (featuresSection) {
                  featuresSection.scrollIntoView({ behavior: 'smooth' });
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};