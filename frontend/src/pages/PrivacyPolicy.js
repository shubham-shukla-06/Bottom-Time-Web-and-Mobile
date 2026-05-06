import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="privacy-title">Privacy Policy</h1>
        <p className="text-sm text-slate-400 mb-10">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <Section title="1. Who We Are">
          <p>Bottom Time is operated by <strong>Bottom Time LLP</strong> ("we", "us", "our"), the legal entity behind the Bottom Time platform — a marketplace connecting divers, instructors, and dive operators worldwide. This policy explains how we collect, use, store, and protect your personal information in compliance with global data protection regulations.</p>
        </Section>

        <Section title="2. Personal Data We Collect">
          <p className="font-semibold text-slate-900 mb-2">We collect only what is necessary to deliver the services you use. Here is the specific personally identifiable information (PII) we may collect:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Identity data</strong> — full name, date of birth, profile photograph.</li>
            <li><strong>Contact data</strong> — email address, phone number, emergency contact details.</li>
            <li><strong>Account credentials</strong> — password (stored in hashed form only; we never store plain-text passwords).</li>
            <li><strong>Dive qualifications</strong> — certification agency, certification level, total dives, specialties.</li>
            <li><strong>Location data</strong> — country, city (provided by you during onboarding).</li>
            <li><strong>Booking &amp; transaction data</strong> — details of courses, trips, or products you book or purchase, including dates, locations, participant counts, and payment references.</li>
            <li><strong>Communication data</strong> — messages exchanged with operators, instructors, or other users on the platform.</li>
            <li><strong>Dive log entries</strong> — dive sites, depths, durations, conditions, and personal notes you choose to record.</li>
            <li><strong>Preferences &amp; interests</strong> — dive types you enjoy, equipment ownership, travel willingness, language preferences.</li>
            <li><strong>Technical/usage data</strong> — IP address, device type, browser, pages visited, and features used (collected automatically to improve the platform).</li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Data">
          <p className="font-semibold text-slate-900 mb-2">We use your PII <strong>exclusively</strong> to provide and improve the services you actively use:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Creating and managing your user account.</li>
            <li>Processing bookings, purchases, and payments you initiate.</li>
            <li>Connecting you with dive operators, instructors, and community members.</li>
            <li>Sending transactional notifications (booking confirmations, messages, status updates).</li>
            <li>Maintaining your dive log and certification records.</li>
            <li>Personalising your experience (recommendations, saved preferences).</li>
            <li>Responding to your support requests and inquiries.</li>
            <li>Ensuring platform security and preventing fraud.</li>
          </ul>
          <div className="mt-4 p-4 bg-cyan-50 rounded-lg border border-cyan-100">
            <p className="text-sm text-cyan-800"><strong>We do not</strong> sell, rent, or share your personal data with third parties for advertising or marketing purposes. Your data is used solely for the services you request.</p>
          </div>
        </Section>

        <Section title="4. Legal Basis for Processing">
          <p className="mb-3">Depending on your location, we process your data under the following legal bases:</p>
          
          <p className="font-semibold text-slate-800 mt-4 mb-2">GDPR (EU/UK)</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Contract</strong> — processing necessary to fulfil bookings and services you request.</li>
            <li><strong>Legitimate interest</strong> — improving our platform, preventing fraud, and ensuring security.</li>
            <li><strong>Consent</strong> — where you explicitly opt in (e.g. marketing communications).</li>
          </ul>

          <p className="font-semibold text-slate-800 mt-4 mb-2">CCPA/CPRA (California, USA)</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>You have the right to know what personal information is collected and how it is used.</li>
            <li>You may request deletion of your personal information.</li>
            <li>You may opt out of the sale of personal information (we do not sell your data).</li>
            <li>You will not face discrimination for exercising your privacy rights.</li>
          </ul>

          <p className="font-semibold text-slate-800 mt-4 mb-2">India's DPDPA (Digital Personal Data Protection Act, 2023)</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>We act as a <strong>Data Fiduciary</strong> under the DPDPA.</li>
            <li>We process your data only for <strong>lawful purposes</strong> with your informed consent.</li>
            <li>You (as a <strong>Data Principal</strong>) have the right to access, correct, and erase your personal data.</li>
            <li>You may nominate another person to exercise your rights on your behalf.</li>
            <li>We will notify you and the Data Protection Board of India of any data breach within 72 hours.</li>
            <li>We do not process children's data (under 18) without verifiable parental consent.</li>
          </ul>

          <p className="text-sm text-slate-500 mt-4">We also comply with <strong>LGPD</strong> (Brazil), <strong>POPIA</strong> (South Africa), <strong>PIPEDA</strong> (Canada), and <strong>Australia's Privacy Act</strong>.</p>
        </Section>

        <Section title="5. Your Rights">
          <p className="mb-3">Regardless of where you are located, you have the following rights regarding your personal data:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Access</strong> — request a copy of all personal data we hold about you.</li>
            <li><strong>Correction</strong> — request correction of inaccurate or incomplete data.</li>
            <li><strong>Erasure</strong> — request deletion of your personal data ("right to be forgotten").</li>
            <li><strong>Portability</strong> — download your data in a machine-readable format.</li>
            <li><strong>Restriction</strong> — request that we limit how we process your data.</li>
            <li><strong>Objection</strong> — object to certain types of processing.</li>
            <li><strong>Withdraw consent</strong> — withdraw consent at any time without affecting prior lawful processing.</li>
            <li><strong>Grievance redressal</strong> — file a complaint with us or a supervisory authority.</li>
          </ul>
          <p className="mt-3">To exercise any of these rights, you can use the "Download My Data" feature in your profile settings or contact us at the address below.</p>
        </Section>

        <Section title="6. Data Sharing">
          <p>We share your data only when necessary to deliver the services you request:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Dive operators &amp; instructors</strong> — your name, contact details, and booking information when you make a reservation.</li>
            <li><strong>Payment processors</strong> — encrypted payment data to complete transactions (we never store full card numbers).</li>
            <li><strong>Cloud infrastructure providers</strong> — your data is stored securely on encrypted servers.</li>
            <li><strong>Legal obligations</strong> — if required by law, regulation, or court order.</li>
          </ul>
          <p className="mt-3">All third-party processors are bound by data processing agreements that ensure equivalent protection of your data.</p>
        </Section>

        <Section title="7. Data Retention & Account Deletion">
          <p>We retain your data only as long as your account is active or as needed to provide services.</p>
          <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm text-amber-800 font-semibold mb-2">Important: Requesting Data Deletion = Account Deletion</p>
            <p className="text-sm text-amber-700">If you request deletion of your personal data, we will <strong>permanently delete your entire account</strong> and all associated data, including your profile, bookings, dive logs, messages, and connections. This action is irreversible.</p>
          </div>
          <p className="mt-3">Upon account deletion, we will erase your personal data within <strong>30 days</strong>, except where retention is required by law (e.g. financial transaction records for tax compliance, which may be retained for up to 7 years).</p>
        </Section>

        <Section title="8. Data Security">
          <p>We protect your data with industry-standard technical and organisational measures:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Encrypted connections (TLS/SSL) for all data in transit.</li>
            <li>Encrypted storage for sensitive data at rest.</li>
            <li>Passwords stored using secure one-way hashing (bcrypt).</li>
            <li>Role-based access controls limiting employee access.</li>
            <li>Regular security audits and vulnerability assessments.</li>
            <li>Incident response procedures with 72-hour breach notification.</li>
          </ul>
          <p className="mt-3 text-sm text-slate-500">No system is 100% secure. We are committed to continuous improvement of our security practices.</p>
        </Section>

        <Section title="9. Cookies & Tracking">
          <p>We use <strong>essential cookies only</strong> to:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Keep you logged in during your session.</li>
            <li>Remember your preferences and consent choices.</li>
            <li>Ensure platform security.</li>
          </ul>
          <p className="mt-3">We <strong>do not</strong> use third-party advertising cookies, behavioural tracking, or targeted advertising.</p>
        </Section>

        <Section title="10. Children's Privacy">
          <p>Our services are not directed at individuals under <strong>18 years of age</strong>. We do not knowingly collect personal data from children.</p>
          <p className="mt-2">If you are a parent or guardian and believe your child has provided us with personal data, please contact us immediately. If we discover that we have collected data from a child without proper parental consent, we will delete it promptly.</p>
        </Section>

        <Section title="11. International Data Transfers">
          <p>Your data may be processed in countries outside your own. When we transfer data internationally, we ensure appropriate safeguards are in place:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Standard Contractual Clauses (SCCs) approved by the European Commission.</li>
            <li>Data processing agreements with all third-party processors.</li>
            <li>Encryption of data in transit and at rest.</li>
          </ul>
        </Section>

        <Section title="12. Changes to This Policy">
          <p>We may update this policy to reflect changes in our practices or legal requirements. Material changes will be communicated via:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>A prominent notice on the platform.</li>
            <li>Email notification to registered users (for significant changes).</li>
          </ul>
          <p className="mt-2">Continued use of the platform after changes constitutes acceptance of the updated policy.</p>
        </Section>

        <Section title="13. Contact & Grievance Officer">
          <p className="mb-3">For any privacy-related questions, to exercise your rights, or to file a grievance, contact us at:</p>
          <div className="bg-slate-50 p-4 rounded-lg">
            <p className="font-semibold text-slate-800">Data Protection / Grievance Officer</p>
            <p className="text-sm text-slate-600 mt-1">Email: <strong>privacy@bottom-time.com</strong></p>
            <p className="text-sm text-slate-500 mt-2">We will respond to your request within 30 days (or sooner as required by applicable law).</p>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-slate-900 mb-3">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed">{children}</div>
    </section>
  );
}
