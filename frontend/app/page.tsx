'use client'

import Link from 'next/link'
import { ArrowRight, ChevronDown, Orbit } from 'lucide-react'
import { GraphAnimation } from '@/components/home/GraphAnimation'
import { Reveal } from '@/components/home/Reveal'
import { FeatureChapters } from '@/components/home/FeatureChapters'
import { useHomeLinks } from '@/components/home/useHomeLinks'

export default function HomePage() {
  const { isAuthenticated, primary, feature } = useHomeLinks()

  return (
    <div className="lp">
      <a href="#main" className="lp-skip">Skip to content</a>
      <header className="topbar lp-nav">
        <Link href="/" className="brand" aria-label="CodeSphere home">
          <span className="brand-mark"><Orbit /></span>
          CodeSphere
        </Link>
        <nav className="lp-nav-links" aria-label="Homepage sections">
          <a href="#understand">Graph</a>
          <a href="#docs">Docs</a>
          <a href="#assistant">Assistant</a>
          <a href="#together">Collaborate</a>
        </nav>
        <div className="spacer" />
        {isAuthenticated ? (
          <Link id="nav-dashboard" href="/dashboard" className="btn btn-primary btn-sm">Open dashboard</Link>
        ) : (
          <Link id="nav-signin" href="/login" className="btn btn-primary btn-sm">Sign in</Link>
        )}
      </header>

      <main id="main" tabIndex={-1}>
        {/* ---------- Hero ---------- */}
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-hero-inner">
            <div className="lp-hero-copy">
              <span className="badge badge-lav lp-fade" style={{ animationDelay: '0ms' }}>
                <Orbit /> CodeSphere
              </span>
              <h1 id="lp-title" className="lp-title lp-fade" style={{ animationDelay: '80ms' }}>
                Find your way through <span className="lp-accent">any codebase</span>.
              </h1>
              <p className="lp-sub lp-fade" style={{ animationDelay: '160ms' }}>
                CodeSphere maps how your files depend on each other, writes the documentation you never had time
                for, and answers questions with the context of the entire repository.
              </p>
              <div className="row lp-fade lp-cta-row" style={{ animationDelay: '240ms' }}>
                <Link id="hero-cta" href={primary.href} className="btn btn-primary lp-btn-lg">
                  {primary.label} <ArrowRight />
                </Link>
                <a id="hero-explore" href="#features" className="btn lp-btn-lg">Explore CodeSphere</a>
              </div>
            </div>

            <div className="lp-hero-visual panel lp-fade" style={{ animationDelay: '200ms' }}>
              <div className="lp-window-bar">
                <span /><span /><span />
                <code className="xsmall muted">dependency-graph</code>
              </div>
              <GraphAnimation />
              <div className="lp-legend xsmall">
                <span><i style={{ background: 'var(--role-entry)' }} />Entry</span>
                <span><i style={{ background: 'var(--role-shared)' }} />Shared</span>
                <span><i style={{ background: 'var(--role-module)' }} />Module</span>
                <span><i style={{ background: 'var(--role-leaf)' }} />Leaf</span>
              </div>
            </div>
          </div>

          <a href="#features" className="lp-scroll-cue" aria-label="Scroll to features">
            <span className="xsmall">Scroll to explore</span>
            <ChevronDown />
          </a>
        </section>

        {/* ---------- Features ---------- */}
        <FeatureChapters feature={feature} />

        {/* ---------- How it works ---------- */}
        <section id="how" className="lp-section" aria-labelledby="how-title">
          <Reveal className="lp-section-head">
            <span className="lp-eyebrow mono">Getting started</span>
            <h2 id="how-title" className="lp-h2">From repository to understanding in three steps.</h2>
          </Reveal>

          <ol className="lp-steps">
            {[
              ['Add a project', 'Paste a Git URL or upload your source. CodeSphere parses it in the background.'],
              ['Explore the map', 'Navigate the dependency graph and read generated docs for each module.'],
              ['Ask anything', 'Use chat to trace flows, find responsibilities and onboard faster.'],
            ].map(([t, b], i) => (
              <Reveal key={t} as="li" delay={i * 100} className="lp-step">
                <span className="lp-step-num mono">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="title-md">{t}</h3>
                  <p className="muted small">{b}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ---------- Closing CTA ---------- */}
        <section className="lp-section" aria-labelledby="final-cta-title">
          <Reveal className="panel lp-cta">
            <span className="lp-eyebrow mono">Get started</span>
            <h2 id="final-cta-title" className="lp-h2">Ready to read code with a map?</h2>
            <p className="muted">
              {isAuthenticated
                ? 'Add a repository from your dashboard and CodeSphere will start mapping it right away.'
                : 'Create a free account, add any repository, and get a graph, docs and an assistant in minutes.'}
            </p>
            <div className="row lp-cta-row" style={{ justifyContent: 'center' }}>
              <Link id="final-cta" href={primary.href} className="btn btn-primary lp-btn-lg">
                {isAuthenticated ? 'Open dashboard' : 'Create your account'} <ArrowRight />
              </Link>
              {!isAuthenticated && (
                <Link id="final-signin" href="/login" className="btn lp-btn-lg">I already have an account</Link>
              )}
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Link href="/" className="brand"><span className="brand-mark"><Orbit /></span>CodeSphere</Link>
          <p className="xsmall muted">Understand any codebase: dependency graph, generated docs, and a chat that knows the code.</p>
        </div>
        <nav className="lp-footer-cols" aria-label="Footer">
          <div>
            <h3 className="lp-footer-h">Product</h3>
            <a href="#understand">Dependency graph</a>
            <a href="#docs">Documentation</a>
            <a href="#assistant">AI assistant</a>
            <a href="#together">Collaboration</a>
          </div>
          <div>
            <h3 className="lp-footer-h">App</h3>
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">Dashboard</Link>
                <Link href="/dashboard">Invitations</Link>
              </>
            ) : (
              <>
                <Link href="/login">Sign in</Link>
                <Link href="/login?mode=signup">Create account</Link>
                <Link href="/login?mode=forgot-password">Reset password</Link>
              </>
            )}
          </div>
        </nav>
        <div className="lp-footer-base xsmall muted">© {new Date().getFullYear()} CodeSphere</div>
      </footer>
    </div>
  )
}
