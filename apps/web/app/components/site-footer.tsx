import { Link } from "react-router";

export function SiteFooter() {
  return (
    <footer className="el-footer">
      <div className="el-footer-inner">
        <div className="el-footer-brand">
          <Link to="/" className="el-footer-wordmark" aria-label="handitoff home">
            handitoff.
          </Link>
          <p className="el-footer-tagline">
            A browser tool for moving files between devices.
            Open it, hand a file across, close the tab.
          </p>
        </div>

        <div className="el-footer-nav-grid">
          <div className="el-footer-nav-col">
            <div className="el-footer-nav-head">Product</div>
            <Link to="/">Transfer</Link>
            <a href="/#how-it-works">How it works</a>
            <Link to="/faq">FAQ</Link>
          </div>
          <div className="el-footer-nav-col">
            <div className="el-footer-nav-head">Trust</div>
            <Link to="/privacy">Privacy</Link>
            <Link to="/security">Security</Link>
            <Link to="/terms">Terms</Link>
          </div>
          <div className="el-footer-nav-col">
            <div className="el-footer-nav-head">Other</div>
            <a href="mailto:hello@handitoff.io">Contact</a>
          </div>
        </div>
      </div>

      <hr className="el-footer-rule" />

      <div className="el-footer-bar">
        <span>© {new Date().getFullYear()} handitoff</span>
        <span>Browser-only · peer-to-peer · no servers in between</span>
        <span>Made for a single moment</span>
      </div>
    </footer>
  );
}
