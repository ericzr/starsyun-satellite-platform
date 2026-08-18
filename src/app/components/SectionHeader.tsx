interface SectionHeaderProps {
  index?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}

export function SectionHeader({ index, title, subtitle, center }: SectionHeaderProps) {
  return (
    <div className={center ? 'text-center' : ''}>
      {index && (
        <div
          className={`tech-label text-xs text-primary ${center ? 'flex justify-center' : ''}`}
        >
          {index}
        </div>
      )}
      <h2 className="mt-2 text-[1.6rem] tracking-tight">{title}</h2>
      {subtitle && (
        <p className={`mt-2 text-muted-foreground ${center ? 'mx-auto max-w-2xl' : 'max-w-2xl'}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
