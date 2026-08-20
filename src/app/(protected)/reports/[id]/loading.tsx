import { RefreshCw } from 'lucide-react';

export default function ReportDetailLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <RefreshCw
        className="h-8 w-8 animate-spin text-brand-accent"
        role="status"
        aria-label="Cargando reporte..."
      />
    </div>
  );
}
