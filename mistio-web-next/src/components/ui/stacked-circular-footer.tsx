'use client';

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
);
const XIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 4l7.07 8.51M20 20l-7.07-8.51m0 0L20 4M4 20l7.07-8.51"/></svg>
);
const InstagramIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
);
const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>
);

function StackedCircularFooter() {
  return (
    <footer className="bg-mistio-dark py-16 text-white border-t border-slate-800">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-8 p-4">
            <Image src="/logo.png" alt="Mistio Logo" width={192} height={128} className="h-32 w-auto brightness-0 invert" />
          </div>

          <nav className="mb-8 flex flex-wrap justify-center gap-8 text-sm font-medium">
            <a href="/" className="text-slate-300 hover:text-mistio-teal transition-colors">Home</a>
            <a href="/schools" className="text-slate-300 hover:text-mistio-teal transition-colors">Schools</a>
            <a href="/blog" className="text-slate-300 hover:text-mistio-teal transition-colors">Blog</a>
            <a href="/blog/what-are-vape-detectors" className="text-slate-300 hover:text-mistio-teal transition-colors">How It Works</a>
            <a href="/blog/best-vape-detectors-for-schools" className="text-slate-300 hover:text-mistio-teal transition-colors">Compare</a>
            <a href="/#contact" className="text-slate-300 hover:text-mistio-teal transition-colors">Contact</a>
          </nav>

          <div className="mb-10 flex space-x-4">
            <SocialButton icon={<FacebookIcon className="h-4 w-4" />} label="Facebook" />
            <SocialButton icon={<XIcon className="h-4 w-4" />} label="X" />
            <SocialButton icon={<InstagramIcon className="h-4 w-4" />} label="Instagram" />
            <SocialButton icon={<LinkedinIcon className="h-4 w-4" />} label="LinkedIn" />
          </div>

          <div className="mb-12 w-full max-w-md">
            <p className="mb-4 text-sm text-slate-400">Stay updated with our latest safety features.</p>
            <form className="flex space-x-2">
              <div className="flex-grow">
                <Input placeholder="Enter your email" type="email" className="rounded-full bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-mistio-teal focus:ring-mistio-teal" />
              </div>
              <Button type="submit" className="rounded-full bg-mistio-teal hover:bg-teal-600 text-white border-none">Subscribe</Button>
            </form>
          </div>

          <div className="pt-8 border-t border-slate-800 w-full max-w-4xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
              <p>&copy; 2026 Mistio. All rights reserved.</p>
              <div className="flex gap-6">
                <a href="/privacy-policy" className="hover:text-slate-300">Privacy Policy</a>
                <a href="/terms-of-service" className="hover:text-slate-300">Terms of Service</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

const SocialButton = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <Button variant="outline" size="icon" className="rounded-full border-slate-700 bg-transparent text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
    {icon}
    <span className="sr-only">{label}</span>
  </Button>
);

export { StackedCircularFooter };
