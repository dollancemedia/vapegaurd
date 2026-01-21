import React from 'react';
import { Mail, Phone, MapPin } from 'lucide-react';
import { InlineWidget } from 'react-calendly';
import { cn } from '../lib/utils';

export const ContactSection = () => {
  return (
    <section id="contact" className="py-24 bg-white scroll-mt-32">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left Column: Contact Info */}
          <div className="space-y-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <div>
              <h2 className="text-4xl font-bold text-mistio-dark mb-4">
                Let's Make Your School <span className="text-mistio-teal">Safer</span>
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed max-w-lg mx-auto lg:mx-0">
                Ready to see how Mistio can help you eliminate vaping in your school? 
                Schedule a demo or reach out to our team directly.
              </p>
            </div>

            <div className="space-y-6 w-full max-w-md lg:max-w-none">
              <ContactItem 
                icon={<Mail className="w-6 h-6" />}
                title="Email Us"
                content="contact@mistio.app"
                href="mailto:contact@mistio.app"
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

          {/* Right Column: Calendly Widget */}
          <div className="relative">
            {/* Calendar Card */}
            <div className="bg-white rounded-2xl shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden min-h-[500px]">
              <InlineWidget 
                url="https://calendly.com/rahul-mistio/30min" 
                styles={{
                  height: '600px',
                  width: '100%',
                }}
                prefill={{
                  email: 'school-admin@example.com',
                  name: 'School Administrator',
                }}
              />
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
  <div className="flex items-center gap-4 group justify-center lg:justify-start text-left">
    <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-mistio-teal group-hover:bg-mistio-teal group-hover:text-white transition-colors duration-300 flex-shrink-0">
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
