import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeroGlobe } from './HeroGlobe';

interface GlobeTransitionProps {
  isTransitioning: boolean;
  onComplete: () => void;
}

export function GlobeTransition({ isTransitioning, onComplete }: GlobeTransitionProps) {
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<'zoom' | 'fade'>('zoom');

  useEffect(() => {
    if (isTransitioning) {
      setShow(true);
      setPhase('zoom');

      // Transition to fade phase at 600ms (before zoom completes)
      const fadeTimer = setTimeout(() => {
        setPhase('fade');
      }, 600);

      // Complete transition at 900ms
      const completeTimer = setTimeout(() => {
        onComplete();
        setShow(false);
        setPhase('zoom');
      }, 900);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(completeTimer);
      };
    }
  }, [isTransitioning, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Globe that zooms and fades into map */}
          <motion.div
            className="absolute inset-0"
            initial={{
              scale: 0.5,
              x: '20%',
              y: '0%',
            }}
            animate={{
              scale: phase === 'zoom' ? 3.5 : 4,
              x: '0%',
              y: '0%',
              opacity: phase === 'zoom' ? 1 : 0,
            }}
            transition={{
              scale: {
                duration: phase === 'zoom' ? 0.7 : 0.3,
                ease: [0.76, 0, 0.24, 1],
              },
              x: {
                duration: 0.7,
                ease: [0.76, 0, 0.24, 1],
              },
              y: {
                duration: 0.7,
                ease: [0.76, 0, 0.24, 1],
              },
              opacity: {
                duration: 0.3,
                ease: 'easeOut',
              },
            }}
          >
            <HeroGlobe className="absolute inset-0" />
          </motion.div>

          {/* White flash effect for smooth transition to map */}
          <motion.div
            className="pointer-events-none absolute inset-0 bg-background"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'fade' ? 1 : 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          />

          {/* Speed lines effect */}
          {phase === 'zoom' && (
            <motion.div
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.4, 0] }}
              transition={{ duration: 0.6 }}
            >
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute left-1/2 top-1/2 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
                  style={{
                    width: '200%',
                    transformOrigin: 'left center',
                    rotate: `${i * 30}deg`,
                  }}
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: [0, 1, 0] }}
                  transition={{
                    duration: 0.5,
                    delay: i * 0.03,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
