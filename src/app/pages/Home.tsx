import { lazy, Suspense, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import type * as THREE from 'three';
import {
  History,
  Sparkles,
  Crosshair,
  Radar,
  Mountain,
  BrainCircuit,
  Trees,
  Sprout,
  TrainFront,
  Zap,
  Waves,
  Layers,
  Globe,
  Gauge,
  Wand2,
  Boxes,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../i18n';
import heroGalaxyUrl from '../../assets/earth/hero-galaxy.webp';
import { SectionHeader } from '../components/SectionHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { SATELLITES } from '../data/satellites';
import { SOLUTIONS } from '../data/solutions';
import { REGIONS } from '../data/products';

const SOLUTION_ICONS: Record<string, LucideIcon> = {
  Trees,
  Sprout,
  Mountain,
  TrainFront,
  Zap,
  Waves,
};

const HeroGlobe = lazy(() => import('../components/HeroGlobe').then((module) => ({ default: module.HeroGlobe })));

export function Home() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [globeTransform, setGlobeTransform] = useState({ scale: 1, x: 0, y: 0 });
  const rigRef = useRef<THREE.Group | null>(null);

  // Enter the map data center already carrying the user's intent (place / coords).
  const go = async (q: string = query) => {
    const targetUrl = `/explore${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`;

    // Start transition animation
    setIsTransitioning(true);

    // Animate globe in Three.js scene
    if (rigRef.current) {
      const startX = rigRef.current.position.x; // Initial: 2.6 (right side)
      const targetX = 0; // Move to center (0 is center of canvas)
      const startTime = Date.now();
      const duration = 1000; // 1 second

      const animate = () => {
        if (!rigRef.current) return;

        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function: ease-in-out cubic
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        rigRef.current.position.x = startX + (targetX - startX) * eased;

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      animate();
    }

    // Trigger CSS scale animation
    setGlobeTransform({ scale: 8, x: 0, y: 50 });

    // Navigate earlier (at 500ms) so map page can start fading in while globe is still visible
    setTimeout(() => {
      navigate(targetUrl);
    }, 500);
  };

  // Live location matches for the hero search — reduces the "empty jump" friction.
  const suggestions = (() => {
    const s = query.trim().toLowerCase();
    if (!s) return [];
    return REGIONS.filter((r) =>
      r.aliases.some((a) => a.toLowerCase().includes(s)) ||
      r.name.toLowerCase().includes(s) ||
      r.nameEn.toLowerCase().includes(s),
    ).slice(0, 6);
  })();

  // A few high-value locations offered as one-click entries.
  const quickRegions = REGIONS.slice(0, 5);

  const categories = [
    { route: 'archive', icon: History, ...t.categories.history },
    { route: 'latest', icon: Sparkles, ...t.categories.latest },
    { route: 'tasking', icon: Crosshair, ...t.categories.tasking },
    { route: 'sar', icon: Radar, ...t.categories.sar },
    { route: 'dem', icon: Mountain, ...t.categories.dem },
    { route: 'analysis', icon: BrainCircuit, ...t.categories.ai },
  ];

  const advantages = [
    { icon: Layers, ...t.advantages.multiSource },
    { icon: Globe, ...t.advantages.global },
    { icon: Gauge, ...t.advantages.fastQuote },
    { icon: Wand2, ...t.advantages.processing },
    { icon: BrainCircuit, ...t.advantages.aiService },
    { icon: Boxes, ...t.advantages.delivery },
  ];

  const steps = [t.process.step1, t.process.step2, t.process.step3, t.process.step4, t.process.step5];

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero — cosmic */}
      <section className="relative flex min-h-[600px] w-full items-center justify-center overflow-hidden border-b border-border sm:min-h-[700px] lg:min-h-[820px]">
        {/* Galaxy wash */}
        <img
          src={heroGalaxyUrl}
          alt="Deep space galaxy"
          decoding="async"
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-[0.18] grayscale"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />

        {/* Real WebGL 3D globe — full-bleed, sits below the text layer, auto-rotates + drag to spin */}
        <motion.div
          className="absolute inset-0 z-[5] hidden lg:block"
          animate={globeTransform}
          transition={{ duration: 1.0, ease: [0.76, 0, 0.24, 1] }}
          style={{
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        >
          <Suspense fallback={<div className="absolute right-[10%] top-1/2 size-[min(42vw,34rem)] -translate-y-1/2 rounded-full border border-primary/10 bg-primary/[0.025] shadow-[0_0_100px_rgba(255,255,255,0.04)]" />}>
            <HeroGlobe
              className="absolute inset-0"
              onRigChange={(rig) => {
                rigRef.current = rig;
              }}
            />
          </Suspense>
          {/* Clickable overlay on top of globe but below text */}
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              go();
            }}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            role="button"
            tabIndex={0}
            aria-label={t.common.searchData}
          />
          {/* White overlay that fades in as globe zooms - removed to eliminate black screen */}
          {isTransitioning && (
            <motion.div
              className="pointer-events-none absolute inset-0 bg-background"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.6 }}
            />
          )}
        </motion.div>

        <motion.div
          className="pointer-events-none relative z-10 mx-auto w-full max-w-[1200px] px-4 sm:px-6"
          animate={{ opacity: isTransitioning ? 0 : 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mx-auto max-w-2xl lg:mx-0 lg:-mt-12">
            {/* Terminal-style title with typing cursor */}
            <h1 className="font-mono text-[1.75rem] leading-[1.2] tracking-tight sm:text-[2.6rem] lg:text-[3.4rem]">
              <span className="text-primary">&gt;</span> {t.home.heroTitle}
              <span className="animate-terminal-cursor text-primary">_</span>
            </h1>
            <p className="mt-4 max-w-xl font-mono text-xs text-muted-foreground sm:mt-5 sm:text-sm">{t.home.heroSubtitle}</p>

            <div className="pointer-events-auto relative mt-6 w-full max-w-xl sm:mt-8">
              <div className="flex flex-col items-stretch gap-2 rounded-lg border border-primary/30 bg-background/40 p-3 shadow-lg shadow-primary/10 backdrop-blur sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-2">
                  <span className="font-mono text-xs text-primary sm:text-sm">&gt;</span>
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setTimeout(() => setFocused(false), 150)}
                    onKeyDown={(e) => e.key === 'Enter' && go()}
                    placeholder={t.home.searchPlaceholder}
                    className="border-0 bg-transparent font-mono text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 sm:text-base"
                  />
                </div>
                <Button onClick={() => go()} className="shrink-0 font-mono">
                  {t.common.searchData}
                </Button>
              </div>

              {/* Live location suggestions */}
              {focused && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-primary/30 bg-popover/90 shadow-xl backdrop-blur">
                  {suggestions.map((r) => (
                    <button
                      key={r.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(r.aliases[0])}
                      className="flex w-full items-center gap-2 border-b border-primary/10 px-3 py-2 text-left text-sm font-mono transition-colors last:border-0 hover:bg-primary/10"
                    >
                      <span className="text-primary">&gt;</span>
                      <span>{lang === 'zh' ? r.name : r.nameEn}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {r.center[1].toFixed(2)}, {r.center[0].toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* One-click high-value locations with terminal style */}
            <div className="pointer-events-auto mt-3 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:gap-2">
              <span className="font-mono text-[10px] text-muted-foreground sm:text-xs">{t.home.quickLocations}:</span>
              {quickRegions.map((r) => (
                <button
                  key={r.id}
                  onClick={() => go(r.aliases[0])}
                  className="flex items-center gap-1 rounded border border-primary/30 bg-secondary/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-foreground sm:px-2.5 sm:py-1 sm:text-xs"
                >
                  <span className="text-primary">&gt;</span>
                  {lang === 'zh' ? r.name : r.nameEn}
                </button>
              ))}
            </div>

          </div>
        </motion.div>
      </section>

      {/* Rest of the page content with fade animation */}
      <motion.div animate={{ opacity: isTransitioning ? 0 : 1 }} transition={{ duration: 0.4 }}>
        {/* Categories */}
        <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <SectionHeader title={t.home.categoriesTitle} subtitle={t.home.categoriesSub} />
        <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {categories.map((c) => (
            <Card
              key={c.name}
              onClick={() => navigate(`/explore?category=${c.route}`)}
              className="cursor-pointer gap-3 border-border bg-card p-4 transition-colors hover:border-primary/60 sm:p-5"
            >
              <c.icon className="size-5 text-primary sm:size-6" />
              <div>
                <div className="text-sm font-medium sm:text-base">{c.name}</div>
                <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{c.desc}</div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Hot satellites */}
      <section className="border-y border-border bg-panel">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <SectionHeader title={t.home.hotSatellites} subtitle={t.home.hotSatellitesSub} />
          <div className="mt-6 flex flex-wrap gap-1.5 sm:mt-8 sm:gap-2">
            {SATELLITES.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2"
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${s.origin === 'cn' ? 'bg-primary' : 'bg-success'}`}
                />
                <span className="text-xs sm:text-sm">{s.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground sm:text-[11px]">{s.bestResolution}m</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solutions */}
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <SectionHeader title={t.home.solutionsTitle} subtitle={t.home.solutionsSub} />
        <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {SOLUTIONS.map((s) => {
            const Icon = SOLUTION_ICONS[s.icon] ?? Layers;
            const feats = lang === 'zh' ? s.features : s.featuresEn;
            return (
              <Card key={s.id} className="gap-3 border-border bg-card p-4 sm:p-5">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground sm:size-9">
                    <Icon className="size-4 sm:size-5" />
                  </span>
                  <div className="text-sm font-medium sm:text-base">{lang === 'zh' ? s.name : s.nameEn}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {feats.map((f) => (
                    <span key={f} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:px-2 sm:text-xs">
                      {f}
                    </span>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Advantages */}
      <section className="border-y border-border bg-panel">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <SectionHeader title={t.home.advantagesTitle} />
          <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {advantages.map((a) => (
              <div key={a.title} className="flex gap-2.5 rounded-lg border border-border bg-card p-4 sm:gap-3 sm:p-5">
                <a.icon className="size-4 shrink-0 text-primary sm:size-5" />
                <div>
                  <div className="text-sm font-medium sm:text-base">{a.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <SectionHeader title={t.home.processTitle} subtitle={t.home.processSub} />
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:mt-8 sm:gap-3 md:flex-row md:items-center">
          {steps.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2 sm:gap-3">
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
                <span className="tech-label text-xs text-primary sm:text-sm">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-xs sm:text-sm">{s}</span>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground md:block" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-panel">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 px-4 py-16 text-center sm:gap-6 sm:px-6 sm:py-20">
          <SectionHeader title={t.home.demandTitle} subtitle={t.home.demandSub} center />
          <div className="flex flex-col flex-wrap justify-center gap-2 sm:flex-row sm:gap-3">
            <Button size="lg" onClick={() => navigate('/explore')} className="w-full sm:w-auto">
              {t.common.searchData}
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/inquiry')} className="w-full sm:w-auto">
              {t.common.submitTasking}
            </Button>
          </div>
        </div>
      </section>
      </motion.div>
    </div>
  );
}
