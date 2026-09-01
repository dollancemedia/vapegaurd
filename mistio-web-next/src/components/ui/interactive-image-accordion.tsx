'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type AccordionItemData = {
  id: number;
  title: string;
  content: string[];
  imageUrl: string;
};

const accordionItems: AccordionItemData[] = [
  {
    id: 1,
    title: 'False Alarms Kill Trust',
    content: [
      'Cologne, cleaning spray, or deodorant triggers an alarm',
      'Staff responds 3 times, then stops responding altogether',
      'The detector becomes expensive wall decor'
    ],
    imageUrl: '/images/false-alarms.jpg',
  },
  {
    id: 2,
    title: 'Installation Takes Weeks',
    content: [
      'PoE detectors need electricians, ceiling work, and IT tickets',
      'Bathrooms often lack ethernet, requiring new cable runs',
      'Weeks of procurement before a single sensor goes live'
    ],
    imageUrl: '/images/installation.jpg',
  },
  {
    id: 3,
    title: 'Wi-Fi Drops in Bathrooms',
    content: [
      'Concrete walls and metal stalls block Wi-Fi signal',
      'Sensors lose connection and miss real incidents',
      'IT spends hours troubleshooting dead zones'
    ],
    imageUrl: '/images/wifi-drops.jpg',
  },
  {
    id: 4,
    title: 'Hidden Costs Add Up',
    content: [
      'License fees, cloud subscriptions, and maintenance contracts',
      'Electrician costs for every new sensor location',
      'IT overhead for network configuration and updates'
    ],
    imageUrl: '/images/hidden-costs.jpg',
  },
  {
    id: 5,
    title: 'Students Still Vape Undetected',
    content: [
      'After enough false alarms, staff ignores every alert',
      'Without reliable detection, there is zero accountability',
      'The vaping problem grows while the sensor sits ignored'
    ],
    imageUrl: '/images/undetected.jpg',
  },
];

function AccordionItem({ item, isActive, onMouseEnter, onClick }: { item: AccordionItemData; isActive: boolean; onMouseEnter: () => void; onClick: () => void }) {
  return (
    <div
      className={`relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-700 ease-in-out w-full md:h-[550px] ${isActive ? 'h-[400px] md:w-[500px]' : 'h-[80px] md:w-[80px]'}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <img
        src={item.imageUrl}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-110"
        loading="lazy"
      />
      <div className={`absolute inset-0 bg-mistio-dark transition-opacity duration-300 ${isActive ? 'bg-opacity-60' : 'bg-opacity-40'}`} />

      <AnimatePresence mode="wait">
        {isActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }} className="absolute bottom-0 left-0 p-6 text-white w-full">
            <h3 className="text-xl font-bold mb-2 leading-tight">{item.title}</h3>
            <ul className="space-y-1">
              {item.content.map((line, idx) => (
                <li key={idx} className="text-sm text-gray-200 flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-mistio-teal shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isActive && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="absolute text-white text-base font-semibold whitespace-nowrap left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:rotate-90 md:origin-center">
            {item.title}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LandingAccordionItem() {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  return (
    <div className="bg-white font-sans">
      <section className="container mx-auto px-4 py-12 md:py-24">
        <div className="flex flex-col lg:flex-row items-start justify-between gap-12">
          <div className="w-full lg:w-1/3 text-center lg:text-left pt-8">
            <h2 className="text-4xl md:text-5xl font-bold text-mistio-dark leading-tight tracking-tight mb-6">
              The Problem With <span className="text-mistio-teal">Current</span> Detection
            </h2>
            <p className="text-lg text-mistio-gray leading-relaxed">
              Most schools either have no detection at all, or sensors that go off every time someone sprays deodorant. Both leave you blind.
            </p>
            <div className="mt-8">
              <a
                href="#contact"
                className="inline-block bg-mistio-dark text-white font-semibold px-8 py-3 rounded-lg shadow-lg hover:bg-slate-800 transition-colors duration-300"
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById('contact');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Book a Demo
              </a>
            </div>
          </div>

          <div className="w-full lg:w-2/3 flex justify-center lg:justify-end">
            <div className="flex flex-col md:flex-row items-center justify-center gap-2 overflow-hidden p-2 w-full">
              {accordionItems.map((item, index) => (
                <AccordionItem key={item.id} item={item} isActive={index === activeIndex} onMouseEnter={() => setActiveIndex(index)} onClick={() => setActiveIndex(index)} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
