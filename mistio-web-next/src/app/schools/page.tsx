import { Navbar } from '@/components/Navbar';
import { FAQ, faqs } from '@/components/FAQ';
import { ContactSection } from '@/components/ContactSection';
import { StackedCircularFooter } from '@/components/ui/stacked-circular-footer';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vape Detectors for Schools — Battery-Powered, No Wiring, No False Alarms',
  description:
    'Mistio is the only battery-powered vape detector built for K-12 schools. One year battery life, installs in under a minute, and AI that ignores cologne and cleaning spray. No electrician, no IT, no wires.',
  keywords: [
    'vape detector for schools',
    'school vape detector',
    'vape detection schools',
    'bathroom vape detector',
    'k-12 vape detector',
    'school vaping solution',
    'vape sensor for schools',
    'wireless vape detector schools',
  ],
  openGraph: {
    title: 'Vape Detectors for Schools — Mistio',
    description:
      'Battery-powered vape detection for K-12 schools. One year battery, under 1 minute install, zero false alarms from cologne or cleaning spray.',
    url: 'https://www.mistio.app/schools',
  },
};

const schoolsJsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Vape Detectors for Schools',
    description:
      'Mistio is a battery-powered vape detector for K-12 schools. No wiring, no false alarms, one year battery life.',
    url: 'https://www.mistio.app/schools',
    mainEntity: {
      '@type': 'Product',
      '@id': 'https://www.mistio.app/schools#product',
      name: 'Mistio Vape Detector',
      description:
        'Battery-powered vape detection sensor for K-12 school bathrooms and locker rooms. Lasts one full year on a single battery. AI-powered to eliminate false alarms from cologne, deodorant, and cleaning products.',
      brand: { '@type': 'Brand', name: 'Mistio' },
      category: 'School Safety Equipment',
      audience: {
        '@type': 'EducationalAudience',
        educationalRole: 'administrator',
      },
      offers: {
        '@type': 'Offer',
        availability: 'https://schema.org/InStock',
        priceCurrency: 'USD',
        url: 'https://www.mistio.app/schools',
      },
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'Battery Life', value: '1 year' },
        { '@type': 'PropertyValue', name: 'Installation Time', value: 'Under 1 minute' },
        { '@type': 'PropertyValue', name: 'Connectivity', value: 'WiFi' },
        { '@type': 'PropertyValue', name: 'Cameras or Microphones', value: 'None' },
        { '@type': 'PropertyValue', name: 'False Alarm Rate', value: 'Near zero (AI-filtered)' },
      ],
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.mistio.app' },
      { '@type': 'ListItem', position: 2, name: 'Schools', item: 'https://www.mistio.app/schools' },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  },
];

