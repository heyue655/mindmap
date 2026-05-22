import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  right?: ReactNode;
}

export default function PageHeader({
  title,
  description,
  right,
}: PageHeaderProps) {
  return (
    <div className="bg-white border-b border-border px-6 py-4 flex items-center justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-brand-ink">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {right}
    </div>
  );
}
