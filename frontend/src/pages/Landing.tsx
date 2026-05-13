import { useNavigate } from 'react-router-dom';
import {
  Send, Plug, Braces, Radio, BarChart3, Zap,
  Server, ArrowRight, Check, Globe,
} from 'lucide-react';

// ── Inline styles to keep landing page self-contained ────────────────────────
const S = {
  page:    { fontFamily: "'Inter', -apple-system, sans-serif", background: '#faf9f6', color: '#1a1a1a', minHeight: '100vh' } as React.CSSProperties,
  nav:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 5%', height: 64, borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#faf9f6', position: 'sticky', top: 0, zIndex: 50 } as React.CSSProperties,
  logo:    { display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' } as React.CSSProperties,
  logoMark:{ width: 28, height: 28, background: '#3730a3', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } as React.CSSProperties,
  logoText:{ fontSize: 16, fontWeight: 650, color: '#1a1a1a', letterSpacing: '-0.01em' } as React.CSSProperties,
  pill:    { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(55,48,163,0.08)', color: '#3730a3', borderRadius: 100, padding: '4px 14px', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const },
  hero:    { maxWidth: 1080, margin: '0 auto', padding: '96px 5% 80px', textAlign: 'center' as const },
  h1:      { fontSize: 'clamp(2.6rem, 5vw, 4.2rem)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, color: '#0f0f17', margin: '20px 0 24px' },
  lead:    { fontSize: 'clamp(1rem, 2vw, 1.2rem)', color: '#4b5563', lineHeight: 1.7, maxWidth: 580, margin: '0 auto 40px' },
  ctaRow:  { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' as const },
  btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', background: '#3730a3', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15, border: 'none', cursor: 'pointer', textDecoration: 'none', transition: 'background 150ms ease' } as React.CSSProperties,
  btnSecondary: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', background: 'transparent', color: '#1a1a1a', borderRadius: 8, fontWeight: 500, fontSize: 15, border: '1.5px solid rgba(0,0,0,0.15)', cursor: 'pointer', textDecoration: 'none', transition: 'border-color 150ms ease' } as React.CSSProperties,
  divider: { borderTop: '1px solid rgba(0,0,0,0.07)', margin: 0 },
  section: { maxWidth: 1080, margin: '0 auto', padding: '72px 5%' },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#6b7280', marginBottom: 12 },
  h2:      { fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.2, color: '#0f0f17', marginBottom: 16 },
  subtext: { fontSize: 16, color: '#6b7280', lineHeight: 1.7, maxWidth: 480 },
  grid3:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginTop: 48 },
  grid2:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 32, alignItems: 'center' },
  featureCard: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 10, padding: 28 } as React.CSSProperties,
  featureIcon: { width: 40, height: 40, borderRadius: 8, background: 'rgba(55,48,163,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 } as React.CSSProperties,
  featureTitle: { fontSize: 16, fontWeight: 650, color: '#0f0f17', marginBottom: 8 },
  featureDesc:  { fontSize: 14, color: '#6b7280', lineHeight: 1.65 },
  terminalWrap: { background: '#0f0f17', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' } as React.CSSProperties,
  terminalBar:  { display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' } as React.CSSProperties,
  terminalDot:  (c: string) => ({ width: 11, height: 11, borderRadius: '50%', background: c }) as React.CSSProperties,
  terminalBody: { padding: '20px 24px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, lineHeight: 2, color: '#e2e8f0' } as React.CSSProperties,
};

const features = [
  { icon: Send,     title: 'HTTP Request Builder', desc: 'Full REST client with environment variables, request chaining, and collection management.' },
  { icon: Plug,     title: 'WebSocket Client',      desc: 'Real-time bidirectional communication testing with message history and event streaming.' },
  { icon: Braces,   title: 'GraphQL Explorer',      desc: 'Schema introspection, query building, and variable support out of the box.' },
  { icon: Radio,    title: 'SSE Client',            desc: 'Test Server-Sent Events endpoints and observe live event streams with full replay.' },
  { icon: Server,   title: 'Mock Server',           desc: 'Spin up local mock endpoints with custom responses for offline development.' },
  { icon: BarChart3, title: 'Analytics & Monitors', desc: 'Track success rates, latency trends, and set up uptime monitors for any endpoint.' },
];

const metrics = [
  { value: '6+',    label: 'Protocol Support' },
  { value: '100%',  label: 'Open Source' },
  { value: '<50ms', label: 'Interface Response' },
  { value: '∞',     label: 'Request History' },
];

const checks = [
  'Environment variable interpolation',
  'Request collections & organization',
  'Real-time WebSocket & SSE testing',
  'GraphQL schema introspection',
  'API key management',
  'Uptime monitoring & alerting',
  'Import / Export (Postman, OpenAPI)',
  'Team workspaces',
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div style={S.page}>

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav style={S.nav}>
        <a href="/" style={S.logo}>
          <div style={S.logoMark}>
            <Zap style={{ width: 15, height: 15, color: '#fff' }} />
          </div>
          <span style={S.logoText}>API<span style={{ color: '#4f46e5' }}>Watch</span></span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate('/app')}
            style={{ ...S.btnSecondary, padding: '8px 18px', fontSize: 14 }}
          >
            Log in
          </button>
          <button
            onClick={() => navigate('/app')}
            style={{ ...S.btnPrimary, padding: '8px 18px', fontSize: 14 }}
          >
            Open App
          </button>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <div style={S.hero}>
        <div style={S.pill}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          Enterprise · Free to use
        </div>
        <h1 style={S.h1}>
          The API testing tool<br />engineers actually want.
        </h1>
        <p style={S.lead}>
          API-Watch is a professional-grade platform for testing HTTP, WebSocket, GraphQL, and SSE APIs.
          Built for speed, designed for clarity.
        </p>
        <div style={S.ctaRow}>
          <button onClick={() => navigate('/app')} style={S.btnPrimary}>
            Open Dashboard
            <ArrowRight style={{ width: 16, height: 16 }} />
          </button>
          <a
            href="https://github.com/Scarage1/API-Watch"
            target="_blank"
            rel="noreferrer"
            style={S.btnSecondary}
          >
            View on GitHub
          </a>
        </div>
      </div>

      {/* ── Terminal preview ─────────────────────────────────── */}
      <div style={{ ...S.section, paddingTop: 0 }}>
        <div style={S.terminalWrap}>
          <div style={S.terminalBar}>
            <div style={S.terminalDot('#ff5f57')} />
            <div style={S.terminalDot('#ffbd2e')} />
            <div style={S.terminalDot('#28ca41')} />
            <span style={{ marginLeft: 12, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>api-watch — request builder</span>
          </div>
          <div style={S.terminalBody}>
            <div style={{ color: '#9ca3af' }}># Send a request</div>
            <div>
              <span style={{ color: '#4ade80', fontWeight: 600 }}>POST </span>
              <span style={{ color: '#e2e8f0' }}>https://api.example.com/users</span>
            </div>
            <div style={{ color: '#9ca3af' }}>{`Content-Type: application/json`}</div>
            <div style={{ color: '#9ca3af' }}>{`Authorization: Bearer {{token}}`}</div>
            <div>&nbsp;</div>
            <div style={{ color: '#9ca3af' }}># Response — 201 Created — 142ms</div>
            <div><span style={{ color: '#818cf8' }}>{`{`}</span></div>
            <div>&nbsp;&nbsp;<span style={{ color: '#86efac' }}>"id"</span><span style={{ color: '#e2e8f0' }}>: </span><span style={{ color: '#fbbf24' }}>8421</span><span style={{ color: '#e2e8f0' }}>,</span></div>
            <div>&nbsp;&nbsp;<span style={{ color: '#86efac' }}>"status"</span><span style={{ color: '#e2e8f0' }}>: </span><span style={{ color: '#86efac' }}>"created"</span><span style={{ color: '#e2e8f0' }}>,</span></div>
            <div>&nbsp;&nbsp;<span style={{ color: '#86efac' }}>"email"</span><span style={{ color: '#e2e8f0' }}>: </span><span style={{ color: '#86efac' }}>"user@example.com"</span></div>
            <div><span style={{ color: '#818cf8' }}>{`}`}</span></div>
          </div>
        </div>
      </div>

      <hr style={S.divider} />

      {/* ── Metrics strip ───────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <div style={{ ...S.section, padding: '40px 5%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, textAlign: 'center' }}>
            {metrics.map((m) => (
              <div key={m.label}>
                <div style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 700, color: '#0f0f17', letterSpacing: '-0.03em' }}>{m.value}</div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Features ────────────────────────────────────────── */}
      <div style={S.section}>
        <p style={S.eyebrow}>Capabilities</p>
        <h2 style={S.h2}>Everything you need to test any API.</h2>
        <p style={S.subtext}>
          From simple GET requests to complex real-time protocols — API-Watch handles it all in one focused interface.
        </p>
        <div style={S.grid3}>
          {features.map((f) => (
            <div key={f.title} style={S.featureCard}>
              <div style={S.featureIcon}>
                <f.icon style={{ width: 18, height: 18, color: '#3730a3' }} />
              </div>
              <p style={S.featureTitle}>{f.title}</p>
              <p style={S.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <hr style={S.divider} />

      {/* ── Feature detail: two-col ──────────────────────────── */}
      <div style={{ background: '#fff' }}>
        <div style={{ ...S.section }}>
          <div style={S.grid2}>
            <div>
              <p style={S.eyebrow}>Built for engineers</p>
              <h2 style={{ ...S.h2, marginBottom: 20 }}>A complete toolkit, not a toy.</h2>
              <p style={{ ...S.subtext, marginBottom: 28 }}>
                Every feature in API-Watch was designed around real developer workflows — not demos.
                No surprise pricing, no feature walls.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {checks.map((c) => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 20, height: 20, background: 'rgba(55,48,163,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check style={{ width: 11, height: 11, color: '#3730a3' }} />
                    </div>
                    <span style={{ fontSize: 14, color: '#374151' }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { method: 'GET',    url: '/api/users?page=1', status: '200', ms: '89ms',   ok: true },
                { method: 'POST',   url: '/api/auth/login',   status: '201', ms: '142ms',  ok: true },
                { method: 'PUT',    url: '/api/users/8421',   status: '200', ms: '67ms',   ok: true },
                { method: 'DELETE', url: '/api/sessions/old', status: '204', ms: '34ms',   ok: true },
                { method: 'GET',    url: '/api/internal/debug',status: '403', ms: '12ms',  ok: false },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#faf9f6', borderRadius: 8, padding: '11px 16px', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 10, fontWeight: 700, padding: '2px 7px',
                    borderRadius: 4, minWidth: 52, textAlign: 'center',
                    background: row.method === 'GET' ? 'rgba(20,184,166,0.12)' : row.method === 'POST' ? 'rgba(22,163,74,0.12)' : row.method === 'PUT' ? 'rgba(217,119,6,0.12)' : 'rgba(220,38,38,0.12)',
                    color: row.method === 'GET' ? '#0f766e' : row.method === 'POST' ? '#15803d' : row.method === 'PUT' ? '#b45309' : '#b91c1c',
                  }}>{row.method}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#374151', flex: 1 }}>{row.url}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: row.ok ? '#16a34a' : '#dc2626' }}>{row.status}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#9ca3af', width: 48, textAlign: 'right' }}>{row.ms}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <div style={{ background: '#0f0f17' }}>
        <div style={{ ...S.section, textAlign: 'center' }}>
          <Globe style={{ width: 32, height: 32, color: 'rgba(255,255,255,0.3)', margin: '0 auto 20px' }} />
          <h2 style={{ ...S.h2, color: '#ffffff', marginBottom: 16 }}>
            Ready to test your APIs?
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', marginBottom: 32 }}>
            Open the dashboard and start making requests in seconds.
          </p>
          <button
            onClick={() => navigate('/app')}
            style={{ ...S.btnPrimary, background: '#6366f1', fontSize: 16, padding: '14px 32px' }}
          >
            Open API-Watch
            <ArrowRight style={{ width: 18, height: 18 }} />
          </button>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div style={{ background: '#0f0f17', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ ...S.section, padding: '24px 5%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ ...S.logoMark, width: 20, height: 20, borderRadius: 4 }}>
              <Zap style={{ width: 10, height: 10, color: '#fff' }} />
            </div>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>APIWatch v3.1 Enterprise</span>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            {[
              { label: 'GitHub', href: 'https://github.com/Scarage1/API-Watch' },
              { label: 'Dashboard', href: '/app' },
            ].map((l) => (
              <a key={l.label} href={l.href} style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}
                 onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                 onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
              >{l.label}</a>
            ))}
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>© 2025 API-Watch</span>
        </div>
      </div>
    </div>
  );
}