export default function SchoolsPage() {
  return (
    <>
      <Navbar />
      {schoolsJsonLd.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
      <main className="pt-24">
        {/* Hero */}
        <section className="py-20 px-4 bg-white">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 leading-tight tracking-tight mb-6">
              The vape detector built for schools.
              <br />
              <span className="text-teal-600">No wires. No false alarms.</span>
            </h1>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
              Mistio installs in under a minute, runs on battery for a full year, and only
              alerts on actual vape — not cologne, not cleaning spray, not deodorant.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/#contact"
                className="inline-block bg-teal-600 hover:bg-teal-700 text-white font-semibold px-8 py-4 rounded-lg transition-colors text-lg"
              >
                Book a Demo
              </Link>
              <Link
                href="/blog/best-vape-detectors-for-schools"
                className="inline-block border-2 border-slate-300 hover:border-slate-400 text-slate-700 font-semibold px-8 py-4 rounded-lg transition-colors text-lg"
              >
                Compare All Detectors
              </Link>
            </div>
          </div>
        </section>

        {/* The Problem */}
        <section className="py-20 px-4 bg-slate-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">
              Why most vape detectors fail in schools
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-xl border border-slate-200">
                <div className="text-3xl mb-4">🔌</div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">
                  Installation takes months
                </h3>
                <p className="text-slate-600">
                  PoE sensors need electricians, cable runs, IT approval, and network port
                  provisioning. Schools wait 3-6 months from purchase to active monitoring.
                </p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200">
                <div className="text-3xl mb-4">🚨</div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">
                  False alarms kill trust
                </h3>
                <p className="text-slate-600">
                  After the fifth time a sensor fires on Axe body spray, staff stops
                  responding. A $1,000 sensor nobody trusts is worth zero.
                </p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200">
                <div className="text-3xl mb-4">💸</div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">
                  Hidden costs add up
                </h3>
                <p className="text-slate-600">
                  The sensor costs $1,000. The PoE install costs $2,000. The annual license
                  costs $200. Total: $3,200 per bathroom per year.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How Mistio Solves It */}
        <section className="py-20 px-4 bg-white">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">
              How Mistio works in K-12 schools
            </h2>
            <div className="space-y-12">
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="bg-teal-50 text-teal-700 font-bold text-2xl w-12 h-12 rounded-full flex items-center justify-center shrink-0">
                  1
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    Mount with two screws
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    Wall or ceiling mount in any bathroom, locker room, or stairwell. No
                    cables, no ceiling tile work, no network drops. A custodian installs 20
                    sensors before lunch.
                  </p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="bg-teal-50 text-teal-700 font-bold text-2xl w-12 h-12 rounded-full flex items-center justify-center shrink-0">
                  2
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    AI monitors air quality 24/7
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    Multiple sensors (particulate matter, gas resistance, humidity,
                    temperature) feed a machine learning model trained to distinguish vape
                    from cologne, deodorant, cleaning products, and normal air.
                  </p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="bg-teal-50 text-teal-700 font-bold text-2xl w-12 h-12 rounded-full flex items-center justify-center shrink-0">
                  3
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    Instant alerts when vaping is detected
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    Administrators receive push notifications within 30-60 seconds of a
                    confirmed vaping event. Dashboard shows which bathroom, what time, and
                    confidence level. Staff responds because they trust the alert is real.
                  </p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="bg-teal-50 text-teal-700 font-bold text-2xl w-12 h-12 rounded-full flex items-center justify-center shrink-0">
                  4
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    Replace battery once per school year
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    One year of battery life means zero maintenance during the school year.
                    Swap batteries over summer break. No charging stations, no power
                    cables, no downtime.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="py-20 px-4 bg-slate-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">
              Mistio vs. wired vape detectors
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                      Feature
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-teal-700">
                      Mistio
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                      Wired (HALO, Verkada)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-6 py-4 text-sm text-slate-600">Power</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">Battery (1 year)</td>
                    <td className="px-6 py-4 text-sm text-slate-600">PoE cable required</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-slate-600">Install time</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">Under 1 minute</td>
                    <td className="px-6 py-4 text-sm text-slate-600">2-4 hours per sensor</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-slate-600">Electrician needed</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">No</td>
                    <td className="px-6 py-4 text-sm text-slate-600">Yes</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-slate-600">Wired network drop required</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">No (connects to existing WiFi)</td>
                    <td className="px-6 py-4 text-sm text-slate-600">Yes</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-slate-600">False alarms from cologne</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">AI-filtered out</td>
                    <td className="px-6 py-4 text-sm text-slate-600">Commonly reported</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-slate-600">Cost per bathroom (year 1)</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">~$500</td>
                    <td className="px-6 py-4 text-sm text-slate-600">$2,000-$5,000</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-sm text-slate-600">Privacy (cameras/mics)</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">None</td>
                    <td className="px-6 py-4 text-sm text-slate-600">Varies by vendor</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-center mt-6 text-sm text-slate-500">
              <Link href="/blog/best-vape-detectors-for-schools" className="text-teal-600 hover:underline">
                See the full 7-product comparison →
              </Link>
            </p>
          </div>
        </section>

        {/* Use cases */}
        <section className="py-20 px-4 bg-white">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">
              Where schools install Mistio
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { location: 'Bathrooms', desc: 'The #1 vaping location. One sensor per bathroom.' },
                { location: 'Locker rooms', desc: 'High-traffic, low-supervision areas.' },
                { location: 'Stairwells', desc: 'Enclosed spaces that trap aerosol.' },
                { location: 'Hallway alcoves', desc: 'Blind spots between classes.' },
                { location: 'Portable classrooms', desc: 'Connects to WiFi in under a minute, no cable run needed.' },
                { location: 'Outdoor shelters', desc: 'Covered areas near entrances.' },
              ].map((item) => (
                <div key={item.location} className="p-5 rounded-xl border border-slate-200">
                  <h3 className="font-bold text-slate-900 mb-1">{item.location}</h3>
                  <p className="text-sm text-slate-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-16 px-4 bg-teal-600">
          <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl md:text-5xl font-bold text-white">1 Year</div>
              <div className="text-teal-100 mt-1">Battery life</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold text-white">&lt;60s</div>
              <div className="text-teal-100 mt-1">Install time</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold text-white">0</div>
              <div className="text-teal-100 mt-1">Wires needed</div>
            </div>
          </div>
        </section>

        <FAQ />
        <ContactSection />
      </main>
      <StackedCircularFooter />
    </>
  );
}
