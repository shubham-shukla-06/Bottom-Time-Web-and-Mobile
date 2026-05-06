import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Waves } from 'lucide-react';

export default function TermsOfService() {
  const lastUpdated = 'February 1, 2026';

  return (
    <div className="min-h-screen flex flex-col bg-white" data-testid="terms-page">
      <Navbar />

      <main className="flex-1">
        {/* Editorial header */}
        <header className="border-b border-slate-100">
          <div className="max-w-3xl mx-auto px-6 pt-20 pb-14">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-500 mb-6" data-testid="terms-eyebrow">
              <Waves size={14} /> Legal · The Fine Print
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.05]" data-testid="terms-title">
              Terms of Service
            </h1>
            <p className="text-slate-600 text-base mt-5 leading-relaxed max-w-2xl">
              These terms govern your use of the Bottom Time platform. We've written them as plainly as the law allows —
              no tricks, no buried clauses. Read them once, keep a copy, and dive with confidence.
            </p>
            <p className="text-xs text-slate-400 mt-6 uppercase tracking-wider">Last updated — {lastUpdated}</p>
          </div>
        </header>

        <article className="max-w-3xl mx-auto px-6 py-14">

          {/* Intro entity block */}
          <div className="mb-12 p-6 bg-slate-50 border border-slate-100 rounded-2xl">
            <p className="text-sm text-slate-600 leading-relaxed">
              The Bottom Time platform (the <em>"Platform"</em>, <em>"Service"</em>) is operated by <strong className="text-slate-900">Bottom Time LLP</strong>
              {' '}(<em>"Bottom Time"</em>, <em>"we"</em>, <em>"us"</em>, <em>"our"</em>), a limited liability partnership registered in India.
              By accessing or using the Platform, you (<em>"you"</em>, <em>"your"</em>, the <em>"User"</em>) enter into a binding
              agreement with Bottom Time LLP on the terms set out below.
            </p>
          </div>

          <Section n="1" title="Acceptance of These Terms">
            <p>
              By creating an account, making a booking, listing services, or otherwise using the Platform, you confirm that
              you have read, understood, and agreed to be bound by these Terms, our <a href="/privacy" className="text-cyan-600 hover:underline">Privacy Policy</a>,
              and any supplemental policies referenced herein.
            </p>
            <p className="mt-3">
              If you do not agree with any part of these Terms, you must not use the Platform.
            </p>
          </Section>

          <Section n="2" title="What Bottom Time Is (and Is Not)">
            <p>
              Bottom Time is a <strong>two-sided marketplace</strong> that connects divers with licensed dive operators, instructors,
              gear vendors, and the broader diving community. We provide the technology that enables discovery, booking, communication,
              logging, planning, and commerce between users.
            </p>
            <div className="mt-5 p-5 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-900">
                <strong>We are not a dive operator.</strong> Bottom Time does not conduct, supervise, or instruct dives. Any dive trip,
                course, or charter is provided exclusively by the independent third-party operator you book with. Bottom Time is not
                a party to the contract between you and the operator, and we do not guarantee the quality, safety, or legality of any
                operator's services.
              </p>
            </div>
          </Section>

          <Section n="3" title="Eligibility">
            <ul className="list-disc pl-6 space-y-1.5">
              <li>You must be at least <strong>18 years old</strong> to register for an account and make bookings.</li>
              <li>You must have the legal capacity to enter into a binding contract in your jurisdiction.</li>
              <li>You must not be barred from using the Platform under applicable law.</li>
              <li>You must provide accurate, current, and complete information, and keep it updated.</li>
              <li>For dives beyond recreational limits, you must hold valid certifications from a recognised agency (PADI, SSI, NAUI,
                  CMAS, TDI, RAID, and equivalents).</li>
            </ul>
          </Section>

          <Section n="4" title="Your Account">
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all activity under your
              account. Notify us immediately at <a href="mailto:security@bottom-time.com" className="text-cyan-600 hover:underline">security@bottom-time.com</a> if
              you suspect unauthorised access.
            </p>
            <p className="mt-3">
              We may suspend or terminate accounts that violate these Terms, submit false information, or pose a safety or security risk
              to the community.
            </p>
          </Section>

          <Section n="5" title="Bookings, Payments & Commissions">
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Bookings made through the Platform are a direct contract between you and the relevant operator, with Bottom Time as
                  facilitator.</li>
              <li>All payments are processed through regulated payment service providers (Razorpay). Bottom Time does not store full
                  card or bank-account details.</li>
              <li>Prices are displayed in the listing's stated currency and are inclusive or exclusive of taxes as marked. You are
                  responsible for any local taxes, tariffs, or foreign-exchange fees imposed by your bank or country.</li>
              <li>Bottom Time collects a platform commission on completed bookings, disclosed to operators in their operator agreement.
                  The commission is <strong>not</strong> charged to divers as a separate line item.</li>
              <li>Refunds are governed by the cancellation policy stated on each listing and the Section on <em>Cancellations &amp; Refunds</em> below.</li>
            </ul>
          </Section>

          <Section n="6" title="Cancellations & Refunds">
            <p>
              Each listing displays its own cancellation policy (Flexible, Moderate, or Strict). By booking, you accept the policy stated
              at the time of booking.
            </p>
            <div className="mt-4 grid sm:grid-cols-3 gap-3 text-xs">
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                <p className="font-semibold text-emerald-900 mb-1">Flexible</p>
                <p className="text-emerald-800 leading-relaxed">Full refund up to 24 hrs before the dive.</p>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                <p className="font-semibold text-amber-900 mb-1">Moderate</p>
                <p className="text-amber-800 leading-relaxed">Full refund up to 7 days before; 50% after.</p>
              </div>
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl">
                <p className="font-semibold text-rose-900 mb-1">Strict</p>
                <p className="text-rose-800 leading-relaxed">Non-refundable within 30 days of the dive.</p>
              </div>
            </div>
            <p className="mt-4">
              Bottom Time reserves the right to override a listing's policy and issue full refunds in exceptional circumstances
              (operator no-show, unsafe conditions, government-ordered cancellations, medical force majeure on submission of proof).
              Refund turnaround is typically <strong>5&ndash;10 business days</strong> via the original payment method.
            </p>
          </Section>

          <Section n="7" title="Dive Safety & Assumption of Risk">
            <p>
              Scuba diving, freediving, and related underwater activities are <strong>inherently hazardous</strong>. By booking any
              dive-related service on the Platform, you expressly acknowledge and accept the following:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5">
              <li>You participate at your own risk and assume full responsibility for your safety, health, and fitness to dive.</li>
              <li>You will truthfully complete every medical questionnaire and disclose all conditions that may affect your ability to dive.</li>
              <li>You will follow the instructions of your operator and dive instructor at all times.</li>
              <li>You will not dive under the influence of alcohol, recreational drugs, or prescribed medication that impairs judgement.</li>
              <li>You understand that no amount of equipment, training, or supervision eliminates the risks of pressure, marine life,
                  equipment failure, or human error.</li>
            </ul>
            <div className="mt-5 p-5 bg-slate-900 text-slate-100 rounded-xl">
              <p className="text-sm leading-relaxed">
                <strong className="text-cyan-400">Bottom Time LLP disclaims all liability</strong> for injury, illness, death, loss, or damage
                arising from any dive, course, or activity provided by a third-party operator. Your legal recourse for incidents lies with
                the operator and their insurer. We strongly encourage you to carry your own dive insurance (DAN or equivalent).
              </p>
            </div>
          </Section>

          <Section n="8" title="Operator Responsibilities">
            <p className="font-semibold text-slate-900 mb-2">If you list services as an operator or instructor, you additionally warrant that:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>You hold all licences, permits, and certifications required to operate legally in your jurisdiction.</li>
              <li>Your staff and dive leaders hold current professional-level certifications from a recognised agency.</li>
              <li>Your equipment is serviced, inspected, and fit for use per manufacturer and agency standards.</li>
              <li>You maintain adequate liability and medical-evacuation insurance covering all listed activities.</li>
              <li>You comply with all applicable tax, labour, marine-protection, and data-protection laws.</li>
              <li>Listings, photos, prices, and availability you publish are accurate and not misleading.</li>
              <li>You will honour the cancellation policy attached to each of your listings.</li>
            </ul>
            <p className="mt-4">
              Breach of any operator warranty is grounds for immediate suspension, withheld settlements, and potential legal action.
            </p>
          </Section>

          <Section n="9" title="User Content & Licence">
            <p>
              When you post photos, dive logs, reviews, trip notes, marine-life sightings, or any other content (<em>"User Content"</em>),
              you retain ownership of your content.
            </p>
            <p className="mt-3">
              You grant Bottom Time a <strong>worldwide, non-exclusive, royalty-free, sublicensable licence</strong> to host, store, display,
              reproduce, adapt, and distribute your User Content solely to operate, promote, and improve the Platform. This licence ends
              when you delete the content or your account, except that anonymised, aggregated data may be retained for analytics.
            </p>
            <p className="mt-3">
              You represent that your User Content does not infringe any third-party rights and complies with our content standards.
              We reserve the right to remove content that violates these Terms or applicable law.
            </p>
          </Section>

          <Section n="10" title="Prohibited Conduct">
            <p className="mb-2">You agree <strong>not</strong> to:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Use the Platform to solicit bookings off-platform to avoid commissions.</li>
              <li>Post false, defamatory, obscene, harassing, or discriminatory content.</li>
              <li>Impersonate another person or misrepresent your qualifications.</li>
              <li>Upload malware, scrape the Platform, reverse-engineer our APIs, or interfere with security measures.</li>
              <li>Use the Platform for any illegal activity, including money laundering, human trafficking, or trade in protected species.</li>
              <li>Collect or harvest other users' personal information without consent.</li>
            </ul>
          </Section>

          <Section n="11" title="Intellectual Property">
            <p>
              The Platform — including its code, design, logos, the <em>Bottom Time</em> word mark, the stylised <em>Waves</em> icon, databases,
              and all associated trademarks — is the exclusive property of Bottom Time LLP. You may not copy, modify, distribute, sell, or
              create derivative works without our prior written consent.
            </p>
          </Section>

          <Section n="12" title="Third-Party Services">
            <p>
              The Platform integrates with third-party services (payment processors, mapping providers, identity providers, tax-verification
              APIs, shipping providers). Their own terms and privacy practices apply to your use of those services. Bottom Time is not
              responsible for third-party acts or omissions outside our control.
            </p>
          </Section>

          <Section n="13" title="Fees & Taxes">
            <p>
              Bottom Time's use is free for divers. Operators pay a commission on completed bookings and may opt into paid visibility
              products (e.g. featured placement) governed by separate commercial terms.
            </p>
            <p className="mt-3">
              You are solely responsible for all taxes on your transactions. Bottom Time LLP collects and remits GST (India) on its platform
              commission where applicable; operators are responsible for the GST/VAT on the underlying dive service.
            </p>
          </Section>

          <Section n="14" title="Disclaimers">
            <p className="uppercase tracking-wide text-xs text-slate-500 mb-3">Plain-English version below the legalese.</p>
            <p>
              The Platform is provided on an <strong>"as is"</strong> and <strong>"as available"</strong> basis. To the maximum extent permitted
              by law, Bottom Time disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose,
              non-infringement, and uninterrupted availability.
            </p>
            <p className="mt-3 text-slate-500">
              <em>In plain English:</em> We do our best to keep the Platform working, accurate, and safe — but we can't promise it will always
              be perfect, error-free, or available 24/7.
            </p>
          </Section>

          <Section n="15" title="Limitation of Liability">
            <p>
              To the fullest extent permitted by law, Bottom Time LLP, its partners, employees, and agents shall not be liable for any indirect,
              incidental, consequential, special, or punitive damages, or for loss of profits, revenue, data, or goodwill, arising out of or in
              connection with your use of the Platform.
            </p>
            <p className="mt-3">
              Our aggregate liability for any direct damages shall not exceed the <strong>greater of (a) the amount you paid to Bottom Time in
              the twelve months preceding the claim, or (b) INR 10,000</strong>. Some jurisdictions do not allow certain liability limitations;
              in such cases the above limit applies to the maximum extent permitted.
            </p>
          </Section>

          <Section n="16" title="Indemnification">
            <p>
              You agree to indemnify and hold harmless Bottom Time LLP from any claims, losses, damages, liabilities, costs, and expenses
              (including reasonable legal fees) arising from (a) your breach of these Terms, (b) your violation of any law or third-party
              right, or (c) your User Content.
            </p>
          </Section>

          <Section n="17" title="Suspension & Termination">
            <p>
              You may close your account at any time from your profile settings. We may suspend or terminate your account with notice
              (and without notice in cases of fraud, safety risk, or serious breach). On termination, these Terms survive where their
              nature so requires (IP, liability, indemnity, dispute resolution).
            </p>
          </Section>

          <Section n="18" title="Governing Law & Dispute Resolution">
            <p>
              These Terms are governed by the laws of <strong>India</strong>, without regard to conflict-of-law principles. Before initiating any
              formal dispute, you agree to contact us in writing at <a href="mailto:legal@bottom-time.com" className="text-cyan-600 hover:underline">legal@bottom-time.com</a> and
              attempt to resolve the matter in good faith within 30 days.
            </p>
            <p className="mt-3">
              Unresolved disputes shall be submitted to binding arbitration in <strong>Mumbai, India</strong> under the Arbitration and
              Conciliation Act, 1996, before a sole arbitrator mutually appointed. The seat of arbitration is Mumbai and the language
              of arbitration is English. Either party retains the right to seek interim relief from a competent court.
            </p>
            <p className="mt-3 text-slate-500 text-xs">
              Nothing in this clause limits your statutory consumer rights in your jurisdiction of residence.
            </p>
          </Section>

          <Section n="19" title="Changes to These Terms">
            <p>
              We may update these Terms from time to time. When we make material changes, we will notify registered users via email
              and display a banner on the Platform for at least 14 days. Continued use after the effective date constitutes acceptance.
            </p>
          </Section>

          <Section n="20" title="Miscellaneous">
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Entire agreement.</strong> These Terms, the Privacy Policy, and any operator/commercial addenda form the entire agreement between you and us.</li>
              <li><strong>Severability.</strong> If any provision is held unenforceable, the remainder continues in full effect.</li>
              <li><strong>No waiver.</strong> Our failure to enforce a right is not a waiver.</li>
              <li><strong>Assignment.</strong> You may not assign these Terms without our written consent. We may assign them to an affiliate or successor.</li>
              <li><strong>Notices.</strong> Legal notices to Bottom Time must be sent to <a href="mailto:legal@bottom-time.com" className="text-cyan-600 hover:underline">legal@bottom-time.com</a>.</li>
            </ul>
          </Section>

          <Section n="21" title="Contact Us">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6">
              <p className="font-semibold text-slate-900">Bottom Time LLP</p>
              <p className="text-sm text-slate-600 mt-1">Registered Office — WeWork Enam Sambhav, C-20, G Block, Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra — 400051, India</p>
              <div className="mt-4 space-y-1 text-sm text-slate-600">
                <p>Legal &amp; contract notices — <a href="mailto:legal@bottom-time.com" className="text-cyan-600 hover:underline">legal@bottom-time.com</a></p>
                <p>Privacy &amp; data protection — <a href="mailto:privacy@bottom-time.com" className="text-cyan-600 hover:underline">privacy@bottom-time.com</a></p>
                <p>Security reports — <a href="mailto:security@bottom-time.com" className="text-cyan-600 hover:underline">security@bottom-time.com</a></p>
                <p>General support — <a href="mailto:hello@bottom-time.com" className="text-cyan-600 hover:underline">hello@bottom-time.com</a></p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-6 text-center">
              &copy; {new Date().getFullYear()} Bottom Time LLP. All rights reserved.
            </p>
          </Section>

        </article>
      </main>

      <Footer />
    </div>
  );
}


function Section({ n, title, children }) {
  return (
    <section className="mb-10" data-testid={`terms-section-${n}`}>
      <div className="flex items-baseline gap-4 mb-4">
        <span className="text-xs font-mono text-cyan-500 tracking-wider pt-1">{String(n).padStart(2, '0')}</span>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h2>
      </div>
      <div className="text-[15px] text-slate-600 leading-[1.7] pl-0 sm:pl-10">{children}</div>
    </section>
  );
}
