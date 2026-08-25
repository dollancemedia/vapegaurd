'use client';

import { Mail } from 'lucide-react';

export const ContactSection = () => {
  return (
    <section id="contact" className="py-24 bg-white scroll-mt-32">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <div>
            <h2 className="text-4xl font-bold text-mistio-dark mb-4">
              See It <span className="text-mistio-teal">For Yourself</span>
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              We&apos;ll send you a sensor. Mount it in a bathroom. No wiring, no IT. See how it performs before you commit.
            </p>
          </div>

          <a
            href="mailto:contact@mistio.app"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-mistio-teal text-white font-semibold text-lg hover:bg-mistio-teal/90 transition-colors duration-300 shadow-lg shadow-mistio-teal/20"
          >
            <Mail className="w-6 h-6" />
            contact@mistio.app
          </a>
        </div>
      </div>
    </section>
  );
};
