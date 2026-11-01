export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm leading-7 font-medium text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-2xl leading-relaxed font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-7 text-muted-foreground">
          {description}
        </p>}
      </div>
      {children}
    </div>
  );
}
