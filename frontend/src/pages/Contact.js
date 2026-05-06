import { useEffect, useRef, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Waves, Mail, Shield, Anchor, Newspaper, Scale, Building2, Clock, ArrowRight, ChevronDown, Copy, CheckCircle2 } from 'lucide-react';

const CHANNELS = [
  {
    key: 'hello',
    label: 'General enquiries',
    email: 'hello@bottom-time.com',
    description: 'Questions, feedback, "how do I…" — the front door.',
    icon: Mail,
    accent: 'cyan',
  },
  {
    key: 'operators',
    label: 'Operator partnerships',
    email: 'operators@bottom-time.com',
    description: 'List your dive shop, onboard your team, commercial terms.',
    icon: Anchor,
    accent: 'emerald',
  },
  {
    key: 'press',
    label: 'Press & partnerships',
    email: 'press@bottom-time.com',
    description: 'Media requests, content collaborations, brand partnerships.',
    icon: Newspaper,
    accent: 'violet',
  },
  {
    key: 'security',
    label: 'Security & responsible disclosure',
    email: 'security@bottom-time.com',
    description: 'Vulnerabilities, abuse reports, account compromise.',
    icon: Shield,
    accent: 'rose',
  },
  {
    key: 'privacy',
    label: 'Privacy & data requests',
    email: 'privacy@bottom-time.com',
    description: 'Export, correction, deletion of personal data.',
    icon: Scale,
    accent: 'amber',
  },
  {
    key: 'legal',
    label: 'Legal notices',
    email: 'legal@bottom-time.com',
    description: 'Service of process, contracts, regulatory correspondence.',
    icon: Building2,
    accent: 'slate',
  },
];

