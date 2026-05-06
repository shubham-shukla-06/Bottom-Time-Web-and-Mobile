import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400" data-testid="app-footer">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-wrap justify-center items-center gap-3 text-sm">
            <Link to="/privacy" className="hover:text-cyan-400 transition-colors" data-testid="footer-privacy">Privacy Policy</Link>
            <span className="text-slate-600" aria-hidden="true">|</span>
            <Link to="/terms" className="hover:text-cyan-400 transition-colors" data-testid="footer-terms">Terms of Service</Link>
            <span className="text-slate-600" aria-hidden="true">|</span>
            <Link to="/contact" className="hover:text-cyan-400 transition-colors" data-testid="footer-contact">Contact</Link>
          </div>

          <p className="text-sm text-slate-400">Copyright &copy; {new Date().getFullYear()} Bottom Time LLP. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
