import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from './Button';

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { name: 'Home', href: '#home' },
    { name: 'Features', href: '#features' },
    { name: 'Testimonials', href: '#testimonials' },
    { name: 'Contact', href: '#contact' },
  ];

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const targetId = href.replace('#', '');
    const element = document.getElementById(targetId);
    if (element) {
      const offset = 80; // Height of the navbar
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      setIsOpen(false);
    }
  };

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Left: Mobile Menu & Logo */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-md text-gray-500 hover:text-gray-900 focus:outline-none md:hidden"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <a href="/" className="relative flex items-center">
               {/* Placeholder for spacing */}
               <div className="w-32 h-10"></div>
               {/* Actual Logo - Absolute positioned to overflow */}
              <img 
                className="absolute top-[calc(50%-15px)] left-0 -translate-y-[40%] h-40 w-auto max-w-none" 
                src="/logo.png" 
                alt="Mistio" 
              />
            </a>
          </div>

          {/* Center: Desktop Nav Links */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleScroll(e, link.href)}
                className="text-gray-600 hover:text-mistio-teal px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Right: CTAs */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" className="hidden sm:flex" onClick={() => window.location.href = 'https://dashboard.mistio.app'}>
              Dashboard
            </Button>
            <Button 
              variant="gradient" 
              size="sm"
              className="ml-2"
              onClick={() => {
                const contactSection = document.getElementById('contact');
                if (contactSection) {
                  contactSection.scrollIntoView({ behavior: 'smooth' });
                }
              }}
            >
              Get a Quote
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white shadow-lg border-t">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleScroll(e, link.href)}
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-mistio-teal hover:bg-gray-50"
              >
                {link.name}
              </a>
            ))}
            <div className="mt-4 px-3 flex flex-col gap-3">
              <Button variant="ghost" className="w-full justify-start" onClick={() => window.location.href = 'https://dashboard.mistio.app'}>Dashboard</Button>
              <Button 
                variant="gradient" 
                className="w-full"
                onClick={() => {
                  setIsOpen(false);
                  const contactSection = document.getElementById('contact');
                  if (contactSection) {
                    contactSection.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
              >
                Get a Quote
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};