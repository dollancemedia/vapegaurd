import { Navbar } from '@/components/Navbar';
import { StackedCircularFooter } from '@/components/ui/stacked-circular-footer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Mistio privacy policy. How we collect, use, and protect data from our vape detection sensors deployed in K-12 schools.',
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20 bg-white min-h-screen">
        <article className="max-w-3xl mx-auto px-4 prose prose-slate prose-headings:text-slate-900">
          <h1>Privacy Policy</h1>
          <p className="text-sm text-slate-500">Last updated: August 31, 2026</p>

          <h2>Introduction</h2>
          <p>
            Mistio (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is committed to
            protecting the privacy of students, staff, and all individuals in
            K-12 school environments. This Privacy Policy explains how we
            collect, use, and safeguard information through our vape detection
            sensors and associated services.
          </p>

          <h2>What Mistio Sensors Collect</h2>
          <p>
            Mistio sensors measure <strong>air quality data only</strong>:
            particulate matter levels, gas resistance, humidity, and temperature.
            This data is used solely to detect vape aerosol.
          </p>
          <ul>
            <li>
              <strong>No cameras or microphones.</strong> Mistio sensors do not
              capture images, video, or audio of any kind.
            </li>
            <li>
              <strong>No personally identifiable information (PII).</strong> Sensors
              cannot identify who is present in a room.
            </li>
            <li>
              <strong>No biometric data.</strong> No fingerprints, facial
              recognition, or voice recording.
            </li>
          </ul>

          <h2>Data We Collect Through Our Website</h2>
          <p>When you visit mistio.app or contact us, we may collect:</p>
          <ul>
            <li>Name and email address (when you request a demo or subscribe to updates)</li>
            <li>School or organization name</li>
            <li>Standard web analytics (page views, referral source)</li>
          </ul>

          <h2>How We Use Data</h2>
          <ul>
            <li>Sensor air-quality data is processed to detect vaping events and send alerts to authorized school administrators.</li>
            <li>Contact information is used to respond to demo requests and provide product updates.</li>
            <li>We do not sell, rent, or share personal information with third parties for marketing purposes.</li>
          </ul>

          <h2>Data Storage and Security</h2>
          <p>
            Sensor data is transmitted over encrypted connections and stored in
            secured cloud infrastructure. We retain detection event data only as
            long as necessary for school reporting purposes.
          </p>

          <h2>COPPA and FERPA Compliance</h2>
          <p>
            Mistio is designed for use in K-12 schools and does not collect
            personal information from children. Because our sensors measure only
            environmental air quality and cannot identify individuals, Mistio
            does not collect student education records subject to FERPA or
            personal information subject to COPPA.
          </p>

          <h2>Your Rights</h2>
          <p>
            You may request access to, correction of, or deletion of any
            personal information we hold about you by contacting us at{' '}
            <a href="mailto:contact@mistio.app">contact@mistio.app</a>.
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be
            posted on this page with an updated revision date.
          </p>

          <h2>Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, contact us at{' '}
            <a href="mailto:contact@mistio.app">contact@mistio.app</a>.
          </p>
        </article>
      </main>
      <StackedCircularFooter />
    </>
  );
}
