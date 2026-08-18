import { X, Award } from 'lucide-react';
import type { Product } from '../data/products';
import { useI18n } from '../i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { DATA_TYPE_LABEL, pick } from '../lib/labels';

interface CompareDrawerProps {
  products: Product[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRemove: (id: string) => void;
  onInquire: (p: Product) => void;
}

export function CompareDrawer({
  products,
  open,
  onOpenChange,
  onRemove,
  onInquire,
}: CompareDrawerProps) {
  const { t, lang } = useI18n();

  // recommendation flags
  const priced = products.filter((p) => p.priceType !== 'inquiry');
  const cheapest = priced.length
    ? priced.reduce((a, b) => (a.unitPrice <= b.unitPrice ? a : b)).id
    : null;
  const sharpest = products.length
    ? products.reduce((a, b) => (a.resolution <= b.resolution ? a : b)).id
    : null;
  const newest = products.length
    ? products.reduce((a, b) => (a.captureTime >= b.captureTime ? a : b)).id
    : null;

  const rows: { label: string; render: (p: Product) => React.ReactNode }[] = [
    { label: t.common.satellite, render: (p) => p.satelliteName },
    { label: t.common.date, render: (p) => <span className="font-mono">{p.captureTime}</span> },
    { label: t.common.resolution, render: (p) => <span className="font-mono">{p.resolution}m</span> },
    { label: t.common.cloud, render: (p) => <span className="font-mono">{p.cloudCover}%</span> },
    { label: t.common.dataType, render: (p) => pick(DATA_TYPE_LABEL[p.dataType], lang) },
    { label: t.detail.band, render: (p) => <span className="font-mono">{p.bands}</span> },
    { label: t.detail.deliveryTime, render: (p) => p.deliveryTime },
    { label: t.detail.license, render: (p) => p.license },
    {
      label: t.common.price,
      render: (p) =>
        p.priceType === 'inquiry' ? (
          <span className="text-warning">{t.common.needInquiry}</span>
        ) : p.priceType === 'free' ? (
          t.common.free
        ) : (
          <span className="font-mono">
            {p.unitPrice} {lang === 'zh' ? '元/km²' : 'CNY/km²'}
          </span>
        ),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t.explore.compare}</DialogTitle>
        </DialogHeader>
        {products.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t.explore.compareEmpty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-28" />
                  {products.map((p) => (
                    <th key={p.id} className="p-2 align-top">
                      <div className="relative overflow-hidden rounded-md border border-border">
                        <ImageWithFallback
                          src={p.thumbnail}
                          alt={p.satelliteName}
                          className="h-20 w-full object-cover"
                        />
                        <button
                          onClick={() => onRemove(p.id)}
                          className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white hover:bg-black/80"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap justify-center gap-1">
                        {cheapest === p.id && (
                          <Badge className="gap-1 text-[10px]"><Award className="size-3" />{lang === 'zh' ? '性价比' : 'Best value'}</Badge>
                        )}
                        {sharpest === p.id && (
                          <Badge variant="secondary" className="text-[10px]">{lang === 'zh' ? '分辨率最高' : 'Sharpest'}</Badge>
                        )}
                        {newest === p.id && (
                          <Badge variant="outline" className="text-[10px]">{lang === 'zh' ? '最新' : 'Newest'}</Badge>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-border">
                    <td className="tech-label py-2 pr-2 text-[10px] text-muted-foreground">{r.label}</td>
                    {products.map((p) => (
                      <td key={p.id} className="p-2 text-center">
                        {r.render(p)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td />
                  {products.map((p) => (
                    <td key={p.id} className="p-2 text-center">
                      <Button size="sm" className="w-full" onClick={() => onInquire(p)}>
                        {t.common.inquireNow}
                      </Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
