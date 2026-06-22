'use client';

import { useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';

export const VideoTestimonials = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <section className="py-20 bg-mistio-dark text-white overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          <div className="w-full lg:w-1/2 space-y-8">
            <div>
              <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-mistio-teal uppercase bg-mistio-teal/10 rounded-full">
                The Difference
              </div>
              <h2 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
                What Happens After You <span className="text-mistio-teal">Switch</span>
              </h2>
              <p className="text-lg text-slate-300 leading-relaxed">
                Other detectors flood your staff with false alarms until they stop responding. Mistio only alerts when it matters.
              </p>
            </div>

            <div className="space-y-6">
              <TestimonialPoint
                title="Staff Trust It"
                description="When every cologne spray triggers an alarm, staff learns to ignore it. Mistio only fires on real vape, so when it alerts, people actually respond."
              />
              <TestimonialPoint
                title="No Infrastructure Needed"
                description="Other sensors need PoE drops, ceiling work, and IT involvement. Mistio runs on battery for a full year. A custodian can install it during lunch."
              />
              <TestimonialPoint
                title="Schools Stay in Control"
                description="No cameras, no microphones, no student data collected. Real-time alerts go straight to the admin's phone with the exact location."
              />
            </div>

            <button className="mt-4 px-8 py-3 bg-mistio-teal hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-teal-900/20">
              Hear Their Stories
            </button>
          </div>

          <div className="w-full lg:w-1/2">
            <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-slate-700 group">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10 pointer-events-none" />
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                src="/community-stories.mp4"
                preload="auto"
                loop
                playsInline
                onClick={togglePlay}
              />
              <div className="absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-300">
                {!isPlaying && (
                  <motion.button
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileHover={{ scale: 1.1 }}
                    onClick={togglePlay}
                    className="w-20 h-20 flex items-center justify-center rounded-full bg-mistio-teal/90 text-white backdrop-blur-sm shadow-xl transition-transform"
                  >
                    <Play className="w-8 h-8 ml-1" fill="currentColor" />
                  </motion.button>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 z-30 p-6 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button onClick={togglePlay} className="text-white hover:text-mistio-teal transition-colors">
                  {isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6" fill="currentColor" />}
                </button>
                <button onClick={toggleMute} className="text-white hover:text-mistio-teal transition-colors">
                  {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                </button>
              </div>
            </div>

            <div className="relative mt-8 grid grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 backdrop-blur-sm">
                <div className="text-2xl font-bold text-mistio-teal">1 Year</div>
                <div className="text-xs text-slate-400 mt-1">Battery Life</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 backdrop-blur-sm">
                <div className="text-2xl font-bold text-mistio-teal">3 Sec</div>
                <div className="text-xs text-slate-400 mt-1">Install Time</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 backdrop-blur-sm">
                <div className="text-2xl font-bold text-mistio-teal">0</div>
                <div className="text-xs text-slate-400 mt-1">Wires Needed</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const TestimonialPoint = ({ title, description }: { title: string; description: string }) => (
  <div className="flex gap-4 items-start">
    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700 text-mistio-teal font-bold text-lg">
      {title.charAt(0)}
    </div>
    <div>
      <h3 className="text-xl font-semibold text-white mb-1">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
    </div>
  </div>
);
