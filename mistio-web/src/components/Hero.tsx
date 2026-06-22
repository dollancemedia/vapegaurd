import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from './Button';

export const Hero = () => {
  return (
    <div className="relative w-full min-h-[100dvh] flex items-center overflow-hidden bg-gray-50 pt-24 lg:pt-20">
      <div className="absolute inset-0 z-0">
        <img
          src="/alternatebg1.png"
          alt="Background"
          className="w-full h-full object-cover translate-y-[35px]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/40 to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left space-y-6 max-w-lg mx-auto lg:mx-0">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-mistio-dark leading-tight tracking-tight">
            The only vape detector that runs on{' '}
            <span className="text-mistio-teal">battery.</span>
          </h1>

          <p className="text-lg text-mistio-gray leading-relaxed max-w-[50ch]">
            One year of battery life. No wires, no electrician, no IT tickets. Mount it and forget it.
          </p>

          <div className="pt-2">
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
              Book a Demo
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>

        <div className="relative flex flex-col items-center lg:items-end gap-4">
          <div className="relative w-[280px] h-[280px] sm:w-[360px] sm:h-[360px] lg:w-[440px] lg:h-[440px] animate-float">
            <img
              src="/sensor.png"
              alt="Mistio Vape Detector"
              className="relative w-full h-full object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-500 ease-out cursor-pointer hover:drop-shadow-[0_20px_50px_rgba(0,210,211,0.3)]"
              onClick={() => {
                const featuresSection = document.getElementById('features');
                if (featuresSection) {
                  featuresSection.scrollIntoView({ behavior: 'smooth' });
                }
              }}
            />
          </div>
          <div className="flex items-center gap-6 text-sm text-mistio-gray font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-mistio-teal" />
              1-year battery
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-mistio-teal" />
              No wires
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-mistio-teal" />
              Zero false alarms
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
