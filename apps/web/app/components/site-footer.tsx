import { Link } from "react-router";

export function SiteFooter() {
  return (
    <footer className="el-footer">
      <div className="el-footer-statement" aria-hidden="true">
        <span className="el-footer-line">Two devices.</span>
        <span className="el-footer-line el-footer-line--dim">One file.</span>
        <span className="el-footer-line el-footer-line--dim">Nothing left behind.</span>
      </div>
      <div className="el-footer-bar">
        <Link to="/" className="el-footer-wm" aria-label="handitoff.io home">
          <img src="/handitoff-dark-transparent.png" alt="" aria-hidden="true" className="wordmark-logo" />
          <span className="wordmark-text">handitoff.io</span>
        </Link>
        <nav className="el-footer-nav" aria-label="Footer">
          <Link to="/privacy">Privacy</Link>
          <Link to="/security">Security</Link>
          <Link to="/terms">Terms</Link>
          <a href="mailto:hello@handitoff.io">Contact</a>
        </nav>
        <span className="el-footer-copy">© 2026</span>
      </div>
    </footer>
  );
}
