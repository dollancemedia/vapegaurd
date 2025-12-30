import React from "react";
import { motion } from "framer-motion";

export const BouncyCardsFeatures = () => {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 text-slate-800">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end md:px-8">
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
        <BounceCard className="col-span-12 md:col-span-4 flex flex-col justify-end pb-4">
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
        <BounceCard className="col-span-12 md:col-span-8">
          <div className="absolute top-1/2 left-8 -translate-y-full z-10 max-w-[50%]">
            <h3 className="text-left text-4xl font-semibold leading-tight">Fast Vape Detection</h3>
          </div>
          <img 
            src="/icons/fast-detection.png" 
            alt="Fast Detection" 
            className="absolute -right-8 -top-24 w-[28rem] h-[28rem] object-contain drop-shadow-xl z-20 group-hover:scale-110 transition-transform duration-300" 
          />
          <div className="absolute bottom-4 left-4 right-4 translate-y-2 rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-400 p-4 transition-transform duration-[250ms] group-hover:translate-y-0 group-hover:rotate-[2deg] z-30">
            <div className="flex flex-col items-start justify-center h-full text-indigo-50">
                <span className="block text-center w-full text-xl font-bold leading-tight">
                Detects vape aerosol within seconds.
                </span>
            </div>
          </div>
        </BounceCard>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <BounceCard className="col-span-12 md:col-span-8">
          <div className="absolute top-1/2 left-8 -translate-y-[120%] z-10 max-w-[50%]">
            <h3 className="text-left text-4xl font-semibold leading-tight">Works Everywhere</h3>
          </div>
          <img 
            src="/icons/connected-devices.png" 
            alt="Connected Devices" 
            className="absolute -right-8 -top-24 w-[28rem] h-[28rem] object-contain drop-shadow-xl z-40 group-hover:scale-110 transition-transform duration-300" 
          />
          <div className="absolute bottom-4 left-4 right-4 translate-y-2 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-400 p-4 transition-transform duration-[250ms] group-hover:translate-y-0 group-hover:rotate-[2deg] z-30">
             <div className="flex flex-col items-start justify-center h-full text-emerald-50">
                <span className="block text-center w-full text-xl font-bold leading-tight">
                Alerts on phones, desktops,<br/>and walkie-talkies.
                </span>
            </div>
          </div>
        </BounceCard>
        <BounceCard className="col-span-12 md:col-span-4 flex flex-col justify-end pb-4">
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
      </div>
    </section>
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
    <h3 className="mx-auto text-center text-3xl font-semibold">{children}</h3>
  );
};
