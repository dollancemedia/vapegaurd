import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import HeroSection from '../components/sections/HeroSection';
import ProblemStatementSection from '../components/sections/ProblemStatementSection';
import TechnologyShowcaseSection from '../components/sections/TechnologyShowcaseSection';
import FeaturesGallerySection from '../components/sections/FeaturesGallerySection';
import InstallationProcessSection from '../components/sections/InstallationProcessSection';
import TestimonialsSection from '../components/sections/TestimonialsSection';
import CallToActionSection from '../components/sections/CallToActionSection';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main>
        <HeroSection />
        <ProblemStatementSection />
        <TechnologyShowcaseSection />
        <FeaturesGallerySection />
        <InstallationProcessSection />
        <TestimonialsSection />
        <CallToActionSection />
      </main>

      <Footer />
    </div>
  );
}
