import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useI18n } from '../i18n';
import { Button } from '../components/ui/button';

export function InquirySuccess() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const code = params.get('code') ?? 'INQ-XXXX';

  useEffect(() => {
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 }, colors: ['#4d9eff', '#34d399', '#ffffff'] });
  }, []);

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="relative w-full max-w-md text-center">
        <div className="pointer-events-none absolute inset-0 grid-backdrop opacity-60" />
        <div className="relative rounded-xl border border-border bg-card p-8">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-8" />
          </div>
          <h1 className="mt-5 text-xl">{t.inquiry.successTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.inquiry.successDesc}</p>

          <div className="mt-6 rounded-lg border border-border bg-panel p-4">
            <div className="tech-label text-[10px] text-muted-foreground">{t.inquiry.orderNo}</div>
            <div className="mt-1 font-mono text-2xl text-primary">{code}</div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => navigate('/')}>
              {t.inquiry.backHome}
            </Button>
            <Button className="flex-1" onClick={() => navigate('/admin')}>
              {t.inquiry.viewAdmin}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
