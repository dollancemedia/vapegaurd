'use client';

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export const BouncyCardsFeatures = () => {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 text-slate-800 relative">
      <div className="mb-8 flex flex-col items-center text-center justify-between gap-4 md:flex-row md:items-end md:text-left md:px-8">
        <h2 className="max-w-2xl text-4xl font-bold md:text-5xl">
          Why Schools Switch to <span className="text-slate-400">Mistio</span>
        </h2>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="whitespace-nowrap rounded-lg bg-mistio-teal px-4 py-2 font-medium text-white shadow-xl transition-colors hover:bg-teal-600"
          onClick={() => {
            const el = document.getElementById('testimonials');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          See It in Action
        </motion.button>
      </div>
      <div className="mb-4 grid grid-cols-12 gap-4">
        <FlipCardWrapper
          id="card-1"
          className="col-span-12 md:col-span-4 flex flex-col justify-end pb-4"
          backContent={
            <div className="p-8 md:p-12">
              <h3 className="text-3xl font-bold mb-6 text-mistio-dark">1-Year Battery Life</h3>
              <div className="space-y-6 text-lg text-slate-600">
                <p>The only vape detector on the market that runs on battery for a full year. No wires, no electrician, no IT tickets.</p>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">No Wiring:</strong> Every competitor requires PoE cables run through ceilings. Mistio doesn't.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">No Electrician:</strong> Skip the IT tickets, switch upgrades, and contractor scheduling.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">Set and Forget:</strong> Install it in September, replace the battery next September. That's it.</span>
                  </li>
                </ul>
              </div>
            </div>
          }
        >
          <BounceCard className="w-full h-full">
            <div className="absolute top-4 w-full text-center z-10 -translate-x-8">
              <CardTitle>1-Year Battery</CardTitle>
            </div>
            <div className="absolute inset-0 flex items-center justify-center -translate-y-8">
              <img src="/icons/notification.png" alt="Battery powered sensor" className="w-56 h-56 object-contain drop-shadow-xl z-20 group-hover:scale-110 transition-transform duration-300" />
            </div>
            <div className="absolute bottom-4 left-4 right-4 translate-y-6 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 p-4 transition-transform duration-[250ms] group-hover:translate-y-2 group-hover:rotate-[2deg] z-30">
              <div className="flex flex-col items-start justify-center h-full text-orange-50">
                <span className="block text-center w-full text-lg font-bold leading-tight">No wires. No electrician.<br/>Just battery power.</span>
              </div>
            </div>
          </BounceCard>
        </FlipCardWrapper>

        <FlipCardWrapper
          id="card-2"
          className="col-span-12 md:col-span-8"
          backContent={
            <div className="p-8 md:p-12">
              <h3 className="text-3xl font-bold mb-6 text-mistio-dark">Trained to Ignore What Isn't Vape</h3>
              <div className="space-y-6 text-lg text-slate-600">
                <p>Other detectors cry wolf. A student sprays Axe, alarm. A janitor mops with bleach, alarm. Staff stops trusting it. Mistio is different.</p>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">Cologne & Deodorant:</strong> Our AI was trained on body sprays, perfumes, and aerosol deodorants. It knows the difference.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">Cleaning Products:</strong> Bleach, disinfectant spray, glass cleaner. None of them trigger a Mistio alert.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">Hair Spray & Aerosols:</strong> Trained on real-world bathroom aerosols so your staff only responds to real incidents.</span>
                  </li>
                </ul>
              </div>
            </div>
          }
        >
          <BounceCard className="w-full h-full overflow-hidden">
            <div className="absolute top-4 w-full text-center z-10 -translate-x-8 md:hidden">
              <h3 className="mx-auto text-center text-2xl font-semibold">Zero False Alarms</h3>
            </div>
            <div className="hidden md:block absolute top-1/2 left-8 -translate-y-full z-10 max-w-[50%]">
              <h3 className="text-left text-4xl font-semibold leading-tight">Zero False Alarms</h3>
            </div>
            <div className="absolute inset-0 flex items-center justify-center -translate-y-8 md:hidden">
              <img src="/icons/fast-detection.png" alt="Fast Detection" className="w-56 h-56 object-contain drop-shadow-xl z-20 group-hover:scale-110 transition-transform duration-300" />
            </div>
            <img src="/icons/fast-detection.png" alt="Fast Detection" className="hidden md:block absolute -right-8 -top-24 w-[28rem] h-[28rem] object-contain drop-shadow-xl z-20 group-hover:scale-110 transition-transform duration-300" />
            <div className="absolute bottom-4 left-4 right-4 translate-y-2 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 p-4 transition-transform duration-[250ms] group-hover:translate-y-0 group-hover:rotate-[2deg] z-30">
              <div className="flex flex-col items-start justify-center h-full text-white">
                <span className="block text-center w-full text-xl font-bold leading-tight">Cologne, cleaning spray, deodorant?<br/>Silence. Vape? Instant alert.</span>
              </div>
            </div>
          </BounceCard>
        </FlipCardWrapper>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <FlipCardWrapper
          id="card-3"
          className="col-span-12 md:col-span-8"
          backContent={
            <div className="p-8 md:p-12">
              <h3 className="text-3xl font-bold mb-6 text-mistio-dark">3-Second Install</h3>
              <div className="space-y-6 text-lg text-slate-600">
                <p>Other detectors need PoE cables, ceiling work, an electrician, an IT ticket, and weeks of scheduling. Mistio needs a custodian and 3 seconds.</p>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">Two Screws:</strong> Drill it into the wall in under a minute. No ceiling access, no cable routing.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">No IT Required:</strong> Connects over cellular. No Wi-Fi drops in concrete bathrooms to worry about.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">Scale Instantly:</strong> Cover one bathroom today, the whole building tomorrow. No infrastructure changes needed.</span>
                  </li>
                </ul>
              </div>
            </div>
          }
        >
          <BounceCard className="w-full h-full overflow-hidden">
            <div className="absolute top-4 w-full text-center z-10 -translate-x-8 md:hidden">
              <h3 className="mx-auto text-center text-2xl font-semibold">3-Second Install</h3>
            </div>
            <div className="hidden md:block absolute top-1/2 left-8 -translate-y-[120%] z-10 max-w-[50%]">
              <h3 className="text-left text-4xl font-semibold leading-tight">3-Second Install</h3>
            </div>
            <div className="absolute inset-0 flex items-center justify-center -translate-y-8 md:hidden">
              <img src="/icons/connected-devices.png" alt="Connected Devices" className="w-56 h-56 object-contain drop-shadow-xl z-40 group-hover:scale-110 transition-transform duration-300" />
            </div>
            <img src="/icons/connected-devices.png" alt="Connected Devices" className="hidden md:block absolute -right-8 -top-24 w-[28rem] h-[28rem] object-contain drop-shadow-xl z-40 group-hover:scale-110 transition-transform duration-300" />
            <div className="absolute bottom-4 left-4 right-4 translate-y-2 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-400 p-4 transition-transform duration-[250ms] group-hover:translate-y-0 group-hover:rotate-[2deg] z-30">
              <div className="flex flex-col items-start justify-center h-full text-emerald-50">
                <span className="block text-center w-full text-xl font-bold leading-tight">Two screws. One minute.<br/>You're done.</span>
              </div>
            </div>
          </BounceCard>
        </FlipCardWrapper>

        <FlipCardWrapper
          id="card-4"
          className="col-span-12 md:col-span-4 flex flex-col justify-end pb-4"
          backContent={
            <div className="p-8 md:p-12">
              <h3 className="text-3xl font-bold mb-6 text-mistio-dark">Built for Schools, Not Server Rooms</h3>
              <div className="space-y-6 text-lg text-slate-600">
                <p>Mistio was designed for the realities of K-12. Tight budgets, busy staff, and students who will try to tamper with anything on the wall.</p>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">Privacy First:</strong> No cameras. No microphones. Monitors air quality only.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">Tamper-Resistant:</strong> Ruggedized casing with tamper alerts if a student tries to remove or cover it.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                    <span><strong className="text-slate-900">Budget-Friendly:</strong> No infrastructure costs. No ongoing license fees. One sensor, one price.</span>
                  </li>
                </ul>
              </div>
            </div>
          }
        >
          <BounceCard className="w-full h-full">
            <div className="absolute top-4 w-full text-center z-10 -translate-x-8">
              <CardTitle>Built for Schools</CardTitle>
            </div>
            <div className="absolute inset-0 flex items-center justify-center -translate-y-8">
              <img src="/icons/school.png" alt="School" className="w-56 h-56 object-contain drop-shadow-xl z-20 group-hover:scale-110 transition-transform duration-300" />
            </div>
            <div className="absolute bottom-4 left-4 right-4 translate-y-6 rounded-2xl bg-gradient-to-br from-pink-400 to-red-400 p-4 transition-transform duration-[250ms] group-hover:translate-y-2 group-hover:rotate-[2deg] z-30">
              <div className="flex flex-col items-start justify-center h-full text-red-50">
                <span className="block text-center w-full text-lg font-bold leading-tight">No cameras. No mics.<br/>No license fees.</span>
              </div>
            </div>
          </BounceCard>
        </FlipCardWrapper>
      </div>
    </section>
  );
};

const FlipCardWrapper = ({ children, backContent, className, id }: { children: React.ReactNode; backContent: React.ReactNode; className?: string; id: string }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className={`relative perspective-1000 ${className}`}>
      <AnimatePresence>
        {isFlipped && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setIsFlipped(false); }} />
            <motion.div layoutId={`flip-card-${id}`} className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div className="relative w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl cursor-default" onClick={(e) => e.stopPropagation()} initial={{ rotateY: -180 }} animate={{ rotateY: 0 }} exit={{ rotateY: -180, opacity: 0 }} transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}>
                <button onClick={() => setIsFlipped(false)} className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors z-50">
                  <X className="w-6 h-6 text-slate-600" />
                </button>
                {backContent}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {!isFlipped && (
        <motion.div layoutId={`flip-card-${id}`} onClick={() => setIsFlipped(true)} className="h-full">
          {children}
        </motion.div>
      )}
    </div>
  );
};

const BounceCard = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <motion.div whileHover={{ scale: 0.95, rotate: "-1deg" }} className={`group relative min-h-[300px] cursor-pointer rounded-2xl bg-slate-100 p-8 ${className}`}>
    {children}
  </motion.div>
);

const CardTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mx-auto text-center text-2xl md:text-3xl font-semibold">{children}</h3>
);
