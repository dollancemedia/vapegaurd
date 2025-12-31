import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export const BouncyCardsFeatures = () => {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 text-slate-800 relative">
      <div className="mb-8 flex flex-col items-center text-center justify-between gap-4 md:flex-row md:items-end md:text-left md:px-8">
        <h2 className="max-w-2xl text-4xl font-bold md:text-5xl">
          Smarter Schools with <span className="text-slate-400">Mistio</span>
        </h2>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="whitespace-nowrap rounded-lg bg-mistio-teal px-4 py-2 font-medium text-white shadow-xl transition-colors hover:bg-teal-600"
        >
          View all features
        </motion.button>
      </div>
      <div className="mb-4 grid grid-cols-12 gap-4">
        <FlipCardWrapper
          id="card-1"
          className="col-span-12 md:col-span-4 flex flex-col justify-end pb-4"
          backContent={
            <div className="p-8 md:p-12">
               <h3 className="text-3xl font-bold mb-6 text-mistio-dark">Real-Time Incident Reporting</h3>
               <div className="space-y-6 text-lg text-slate-600">
                  <p>
                     Empower your staff with actionable intelligence. Mistio delivers instant notifications the moment a vaping incident is detected.
                  </p>
                  <ul className="space-y-4">
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Instant Alerts:</strong> Receive SMS, Email, or App notifications within seconds of detection.</span>
                      </li>
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Precise Location:</strong> Know exactly which bathroom and which stall needs attention.</span>
                      </li>
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Digital Logbook:</strong> All events are time-stamped and logged for disciplinary records and trend analysis.</span>
                      </li>
                  </ul>
               </div>
            </div>
          }
        >
          <BounceCard className="w-full h-full">
            <div className="absolute top-4 w-full text-center z-10 -translate-x-8">
              <CardTitle>Clean, Actionable Alerts</CardTitle>
            </div>
            <div className="absolute inset-0 flex items-center justify-center -translate-y-8">
              <img 
                src="/icons/notification.png" 
                alt="Notifications" 
                className="w-56 h-56 object-contain drop-shadow-xl z-20 group-hover:scale-110 transition-transform duration-300" 
              />
            </div>
            <div className="absolute bottom-4 left-4 right-4 translate-y-6 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 p-4 transition-transform duration-[250ms] group-hover:translate-y-2 group-hover:rotate-[2deg] z-30">
               <div className="flex flex-col items-start justify-center h-full text-orange-50">
                  <span className="block text-center w-full text-lg font-bold leading-tight">
                  Clear notifications showing<br/>exactly what and where.
                  </span>
              </div>
            </div>
          </BounceCard>
        </FlipCardWrapper>
        
        <FlipCardWrapper
          id="card-2"
          className="col-span-12 md:col-span-8"
          backContent={
            <div className="p-8 md:p-12">
               <h3 className="text-3xl font-bold mb-6 text-mistio-dark">Fast Vape Detection Technology</h3>
               <div className="space-y-6 text-lg text-slate-600">
                  <p>
                     Our advanced sensors use machine learning algorithms to distinguish between vape aerosol and other common particles like steam, dust, or cleaning products.
                  </p>
                  <ul className="space-y-4">
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Multi-Sensor Fusion:</strong> Combines particulate matter, VOC, and environmental data for 99% accuracy.</span>
                      </li>
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Instant Analysis:</strong> Edge computing processes readings locally to trigger alerts in under 5 seconds.</span>
                      </li>
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Zero False Positives:</strong> Calibrated to ignore humidity spikes from showers or aerosols from deodorants.</span>
                      </li>
                  </ul>
                  <div className="pt-6">
                      <p className="text-sm text-slate-400 italic">
                          Trusted by over 500 schools nationwide to keep bathrooms safe.
                      </p>
                  </div>
               </div>
            </div>
          }
        >
          <BounceCard className="w-full h-full">
            <div className="absolute top-4 w-full text-center z-10 -translate-x-8 md:hidden">
              <h3 className="mx-auto text-center text-2xl font-semibold">Fast Vape Detection</h3>
            </div>
            <div className="hidden md:block absolute top-1/2 left-8 -translate-y-full z-10 max-w-[50%]">
              <h3 className="text-left text-4xl font-semibold leading-tight">Fast Vape Detection</h3>
            </div>
            <div className="absolute inset-0 flex items-center justify-center -translate-y-8 md:hidden">
              <img 
                src="/icons/fast-detection.png" 
                alt="Fast Detection" 
                className="w-56 h-56 object-contain drop-shadow-xl z-20 group-hover:scale-110 transition-transform duration-300" 
              />
            </div>
            <img 
              src="/icons/fast-detection.png" 
              alt="Fast Detection" 
              className="hidden md:block absolute -right-8 -top-24 w-[28rem] h-[28rem] object-contain drop-shadow-xl z-20 group-hover:scale-110 transition-transform duration-300" 
            />
            <div className="absolute bottom-4 left-4 right-4 translate-y-2 rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-400 p-4 transition-transform duration-[250ms] group-hover:translate-y-0 group-hover:rotate-[2deg] z-30">
              <div className="flex flex-col items-start justify-center h-full text-indigo-50">
                  <span className="block text-center w-full text-xl font-bold leading-tight">
                  Detects vape aerosol within seconds.
                  </span>
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
               <h3 className="text-3xl font-bold mb-6 text-mistio-dark">Comprehensive Coverage</h3>
               <div className="space-y-6 text-lg text-slate-600">
                  <p>
                     Mistio fits seamlessly into your existing infrastructure. Whether you need to cover one hallway or an entire district, we scale with you.
                  </p>
                  <ul className="space-y-4">
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Connectivity:</strong> Supports both Wi-Fi and Cellular options for reliable uptime.</span>
                      </li>
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Integrations:</strong> Connects with major VMS (Video Management Systems) and Access Control platforms.</span>
                      </li>
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Any Device:</strong> Alerts are delivered to smartphones, desktops, tablets, and even digital radios.</span>
                      </li>
                  </ul>
               </div>
            </div>
          }
        >
          <BounceCard className="w-full h-full">
            <div className="absolute top-4 w-full text-center z-10 -translate-x-8 md:hidden">
              <h3 className="mx-auto text-center text-2xl font-semibold">Works Everywhere</h3>
            </div>
            <div className="hidden md:block absolute top-1/2 left-8 -translate-y-[120%] z-10 max-w-[50%]">
              <h3 className="text-left text-4xl font-semibold leading-tight">Works Everywhere</h3>
            </div>
            <div className="absolute inset-0 flex items-center justify-center -translate-y-8 md:hidden">
              <img 
                src="/icons/connected-devices.png" 
                alt="Connected Devices" 
                className="w-56 h-56 object-contain drop-shadow-xl z-40 group-hover:scale-110 transition-transform duration-300" 
              />
            </div>
            <img 
              src="/icons/connected-devices.png" 
              alt="Connected Devices" 
              className="hidden md:block absolute -right-8 -top-24 w-[28rem] h-[28rem] object-contain drop-shadow-xl z-40 group-hover:scale-110 transition-transform duration-300" 
            />
            <div className="absolute bottom-4 left-4 right-4 translate-y-2 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-400 p-4 transition-transform duration-[250ms] group-hover:translate-y-0 group-hover:rotate-[2deg] z-30">
               <div className="flex flex-col items-start justify-center h-full text-emerald-50">
                  <span className="block text-center w-full text-xl font-bold leading-tight">
                  Alerts on phones, desktops,<br/>and walkie-talkies.
                  </span>
              </div>
            </div>
          </BounceCard>
        </FlipCardWrapper>
        
        <FlipCardWrapper
          id="card-4"
          className="col-span-12 md:col-span-4 flex flex-col justify-end pb-4"
          backContent={
            <div className="p-8 md:p-12">
               <h3 className="text-3xl font-bold mb-6 text-mistio-dark">Designed for Education</h3>
               <div className="space-y-6 text-lg text-slate-600">
                  <p>
                     We understand the unique challenges of the K-12 environment. Mistio is built to be rugged, discreet, and privacy-compliant.
                  </p>
                  <ul className="space-y-4">
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Privacy First:</strong> No cameras or microphones. Monitors air quality only.</span>
                      </li>
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Tamper-Proof:</strong> Ruggedized casing resists vandalism and attempts to disable the device.</span>
                      </li>
                      <li className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-mistio-teal shrink-0" />
                          <span><strong className="text-slate-900">Easy Install:</strong> PoE (Power over Ethernet) support makes deployment simple and cost-effective.</span>
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
              <img 
                src="/icons/school.png" 
                alt="School" 
                className="w-56 h-56 object-contain drop-shadow-xl z-20 group-hover:scale-110 transition-transform duration-300" 
              />
            </div>
            <div className="absolute bottom-4 left-4 right-4 translate-y-6 rounded-2xl bg-gradient-to-br from-pink-400 to-red-400 p-4 transition-transform duration-[250ms] group-hover:translate-y-2 group-hover:rotate-[2deg] z-30">
               <div className="flex flex-col items-start justify-center h-full text-red-50">
                  <span className="block text-center w-full text-lg font-bold leading-tight">
                  Privacy-first monitoring<br/>for K-12.
                  </span>
              </div>
            </div>
          </BounceCard>
        </FlipCardWrapper>
      </div>
    </section>
  );
};

