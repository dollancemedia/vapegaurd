import React, { useState } from 'react';
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
    title: 'Vaping Is a School-Wide Problem',
    content: [
      '~30% of high school students report trying vaping',
      'Incidents occur daily in unsupervised spaces'
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=2064&auto=format&fit=crop', // School hallway/students
  },
  {
    id: 2,
    title: 'Academic Performance Suffers',
    content: [
      'Vaping is associated with a ~1.2-point lower GPA',
      'Disrupted focus, absenteeism, and disengagement rise'
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?q=80&w=2070&auto=format&fit=crop', // Library/Study
  },
  {
    id: 3,
    title: 'Classrooms Are Repeatedly Disrupted',
    content: [
      'Vape-triggered alarms halt instruction',
      '~10+ minutes lost per incident',
      'Tests, lessons, and schedules are interrupted'
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1509062522246-3755977927d7?q=80&w=2070&auto=format&fit=crop', // Classroom
  },
  {
    id: 4,
    title: 'Emergency Resources Are Wasted',
    content: [
      'Fire departments respond to non-emergencies',
      'Time, fuel, and personnel diverted from real threats',
      'Repeated false calls strain public resources'
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1555529902-5261145633bf?q=80&w=2070&auto=format&fit=crop', // Fire truck/Emergency
  },
  {
    id: 5,
    title: 'No Visibility Means No Accountability',
    content: [
      'Schools don’t know where or when vaping occurs',
      'Incidents repeat in bathrooms and locker rooms',
      'Lack of detection enables continued disruption'
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1596526131083-e8c633c948d2?q=80&w=1974&auto=format&fit=crop', // Fog/Mist/Hidden
  },
];

function AccordionItem({
  item,
  isActive,
  onMouseEnter,
}: {
  item: AccordionItemData;
  isActive: boolean;
  onMouseEnter: () => void;
}) {
  return (
    <div
      className={`
        relative h-[550px] rounded-2xl overflow-hidden cursor-pointer
        transition-all duration-700 ease-in-out
        ${isActive ? 'w-[500px]' : 'w-[80px]'}
      `}
      onMouseEnter={onMouseEnter}
    >
      <img
        src={item.imageUrl}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-110"
        onError={(e) => {
          const target = e.currentTarget as HTMLImageElement;
          target.src = 'https://placehold.co/400x450/0f172a/ffffff?text=Mistio';
        }}
      />
      <div className={`absolute inset-0 bg-mistio-dark transition-opacity duration-300 ${isActive ? 'bg-opacity-60' : 'bg-opacity-40'}`} />
      
      <AnimatePresence mode="wait">
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
            className="absolute bottom-0 left-0 p-6 text-white w-[500px]"
          >
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
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute text-white text-base font-semibold whitespace-nowrap
              left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 origin-center"
          >
            {item.title}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LandingAccordionItem() {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const handleItemHover = (index: number) => {
    setActiveIndex(index);
  };

  return (
    <div className="bg-white font-sans">
      <section className="container mx-auto px-4 py-12 md:py-24">
        <div className="flex flex-col lg:flex-row items-start justify-between gap-12">
          <div className="w-full lg:w-1/3 text-center lg:text-left pt-8">
            <h1 className="text-4xl md:text-5xl font-bold text-mistio-dark leading-tight tracking-tight mb-6">
              The Hidden Cost of <span className="text-mistio-teal">Vaping</span> in Schools
            </h1>
            <p className="text-lg text-mistio-gray leading-relaxed">
              Vaping doesn't just affect student health—it disrupts classrooms, strains emergency services, and undermines school operations.
            </p>
            <div className="mt-8">
              <a
                href="#contact"
                className="inline-block bg-mistio-dark text-white font-semibold px-8 py-3 rounded-lg shadow-lg hover:bg-slate-800 transition-colors duration-300"
                onClick={(e) => {
                  e.preventDefault();
                  const contactSection = document.getElementById('contact');
                  if (contactSection) {
                    contactSection.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
              >
                Get a Quote
              </a>
            </div>
          </div>

          <div className="w-full lg:w-2/3 flex justify-center lg:justify-end">
            <div className="flex flex-row items-center justify-center gap-2 overflow-hidden p-2">
              {accordionItems.map((item, index) => (
                <AccordionItem
                  key={item.id}
                  item={item}
                  isActive={index === activeIndex}
                  onMouseEnter={() => handleItemHover(index)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