const ACCENT_CLS = {
  cyan: 'text-cyan-500 bg-cyan-50 border-cyan-100',
  emerald: 'text-emerald-500 bg-emerald-50 border-emerald-100',
  violet: 'text-violet-500 bg-violet-50 border-violet-100',
  rose: 'text-rose-500 bg-rose-50 border-rose-100',
  amber: 'text-amber-500 bg-amber-50 border-amber-100',
  slate: 'text-slate-600 bg-slate-50 border-slate-100',
};

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', topic: 'general', message: '' });
  const [submitted, setSubmitted] = useState(null);  // holds { channel, subject, body } once the user has hit submit

  const handleSubmit = (e) => {
    e.preventDefault();
    const { name, email, topic, message } = form;
    const channel = CHANNELS.find(c => c.key === topic) || CHANNELS[0];
    const subject = `[${channel.label}] — ${name || 'New enquiry'}`;
    const body = `${message}\n\n—\n${name}\n${email}`;
    // Attempt to open the user's default email client. If no client is registered
    // on this device, this will silently fail — hence the fallback panel below
    // that gives the user copy-to-clipboard + web-mail shortcut links.
    window.location.href = `mailto:${channel.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSubmitted({ channel, subject, body });
  };

  const resetForm = () => {
    setSubmitted(null);
    setForm({ name: '', email: '', topic: 'general', message: '' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-white" data-testid="contact-page">
      <Navbar />

      <main className="flex-1">
        {/* Editorial hero */}
        <header className="border-b border-slate-100">
          <div className="max-w-5xl mx-auto px-6 pt-20 pb-14">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.05] max-w-3xl" data-testid="contact-title">
              Start the conversation.
            </h1>
            <p className="text-slate-600 text-base mt-5 leading-relaxed max-w-2xl">
              We read every message. Pick the right door below and we'll route you to the human who can actually help —
              no ticket queues, no bot replies, no "thanks for reaching out" form letters.
            </p>
          </div>
        </header>

        {/* Channel grid */}
        <section className="max-w-5xl mx-auto px-6 py-16">
          <div className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 mb-2">Direct channels</p>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Where to reach us</h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4" data-testid="contact-channels">
            {CHANNELS.map(c => {
              const Icon = c.icon;
              const accent = ACCENT_CLS[c.accent] || ACCENT_CLS.cyan;
              return (
                <a
                  key={c.key}
                  href={`mailto:${c.email}`}
                  data-testid={`contact-channel-${c.key}`}
                  className="group block bg-white rounded-2xl border border-slate-100 hover:border-cyan-300 p-6 hover:shadow-md transition-[box-shadow,border-color] duration-200"
                >
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border ${accent} mb-4 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-200`}>
                    <Icon size={18} />
                  </div>
                  <p className="text-base font-bold text-slate-900 mb-1">{c.label}</p>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4">{c.description}</p>
                  <p className="text-sm font-mono text-cyan-600 group-hover:underline flex items-center gap-1.5">
                    {c.email}
                    <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </p>
                </a>
              );
            })}
          </div>
        </section>

        {/* Quick form + response SLA + entity */}
        <section className="max-w-5xl mx-auto px-6 pb-16">
          <div className="grid md:grid-cols-[1.3fr_1fr] gap-6">
            {/* Form or success panel */}
            {submitted
              ? <SuccessPanel submitted={submitted} onReset={resetForm} />
              : (
            <form
              onSubmit={handleSubmit}
              className="bg-slate-50 border border-slate-100 rounded-2xl p-6 sm:p-8"
              data-testid="contact-form"
            >
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 mb-2">Or write to us here</p>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Send a message</h2>
                <p className="text-sm text-slate-500 mt-2">We'll open your email client pre-filled with the right address — you stay in control of what you send.</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <Field label="Your name" required>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Jane Diver"
                    data-testid="contact-form-name"
                    className="w-full h-11 px-4 bg-white border border-slate-200 rounded-lg text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none transition"
                  />
                </Field>
                <Field label="Email address" required>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    data-testid="contact-form-email"
                    className="w-full h-11 px-4 bg-white border border-slate-200 rounded-lg text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none transition"
                  />
                </Field>
              </div>

              <div className="mb-4">
                <div className="text-xs font-semibold text-slate-700 mb-1.5">
                  Topic <span className="text-rose-500">*</span>
                </div>
                <TopicDropdown
                  value={form.topic}
                  onChange={v => setForm({ ...form, topic: v })}
                  options={CHANNELS}
                />
              </div>

              <Field label="Message" required className="mb-6">
                <textarea
                  required
                  rows={5}
                  value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                  placeholder="Tell us what's on your mind — the more context, the better we can help."
                  data-testid="contact-form-message"
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none transition resize-none"
                />
              </Field>

              <button
                type="submit"
                data-testid="contact-form-submit"
                className="h-12 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-full font-bold text-sm inline-flex items-center gap-2 transition-colors"
              >
                Compose email <ArrowRight size={16} />
              </button>
              <p className="text-xs text-slate-400 mt-3">We don't store submissions on the Platform — your message opens in your own email client. No email client? We'll show you a one-click fallback.</p>
            </form>
              )}

            {/* Sidebar: SLA + entity card */}
            <div className="space-y-4">
              <div className="bg-white border border-slate-100 rounded-2xl p-6">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-cyan-100 bg-cyan-50 text-cyan-500 mb-4">
                  <Clock size={18} />
                </div>
                <p className="text-base font-bold text-slate-900 mb-2">Response times</p>
                <ul className="space-y-2 text-sm text-slate-600 leading-relaxed">
                  <li className="flex justify-between"><span>General</span><span className="font-semibold text-slate-900">&lt; 48 hrs</span></li>
                  <li className="flex justify-between"><span>Operators</span><span className="font-semibold text-slate-900">&lt; 24 hrs</span></li>
                  <li className="flex justify-between"><span>Security</span><span className="font-semibold text-slate-900">&lt; 8 hrs</span></li>
                  <li className="flex justify-between"><span>Privacy</span><span className="font-semibold text-slate-900">&lt; 30 days</span></li>
                  <li className="flex justify-between"><span>Legal</span><span className="font-semibold text-slate-900">&lt; 7 days</span></li>
                </ul>
                <p className="text-xs text-slate-400 mt-4">Business hours — Mon–Fri, 10:00–19:00 IST. Security and safety issues are monitored 24/7.</p>
              </div>

              <div className="bg-slate-900 text-slate-200 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Waves className="text-cyan-400" size={18} />
                  <p className="text-base font-bold text-white">Bottom Time LLP</p>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Registered office<br />
                  WeWork Enam Sambhav, C-20, G Block<br />
                  Bandra Kurla Complex, Bandra East<br />
                  Mumbai, Maharashtra — 400051, India
                </p>
                <p className="text-xs text-slate-500 mt-4 leading-relaxed">
                  Legal notices and service of process must be sent to <a href="mailto:legal@bottom-time.com" className="text-cyan-400 hover:underline">legal@bottom-time.com</a>.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}


