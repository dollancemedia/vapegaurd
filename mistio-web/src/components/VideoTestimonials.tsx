import React, { useRef, useState } from 'react';
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
          {/* Text Content */}
          <div className="w-full lg:w-1/2 space-y-8">
            <div>
              <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-mistio-teal uppercase bg-mistio-teal/10 rounded-full">
                Real Stories
              </div>
              <h2 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
                Why Communities Trust <span className="text-mistio-teal">Mistio</span>
              </h2>
              <p className="text-lg text-slate-300 leading-relaxed">
                It's not just about detection—it's about reclaiming valuable time and resources for what matters most.
              </p>
            </div>

            <div className="space-y-6">
              <TestimonialPoint 
                title="Educators"
                description="Teachers report significantly fewer classroom disruptions, allowing them to focus on instruction rather than policing bathrooms."
              />
              <TestimonialPoint 
                title="First Responders"
                description="Fire departments are seeing a drastic reduction in false alarms, ensuring their resources are available for genuine emergencies."
              />
              <TestimonialPoint 
                title="Safety Officials"
                description="Fire Marshals endorse our compliant, privacy-first approach that integrates seamlessly with existing school safety protocols."
              />
            </div>
            
            <button className="mt-4 px-8 py-3 bg-mistio-teal hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-teal-900/20">
              Hear Their Stories
            </button>
          </div>

          {/* Video Player */}
          <div className="w-full lg:w-1/2">
            <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-slate-700 group">
              {/* Overlay Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10 pointer-events-none" />
              
              <video 
                ref={videoRef}
                className="w-full h-full object-cover"
                poster="https://images.unsplash.com/photo-1577896335477-2858506f9793?q=80&w=2069&auto=format&fit=crop"
                src="https://assets.mixkit.co/videos/preview/mixkit-group-of-students-walking-in-university-hallway-4654-large.mp4"
                loop
                playsInline
                onClick={togglePlay}
              />

              {/* Controls Overlay */}
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

              {/* Bottom Controls */}
              <div className="absolute bottom-0 left-0 right-0 z-30 p-6 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button onClick={togglePlay} className="text-white hover:text-mistio-teal transition-colors">
                  {isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6" fill="currentColor" />}
                </button>
                
                <button onClick={toggleMute} className="text-white hover:text-mistio-teal transition-colors">
                  {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                </button>
              </div>
            </div>
            
            {/* Decorative Elements */}
            <div className="relative mt-8 grid grid-cols-3 gap-4 text-center">
               <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 backdrop-blur-sm">
                  <div className="text-2xl font-bold text-mistio-teal">95%</div>
                  <div className="text-xs text-slate-400 mt-1">Fewer False Alarms</div>
               </div>
               <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 backdrop-blur-sm">
                  <div className="text-2xl font-bold text-mistio-teal">300+</div>
                  <div className="text-xs text-slate-400 mt-1">Hours Saved/Year</div>
               </div>
               <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 backdrop-blur-sm">
                  <div className="text-2xl font-bold text-mistio-teal">100%</div>
                  <div className="text-xs text-slate-400 mt-1">Privacy Compliant</div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const TestimonialPoint = ({ title, description }: { title: string, description: string }) => (
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
