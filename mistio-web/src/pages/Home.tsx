import React from 'react';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { BouncyCardsFeatures } from '../components/ui/bounce-card-features';
import { HeroScrollDemo } from '../components/HeroScrollDemo';
import { ComparisonDemo } from '../components/ComparisonDemo';
import { LandingAccordionItem } from '../components/ui/interactive-image-accordion';
import { VideoTestimonials } from '../components/VideoTestimonials';
import { ContactSection } from '../components/ContactSection';
import { StackedCircularFooter } from '../components/ui/stacked-circular-footer';

export const Home = () => {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main>
        <div id="home">
          <Hero />
        </div>
        <div id="features" className="scroll-mt-24">
          <BouncyCardsFeatures />
        </div>
        <HeroScrollDemo />
        <ComparisonDemo />
        <LandingAccordionItem />
        <div id="testimonials" className="scroll-mt-32">
          <VideoTestimonials />
        </div>
        <ContactSection />
        <StackedCircularFooter />
      </main>
    </div>
  );
};