function Field({ label, required, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-slate-700 mb-1.5 inline-block">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}


function SuccessPanel({ submitted, onReset }) {
  const { channel, subject, body } = submitted;
  const [copied, setCopied] = useState(null);  // 'email' | 'message' | null

  const copy = async (kind, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // clipboard api unavailable — non-fatal
    }
  };

  const qs = `to=${encodeURIComponent(channel.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&${qs}`;
  const outlook = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(channel.email)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const yahoo = `https://compose.mail.yahoo.com/?${qs}`;

  return (
    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 sm:p-8" data-testid="contact-success-panel">
      <div className="flex items-start gap-3 mb-5">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-500 flex-shrink-0">
          <CheckCircle2 size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">We opened your email client.</h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            If the compose window didn't appear, your browser may not have a default mail client registered. Use any of the options below to send it another way — nothing is lost.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Copy recipient */}
        <div className="bg-white border border-slate-100 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Send to</p>
            <p className="text-sm font-mono text-slate-900 truncate">{channel.email}</p>
          </div>
          <button
            type="button"
            onClick={() => copy('email', channel.email)}
            data-testid="contact-copy-email-btn"
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-cyan-300 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-colors"
          >
            {copied === 'email' ? <><CheckCircle2 size={14} className="text-emerald-500" /> Copied</> : <><Copy size={14} /> Copy</>}
          </button>
        </div>

        {/* Copy message body */}
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your message</p>
            <button
              type="button"
              onClick={() => copy('message', `Subject: ${subject}\n\n${body}`)}
              data-testid="contact-copy-message-btn"
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-cyan-300 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-colors"
            >
              {copied === 'message' ? <><CheckCircle2 size={14} className="text-emerald-500" /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>
          <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 border border-slate-100 rounded-lg p-3 max-h-40 overflow-y-auto">{`Subject: ${subject}\n\n${body}`}</pre>
        </div>

        {/* Web-mail quick links */}
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Or send directly from the web</p>
          <div className="flex flex-wrap gap-2">
            <a href={gmail} target="_blank" rel="noopener noreferrer"
              data-testid="contact-send-gmail"
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-colors">
              Gmail <ArrowRight size={12} />
            </a>
            <a href={outlook} target="_blank" rel="noopener noreferrer"
              data-testid="contact-send-outlook"
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-200 hover:text-sky-600 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-colors">
              Outlook <ArrowRight size={12} />
            </a>
            <a href={yahoo} target="_blank" rel="noopener noreferrer"
              data-testid="contact-send-yahoo"
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-violet-50 hover:border-violet-200 hover:text-violet-600 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-colors">
              Yahoo <ArrowRight size={12} />
            </a>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onReset}
          data-testid="contact-send-another-btn"
          className="text-sm font-semibold text-slate-600 hover:text-cyan-600 inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowRight size={14} className="rotate-180" /> Send another message
        </button>
        <p className="text-xs text-slate-400">Every message lands in a real inbox.</p>
      </div>
    </div>
  );
}


function TopicDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);

  const selected = options.find(o => o.key === value) || options[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Keyboard: Escape closes, arrows navigate, Enter picks
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setHighlight(Math.max(0, options.findIndex(o => o.key === value)));
      setOpen(true);
      return;
    }
    if (open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, options.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
      if (e.key === 'Enter')     { e.preventDefault(); onChange(options[highlight].key); setOpen(false); }
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="contact-form-topic"
        className="w-full h-11 pl-4 pr-10 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 text-left focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none transition cursor-pointer flex items-center"
      >
        <span className="flex-1 truncate">{selected.label}</span>
        <ChevronDown
          size={16}
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          data-testid="contact-form-topic-options"
          className="absolute top-full left-0 z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden py-1 max-h-64 overflow-y-auto"
        >
          {options.map((o, i) => (
            <li
              key={o.key}
              role="option"
              aria-selected={o.key === value}
              data-testid={`contact-topic-option-${o.key}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); onChange(o.key); setOpen(false); }}
              className={`px-4 py-2 text-sm cursor-pointer ${
                i === highlight ? 'bg-cyan-50 text-cyan-700' : 'text-slate-700'
              } ${o.key === value ? 'font-semibold' : ''}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
