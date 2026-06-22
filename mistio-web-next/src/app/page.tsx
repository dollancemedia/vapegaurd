import { Navbar } from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { BouncyCardsFeatures } from '@/components/ui/bounce-card-features';
import { LandingAccordionItem } from '@/components/ui/interactive-image-accordion';
import { ComparisonDemo } from '@/components/ComparisonDemo';
import { HeroScrollDemo } from '@/components/HeroScrollDemo';
import { VideoTestimonials } from '@/components/VideoTestimonials';
import { FAQ } from '@/components/FAQ';
import { ContactSection } from '@/components/ContactSection';
import { StackedCircularFooter } from '@/components/ui/stacked-circular-footer';

export default function Home() {
  return (
    <main>
      <Navbar />
      <section id="home">
        <Hero />
      </section>
      <section id="features" className="scroll-mt-24">
        <BouncyCardsFeatures />
      </section>
      <HeroScrollDemo />
      <ComparisonDemo />
      <LandingAccordionItem />
      <section id="testimonials" className="scroll-mt-32">
        <VideoTestimonials />
      </section>
      <FAQ />
      <ContactSection />
      <StackedCircularFooter />
    </main>
  );
}
