import React, { useState } from 'react';
import { Mail, Phone, MapPin, Calendar, Clock, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export const ContactSection = () => {
  return (
    <section id="contact" className="py-24 bg-white scroll-mt-32">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left Column: Contact Info */}
          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-bold text-mistio-dark mb-4">
                Let's Make Your School <span className="text-mistio-teal">Safer</span>
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Ready to see how Mistio can help you eliminate vaping in your school? 
                Schedule a demo or reach out to our team directly.
              </p>
            </div>

            <div className="space-y-6">
              <ContactItem 
                icon={<Mail className="w-6 h-6" />}
                title="Email Us"
                content="hello@misto.app"
                href="mailto:hello@misto.app"
              />
              <ContactItem 
                icon={<Phone className="w-6 h-6" />}
                title="Call Us"
                content="(555) 123-4567"
                href="tel:+15551234567"
              />
              <ContactItem 
                icon={<MapPin className="w-6 h-6" />}
                title="Headquarters"
                content="San Francisco, CA"
              />
            </div>
          </div>

          {/* Right Column: Dummy Calendar */}
          <div className="relative">
            {/* Calendar Card */}
            <div className="bg-white rounded-2xl shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">Schedule a Demo</h3>
                  <p className="text-sm text-slate-500">30 Minute Meeting</p>
                </div>
                <div className="flex gap-2">
                    <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ChevronLeft className="w-5 h-5 text-slate-400" />
                    </button>
                    <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                    </button>
                </div>
              </div>

              <div className="p-6 grid md:grid-cols-2 gap-8">
                {/* Calendar Grid */}
                <div>
                   <div className="text-center font-medium mb-4 text-slate-900">October 2024</div>
                   <div className="grid grid-cols-7 gap-1 text-center text-sm mb-2">
                      <span className="text-xs font-semibold text-slate-400">S</span>
                      <span className="text-xs font-semibold text-slate-400">M</span>
                      <span className="text-xs font-semibold text-slate-400">T</span>
                      <span className="text-xs font-semibold text-slate-400">W</span>
                      <span className="text-xs font-semibold text-slate-400">T</span>
                      <span className="text-xs font-semibold text-slate-400">F</span>
                      <span className="text-xs font-semibold text-slate-400">S</span>
                   </div>
                   <div className="grid grid-cols-7 gap-1 text-center text-sm">
                      {[...Array(3)].map((_, i) => <span key={`empty-${i}`} className="p-2" />)}
                      {[...Array(31)].map((_, i) => (
                        <button 
                            key={i} 
                            className={cn(
                                "p-2 rounded-full hover:bg-mistio-teal/10 hover:text-mistio-teal transition-colors",
                                i === 14 ? "bg-mistio-teal text-white hover:bg-mistio-teal hover:text-white" : "text-slate-600"
                            )}
                        >
                            {i + 1}
                        </button>
                      ))}
                   </div>
                </div>

                {/* Time Slots */}
                <div className="space-y-3">
                   <div className="text-sm font-medium text-slate-900 mb-2">Available Times</div>
                   <TimeSlot time="9:00 AM" />
                   <TimeSlot time="10:00 AM" />
                   <TimeSlot time="1:30 PM" selected />
                   <TimeSlot time="3:00 PM" />
                   <TimeSlot time="4:30 PM" />
                </div>
              </div>
              
              <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-500 flex items-center justify-center gap-2">
                    <Calendar className="w-3 h-3" />
                    Powered by Google Calendar (Integration Coming Soon)
                </p>
              </div>
            </div>
            
            {/* Decoration */}
            <div className="absolute -z-10 top-10 -right-10 w-64 h-64 bg-mistio-teal/20 rounded-full blur-3xl" />
            <div className="absolute -z-10 -bottom-10 -left-10 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
          </div>
        </div>
      </div>
    </section>
  );
};

const ContactItem = ({ icon, title, content, href }: { icon: React.ReactNode, title: string, content: string, href?: string }) => (
  <div className="flex items-center gap-4 group">
    <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-mistio-teal group-hover:bg-mistio-teal group-hover:text-white transition-colors duration-300">
      {icon}
    </div>
    <div>
      <h4 className="font-semibold text-slate-900">{title}</h4>
      {href ? (
        <a href={href} className="text-slate-500 hover:text-mistio-teal transition-colors">
          {content}
        </a>
      ) : (
        <p className="text-slate-500">{content}</p>
      )}
    </div>
  </div>
);

const TimeSlot = ({ time, selected }: { time: string, selected?: boolean }) => (
    <button className={cn(
        "w-full py-2 px-4 rounded-lg border text-sm font-medium transition-all duration-200 flex items-center justify-between",
        selected 
            ? "border-mistio-teal bg-mistio-teal/5 text-mistio-teal ring-1 ring-mistio-teal" 
            : "border-slate-200 text-slate-600 hover:border-mistio-teal hover:text-mistio-teal"
    )}>
        {time}
        {selected && <Check className="w-4 h-4" />}
    </button>
)
