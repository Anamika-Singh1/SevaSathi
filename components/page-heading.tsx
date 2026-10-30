export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-[10px] font-semibold tracking-[0.18em] text-primary uppercase">
          {eyebrow}
        </p>
        <h1 className="text-2xl leading-relaxed font-bold sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}