const FlipCardWrapper = ({ 
  children, 
  backContent, 
  className,
  id 
}: { 
  children: React.ReactNode, 
  backContent: React.ReactNode, 
  className?: string,
  id: string
}) => {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className={`relative perspective-1000 ${className}`}>
      <AnimatePresence>
        {isFlipped && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsFlipped(false);
              }}
            />
            <motion.div
              layoutId={`flip-card-${id}`}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <motion.div 
                 className="relative w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl cursor-default"
                 onClick={(e) => e.stopPropagation()}
                 initial={{ rotateY: -180 }}
                 animate={{ rotateY: 0 }}
                 exit={{ rotateY: -180, opacity: 0 }}
                 transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
              >
                 <button 
                   onClick={() => setIsFlipped(false)}
                   className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors z-50"
                 >
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

const BounceCard = ({ className, children }: { className?: string, children: React.ReactNode }) => {
  return (
    <motion.div
      whileHover={{ scale: 0.95, rotate: "-1deg" }}
      className={`group relative min-h-[300px] cursor-pointer rounded-2xl bg-slate-100 p-8 ${className}`}
    >
      {children}
    </motion.div>
  );
};

const CardTitle = ({ children }: { children: React.ReactNode }) => {
  return (
    <h3 className="mx-auto text-center text-2xl md:text-3xl font-semibold">{children}</h3>
  );
};
