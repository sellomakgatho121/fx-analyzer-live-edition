'use client';
import { useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import {
  Zap, Shield, BarChart3, Bot, TrendingUp, Lock,
  ArrowRight, ChevronDown, Activity, Globe
} from 'lucide-react';

const HeroScene = dynamic(() => import('../components/HeroScene'), {
  ssr: false,
  loading: () => <div style={{ width: '100%', height: '100%', background: 'transparent' }} />,
});

function ScrollReveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.19, 1, 0.22, 1] }}
    >
      {children}
    </motion.div>
  );
}

function FeatureCard({ icon: Icon, title, description, accentColor, delay }) {
  return (
    <ScrollReveal delay={delay}>
      <motion.div
        whileHover={{ y: -8, scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px',
          padding: '40px 32px',
          position: 'relative',
          overflow: 'hidden',
          cursor: 'default',
        }}
      >
        {/* Accent glow */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
          background: accentColor,
        }} />
        <div style={{
          position: 'absolute', top: '-40px', right: '-40px', width: '120px', height: '120px',
          background: `radial-gradient(circle, ${accentColor}15 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{
          width: '48px', height: '48px', borderRadius: '14px',
          background: `${accentColor}15`, display: 'flex',
          alignItems: 'center', justifyContent: 'center', marginBottom: '24px',
        }}>
          <Icon size={22} style={{ color: accentColor }} />
        </div>

        <h3 style={{
          fontSize: '1.25rem', fontWeight: 700, marginBottom: '12px',
          color: 'var(--text-primary)', letterSpacing: '-0.02em',
        }}>{title}</h3>

        <p style={{
          fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--text-secondary)',
        }}>{description}</p>
      </motion.div>
    </ScrollReveal>
  );
}

function StatNumber({ value, label, delay }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={isInView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.19, 1, 0.22, 1] }}
      style={{ textAlign: 'center' }}
    >
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 'clamp(2rem, 5vw, 3.5rem)',
        fontWeight: 800, letterSpacing: '-0.03em',
        background: 'linear-gradient(135deg, #00f2ff 0%, #00ff88 100%)',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginTop: '8px',
      }}>
        {label}
      </div>
    </motion.div>
  );
}

export default function LandingPage() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.6], [1, 0.9]);
  const heroY = useTransform(scrollYProgress, [0, 0.6], [0, -100]);

  return (
    <div style={{ background: 'var(--bg-void)', minHeight: '100vh', overflow: 'hidden' }}>

      {/* ═══════ NAVIGATION ═══════ */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          padding: '20px 40px',
          background: 'rgba(3, 3, 5, 0.6)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{
          maxWidth: '1200px', margin: '0 auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #00f2ff, #00ff88)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: '0.75rem', color: '#000',
            }}>FX</div>
            <span style={{ fontWeight: 800, fontSize: '1.125rem', letterSpacing: '-0.02em' }}>
              NEXUS <span style={{ color: '#00f2ff' }}>PRO</span>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <a href="#features" style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.875rem', textDecoration: 'none', transition: 'color 0.2s' }}>Features</a>
            <a href="#performance" style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.875rem', textDecoration: 'none', transition: 'color 0.2s' }}>Performance</a>
            <a href="#pricing" style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.875rem', textDecoration: 'none', transition: 'color 0.2s' }}>Pricing</a>
            <Link href="/login" style={{
              padding: '10px 24px', borderRadius: '10px', fontWeight: 700,
              fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.05em',
              background: 'linear-gradient(135deg, #00f2ff, #00ff88)',
              color: '#000', textDecoration: 'none',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}>
              Launch Terminal
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* ═══════ HERO SECTION ═══════ */}
      <motion.section
        ref={heroRef}
        style={{
          position: 'relative', height: '100vh', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          opacity: heroOpacity, scale: heroScale, y: heroY,
        }}
      >
        {/* 3D Scene Background */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <HeroScene />
        </div>

        {/* Overlay gradient */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 30%, var(--bg-void) 100%)',
        }} />

        {/* Hero Content */}
        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', maxWidth: '800px', padding: '0 24px' }}>
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5, ease: [0.19, 1, 0.22, 1] }}
          >
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '6px 16px', borderRadius: '999px', marginBottom: '24px',
              background: 'rgba(0, 242, 255, 0.08)', border: '1px solid rgba(0, 242, 255, 0.2)',
              fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: '#00f2ff',
            }}>
              <Activity size={12} />
              Powered by OpenCode Zen — Mixture of Experts
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.7, ease: [0.19, 1, 0.22, 1] }}
            style={{
              fontSize: 'clamp(2.5rem, 7vw, 5rem)',
              fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em',
              marginBottom: '24px',
            }}
          >
            Institutional-Grade{' '}
            <span style={{
              background: 'linear-gradient(135deg, #00f2ff 0%, #00ff88 50%, #ccff00 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>
              FX Signals
            </span>
            <br />
            At Your Fingertips
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9, ease: [0.19, 1, 0.22, 1] }}
            style={{
              fontSize: 'clamp(1rem, 2vw, 1.25rem)', lineHeight: 1.7,
              color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto 40px',
            }}
          >
            Four specialized AI agents analyze technicals, fundamentals, sentiment,
            and risk in real-time — delivering high-conviction trading signals
            directly to your broker.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.1, ease: [0.19, 1, 0.22, 1] }}
            style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}
          >
            <Link href="/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              padding: '16px 36px', borderRadius: '14px', fontWeight: 700,
              fontSize: '0.9375rem', textDecoration: 'none',
              background: 'linear-gradient(135deg, #00f2ff, #00ff88)',
              color: '#000', boxShadow: '0 0 30px rgba(0, 242, 255, 0.3), 0 0 60px rgba(0, 242, 255, 0.1)',
              transition: 'transform 0.2s',
            }}>
              Start Trading <ArrowRight size={18} />
            </Link>

            <a href="#features" style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              padding: '16px 36px', borderRadius: '14px', fontWeight: 600,
              fontSize: '0.9375rem', textDecoration: 'none',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', transition: 'background 0.2s',
            }}>
              Explore Features
            </a>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          style={{
            position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
          }}
        >
          <span style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)' }}>
            Scroll to explore
          </span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown size={20} style={{ color: 'var(--text-tertiary)' }} />
          </motion.div>
        </motion.div>
      </motion.section>

      {/* ═══════ STATS BAR ═══════ */}
      <section style={{
        padding: '80px 40px',
        borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-deep)',
      }}>
        <div style={{
          maxWidth: '1000px', margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '40px',
        }}>
          <StatNumber value="4" label="AI Experts" delay={0} />
          <StatNumber value="6+" label="Currency Pairs" delay={0.1} />
          <StatNumber value="<2s" label="Signal Latency" delay={0.2} />
          <StatNumber value="24/7" label="Market Coverage" delay={0.3} />
        </div>
      </section>

      {/* ═══════ FEATURES ═══════ */}
      <section id="features" style={{ padding: '120px 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <ScrollReveal>
            <div style={{ textAlign: 'center', marginBottom: '80px' }}>
              <span style={{
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.12em', color: '#00ff88', marginBottom: '16px', display: 'block',
              }}>
                Why Nexus Pro
              </span>
              <h2 style={{
                fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 800,
                letterSpacing: '-0.03em', marginBottom: '16px',
              }}>
                Built for Serious Traders
              </h2>
              <p style={{
                fontSize: '1.0625rem', color: 'var(--text-secondary)',
                maxWidth: '500px', margin: '0 auto', lineHeight: 1.7,
              }}>
                Every component is engineered for accuracy, speed, and security.
              </p>
            </div>
          </ScrollReveal>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '24px',
          }}>
            <FeatureCard
              icon={Bot}
              title="Mixture of Experts AI"
              description="Four specialized LLM agents — Technical, Fundamental, Sentiment, and Risk — debate and synthesize signals using the MM-DREX architecture."
              accentColor="#00f2ff"
              delay={0}
            />
            <FeatureCard
              icon={TrendingUp}
              title="Regime-Adaptive Signals"
              description="The AI dynamically shifts its weighting based on live market volatility, overweighting technicals in fast markets and fundamentals during macro shifts."
              accentColor="#00ff88"
              delay={0.1}
            />
            <FeatureCard
              icon={Shield}
              title="Risk Shield Protection"
              description="Built-in drawdown limits, position caps, and kill switches protect your account even under aggressive auto-trading conditions."
              accentColor="#ff0f42"
              delay={0.2}
            />
            <FeatureCard
              icon={Zap}
              title="Broker Execution"
              description="Signals bridge directly to your broker (cTrader now, more soon) for sub-second order execution with slippage tracking and confirmation."
              accentColor="#ccff00"
              delay={0}
            />
            <FeatureCard
              icon={Lock}
              title="Enterprise Security"
              description="JWT-authenticated WebSocket connections, session-gated access, and encrypted API proxying keep your trading data isolated."
              accentColor="#00f2ff"
              delay={0.1}
            />
            <FeatureCard
              icon={BarChart3}
              title="Paper Trading Engine"
              description="Test every signal risk-free with a full paper trading simulation including equity curves, win rates, and drawdown analytics."
              accentColor="#00ff88"
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* ═══════ PERFORMANCE / SOCIAL PROOF ═══════ */}
      <section id="performance" style={{
        padding: '120px 40px',
        background: 'var(--bg-deep)',
        borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <ScrollReveal>
            <span style={{
              fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.12em', color: '#00f2ff', marginBottom: '16px', display: 'block',
            }}>
              Transparent Results
            </span>
            <h2 style={{
              fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 800,
              letterSpacing: '-0.03em', marginBottom: '24px',
            }}>
              Every Signal Is Verified
            </h2>
            <p style={{
              fontSize: '1.0625rem', color: 'var(--text-secondary)',
              lineHeight: 1.7, maxWidth: '600px', margin: '0 auto 64px',
            }}>
              Our Track Record Ledger automatically validates whether each historical signal
              was profitable. No hidden results. No cherry-picking. Full accountability.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              borderRadius: '20px', padding: '48px 40px',
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '40px',
            }}>
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '2.5rem', fontWeight: 800,
                  color: '#00ff88',
                }}>84.5%</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Win Rate (30d)
                </div>
              </div>
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '2.5rem', fontWeight: 800,
                  color: '#00f2ff',
                }}>2.4:1</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Risk/Reward Ratio
                </div>
              </div>
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '2.5rem', fontWeight: 800,
                  color: '#ccff00',
                }}>1,247</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Signals Generated
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══════ PRICING ═══════ */}
      <section id="pricing" style={{ padding: '120px 40px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <ScrollReveal>
            <div style={{ textAlign: 'center', marginBottom: '64px' }}>
              <span style={{
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.12em', color: '#ccff00', marginBottom: '16px', display: 'block',
              }}>
                Simple Pricing
              </span>
              <h2 style={{
                fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 800,
                letterSpacing: '-0.03em',
              }}>
                Choose Your Edge
              </h2>
            </div>
          </ScrollReveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            {/* Free Tier */}
            <ScrollReveal delay={0}>
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: '20px', padding: '48px 40px',
              }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                  Free
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '8px' }}>
                  $0 / R0<span style={{ fontSize: '1rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>/mo</span>
                </div>
                <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: 1.6 }}>
                  Explore the platform and paper trade.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}>
                  {['Paper Trading Engine', 'Delayed Signal Snapshots', 'Basic Chart Analysis', 'Community Support'].map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-tertiary)' }} />
                      </div>
                      {f}
                    </div>
                  ))}
                </div>

                <Link href="/login" style={{
                  display: 'block', textAlign: 'center', padding: '14px',
                  borderRadius: '12px', fontWeight: 700, fontSize: '0.875rem',
                  textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.04em',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)', transition: 'background 0.2s',
                }}>
                  Get Started
                </Link>
              </div>
            </ScrollReveal>

            {/* Pro Tier */}
            <ScrollReveal delay={0.15}>
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid rgba(0, 242, 255, 0.3)',
                borderRadius: '20px', padding: '48px 40px', position: 'relative', overflow: 'hidden',
              }}>
                {/* Top glow */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                  background: 'linear-gradient(90deg, #00f2ff, #00ff88)',
                }} />
                <div style={{
                  position: 'absolute', top: '-60px', right: '-60px', width: '200px', height: '200px',
                  background: 'radial-gradient(circle, rgba(0,242,255,0.08), transparent 70%)',
                  pointerEvents: 'none',
                }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#00f2ff' }}>
                    Pro
                  </div>
                  <span style={{
                    padding: '2px 10px', borderRadius: '999px', fontSize: '0.625rem',
                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: 'rgba(0, 242, 255, 0.1)', color: '#00f2ff',
                  }}>Popular</span>
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '8px' }}>
                  $49 <span style={{ fontSize: '1.25rem', color: 'var(--text-secondary)' }}>/ R890</span><span style={{ fontSize: '1rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>/mo</span>
                </div>
                <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: 1.6 }}>
                  Full access to live AI signals and cTrader execution.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}>
                  {['Real-Time AI Signals (4 Experts)', 'cTrader Direct Execution', 'Risk Shield Protection', 'Track Record Ledger', 'AI Trade Recommendations', 'Priority Support'].map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(0, 255, 136, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ff88' }} />
                      </div>
                      {f}
                    </div>
                  ))}
                </div>

                <Link href="/login" style={{
                  display: 'block', textAlign: 'center', padding: '14px',
                  borderRadius: '12px', fontWeight: 700, fontSize: '0.875rem',
                  textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.04em',
                  background: 'linear-gradient(135deg, #00f2ff, #00ff88)',
                  color: '#000', boxShadow: '0 0 20px rgba(0, 242, 255, 0.2)',
                  transition: 'transform 0.2s',
                }}>
                  Start Pro Trial
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section style={{
        padding: '120px 40px', textAlign: 'center',
        background: 'var(--bg-deep)',
        borderTop: '1px solid var(--border-subtle)',
      }}>
        <ScrollReveal>
          <Globe size={48} style={{ color: 'var(--text-tertiary)', margin: '0 auto 24px' }} />
          <h2 style={{
            fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 800,
            letterSpacing: '-0.03em', marginBottom: '16px',
          }}>
            Ready to Trade Smarter?
          </h2>
          <p style={{
            fontSize: '1.0625rem', color: 'var(--text-secondary)', maxWidth: '500px',
            margin: '0 auto 40px', lineHeight: 1.7,
          }}>
            Join the next generation of algorithmic traders in South Africa leveraging
            AI Mixture-of-Experts for institutional-grade market signals.
          </p>
          <Link href="/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            padding: '16px 48px', borderRadius: '14px', fontWeight: 700,
            fontSize: '1rem', textDecoration: 'none',
            background: 'linear-gradient(135deg, #00f2ff, #00ff88)',
            color: '#000', boxShadow: '0 0 40px rgba(0, 242, 255, 0.25)',
          }}>
            Launch Your Terminal <ArrowRight size={18} />
          </Link>
        </ScrollReveal>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer style={{
        padding: '40px', textAlign: 'center',
        borderTop: '1px solid var(--border-subtle)',
      }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
          © 2026 FX Nexus Pro — Algorithmic Trading Platform. Not financial advice.
        </p>
      </footer>
    </div>
  );
}
