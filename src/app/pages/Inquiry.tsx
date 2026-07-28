import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, FileText } from 'lucide-react';
import { useI18n } from '../i18n';
import { useInquiryDraft } from '../context/InquiryContext';
import { addInquiry, type InquiryType } from '../lib/inquiries';
import { fmtCny, fmtCnyEn } from '../lib/pricing';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';

export function Inquiry() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { draft, setDraft } = useInquiryDraft();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    region: draft.region ?? '',
    usage: '',
    expectDate: '',
    expectRes: draft.expectRes ?? '',
    note: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const money = (v: number) => (lang === 'zh' ? fmtCny(v) : fmtCnyEn(v));

  const submit = () => {
    if (!form.name || !form.phone || !form.company) {
      toast.error(lang === 'zh' ? '请填写姓名、手机号和公司名称' : 'Please fill name, phone and company');
      return;
    }
    const inquiry = addInquiry({
      type: draft.type,
      ...form,
      productName: draft.productName,
      refPrice: draft.refPrice ?? 0,
      areaKm2: draft.areaKm2 ?? 0,
    });
    navigate(`/inquiry/success?code=${inquiry.code}`);
  };

  const typeLabel: Record<InquiryType, string> = {
    history: t.inquiry.typeHistory,
    tasking: t.inquiry.typeTasking,
    analysis: t.inquiry.typeAnalysis,
  };

  const fields: { key: keyof typeof form; label: string; required?: boolean; type?: string }[] = [
    { key: 'name', label: t.inquiry.name, required: true },
    { key: 'phone', label: t.inquiry.phone, required: true },
    { key: 'email', label: t.inquiry.email, type: 'email' },
    { key: 'company', label: t.inquiry.company, required: true },
    { key: 'region', label: t.inquiry.region },
    { key: 'usage', label: t.inquiry.usage },
    { key: 'expectDate', label: t.inquiry.expectDate, type: 'date' },
    { key: 'expectRes', label: t.inquiry.expectRes },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <Button variant="ghost" size="sm" className="mb-3 gap-1 text-muted-foreground sm:mb-4" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          {t.common.back}
        </Button>

        <h1 className="text-xl sm:text-2xl">{t.inquiry.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.inquiry.subtitle}</p>

        {/* Summary */}
        {(draft.productName || draft.areaKm2 || draft.refPrice) && (
          <div className="mt-4 rounded-lg border border-border bg-panel p-3 sm:mt-6 sm:p-4">
            <div className="tech-label mb-2 flex items-center gap-2 text-[10px] text-muted-foreground sm:mb-3 sm:text-xs">
              <FileText className="size-3 sm:size-3.5" />
              {t.inquiry.summary}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {draft.productName && (
                <Sum label={t.inquiry.product} value={draft.productName} span />
              )}
              {draft.areaKm2 ? <Sum label={t.common.area} value={`${draft.areaKm2} km²`} /> : null}
              {draft.expectRes && <Sum label={t.inquiry.expectRes} value={draft.expectRes} />}
              {draft.refPrice ? (
                <Sum
                  label={t.common.price}
                  value={`${money(draft.refPrice)} ${lang === 'zh' ? '元' : 'CNY'}`}
                  accent
                />
              ) : null}
            </div>
          </div>
        )}

        {/* Type selector */}
        <div className="mt-4 sm:mt-6">
          <Label className="text-xs text-muted-foreground">{lang === 'zh' ? '询价类型' : 'Inquiry type'}</Label>
          <Tabs
            value={draft.type}
            onValueChange={(v) => setDraft({ ...draft, type: v as InquiryType })}
            className="mt-2"
          >
            <TabsList className="w-full sm:w-auto">
              {(['history', 'tasking', 'analysis'] as InquiryType[]).map((tp) => (
                <TabsTrigger key={tp} value={tp} className="flex-1 text-xs sm:flex-none">
                  {typeLabel[tp]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Form */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs sm:text-sm">
                {f.label}
                {f.required && <span className="ml-1 text-destructive">*</span>}
              </Label>
              <Input type={f.type ?? 'text'} value={form[f.key]} onChange={set(f.key)} className="text-sm" />
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs sm:text-sm">{t.inquiry.note}</Label>
            <Textarea rows={4} value={form.note} onChange={set('note')} className="text-sm" />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button size="lg" onClick={submit} className="w-full sm:w-auto">
            {t.inquiry.submitInquiry}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Sum({ label, value, accent, span }: { label: string; value: string; accent?: boolean; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <div className="tech-label text-[9px] text-muted-foreground sm:text-[10px]">{label}</div>
      <div className={`mt-0.5 text-xs ${accent ? 'font-mono text-primary' : ''} sm:text-sm`}>{value}</div>
    </div>
  );
}
