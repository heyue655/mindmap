import PageHeader from "@/components/PageHeader";

interface PlaceholderProps {
  title: string;
  description?: string;
  comingNext: string;
}

export default function Placeholder({
  title,
  description,
  comingNext,
}: PlaceholderProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto bg-white rounded-lg border border-border p-10 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-2xl">
            ⏳
          </div>
          <h3 className="font-semibold text-brand-ink mb-2">这一页还没做</h3>
          <p className="text-sm text-muted-foreground">{comingNext}</p>
        </div>
      </div>
    </>
  );
}
