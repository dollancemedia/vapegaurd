'use client';

import { useState } from 'react';

const faqs = [
  {
    question: 'How long does the Mistio vape detector battery last?',
    answer:
      'Mistio runs on battery for a full year. No wiring, no charging, no electrician needed. When the battery runs out after one school year, simply replace it — takes under a minute.',
  },
  {
    question: 'Does Mistio go off for cologne, deodorant, or cleaning spray?',
    answer:
      'No. Mistio uses AI trained on hundreds of real-world samples of Axe body spray, cologne, deodorant, cleaning products, and hair spray. It learned the difference between vape aerosol and everyday bathroom products at a molecular level. When Mistio alerts, it is real.',
  },
  {
    question: 'How long does installation take?',
    answer:
      'Under one minute per sensor. Mount it to the wall or ceiling with two screws. No cables, no ceiling work, no IT involvement, no electrician. A custodian can install 20 sensors in a single morning.',
  },
  {
    question: 'Does Mistio need WiFi or internet access?',
    answer:
      'No. Mistio uses cellular connectivity built into the sensor. It does not need access to your school WiFi network, which eliminates IT approval delays and network security concerns.',
  },
  {
    question: 'Does Mistio have cameras or microphones?',
    answer:
      'No. Mistio measures air quality only. There are no cameras, microphones, or recording devices of any kind. It is fully privacy-compliant for bathrooms and locker rooms.',
  },
  {
    question: 'How is Mistio different from HALO or Verkada?',
    answer:
      'Mistio is the only battery-powered vape detector with year-long battery life. Competitors like HALO and Verkada require PoE cabling, electricians, and IT involvement — adding $200-$2,000 per sensor in installation costs. Mistio also has a significantly lower false alarm rate because its AI is specifically trained on common triggers like cologne and cleaning spray.',
  },
  {
    question: 'How quickly does Mistio alert when vaping is detected?',
    answer:
      'Within 30-60 seconds of a vaping event. The AI analyzes sensor readings over a 30-second window to confirm the event is real vape (not cologne or dust), then sends an instant push notification to administrators.',
  },
  {
    question: 'Can students defeat the sensor?',
    answer:
      'Vape aerosol disperses throughout a closed bathroom within seconds regardless of where someone exhales. A ceiling-mounted Mistio sensor in a standard school bathroom is extremely difficult to defeat because the particles rise and spread to fill the space.',
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-20 px-4 bg-slate-50">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 mb-4">
          Frequently Asked Questions
        </h2>
        <p className="text-center text-slate-600 mb-12">
          Everything schools ask before choosing Mistio.
        </p>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full px-6 py-5 text-left flex items-center justify-between gap-4"
              >
                <span className="font-semibold text-slate-900 text-lg">
                  {faq.question}
                </span>
                <svg
                  className={`w-5 h-5 text-slate-500 shrink-0 transition-transform ${
                    openIndex === i ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {openIndex === i && (
                <div className="px-6 pb-5">
                  <p className="text-slate-600 leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
