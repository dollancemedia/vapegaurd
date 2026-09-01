import { Navbar } from '@/components/Navbar';
import { StackedCircularFooter } from '@/components/ui/stacked-circular-footer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Mistio terms of service governing use of our vape detection hardware, software, and website.',
};

export default function TermsOfServicePage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20 bg-white min-h-screen">
        <article className="max-w-3xl mx-auto px-4 prose prose-slate prose-headings:text-slate-900">
          <h1>Terms of Service</h1>
          <p className="text-sm text-slate-500">Last updated: August 31, 2026</p>

          <h2>Agreement to Terms</h2>
          <p>
            By accessing or using Mistio&apos;s website, hardware, or services,
            you agree to be bound by these Terms of Service. If you do not agree,
            do not use our services.
          </p>

          <h2>Description of Service</h2>
          <p>
            Mistio provides battery-powered vape detection sensors and an
            associated cloud dashboard for K-12 schools and other facilities.
            Our sensors monitor air quality to detect vape aerosol and send
            alerts to authorized administrators.
          </p>

          <h2>Use of Hardware</h2>
          <ul>
            <li>Mistio sensors are intended for indoor use in bathrooms, locker rooms, stairwells, and similar spaces.</li>
            <li>Installation and placement should follow the guidelines provided with each unit.</li>
            <li>Do not disassemble, modify, or tamper with Mistio sensors.</li>
          </ul>

          <h2>Accounts and Access</h2>
          <p>
            Access to the Mistio dashboard requires an authorized account. You
            are responsible for maintaining the confidentiality of your account
            credentials and for all activity under your account.
          </p>

          <h2>Accuracy and Limitations</h2>
          <p>
            Mistio uses machine learning to distinguish vape aerosol from other
            airborne substances. While we strive for high accuracy, no detection
            system is 100% accurate. Mistio is intended as a tool to assist
            school safety programs, not as a sole determinant of disciplinary
            action.
          </p>

          <h2>Intellectual Property</h2>
          <p>
            All content on mistio.app, including text, graphics, logos, and
            software, is the property of Mistio and is protected by applicable
            intellectual property laws.
          </p>

          <h2>Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Mistio shall not be liable
            for any indirect, incidental, special, or consequential damages
            arising from the use of our products or services.
          </p>

          <h2>Termination</h2>
          <p>
            We reserve the right to suspend or terminate access to our services
            at any time for violation of these terms.
          </p>

          <h2>Changes to Terms</h2>
          <p>
            We may update these Terms of Service from time to time. Continued
            use of our services after changes constitutes acceptance of the
            updated terms.
          </p>

          <h2>Contact Us</h2>
          <p>
            Questions about these terms? Contact us at{' '}
            <a href="mailto:contact@mistio.app">contact@mistio.app</a>.
          </p>
        </article>
      </main>
      <StackedCircularFooter />
    </>
  );
}
