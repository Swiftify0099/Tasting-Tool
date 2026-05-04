import { useFlow } from '../context/FlowContext';
import { CheckCircle, XCircle, Info } from 'lucide-react';

export default function Toast() {
  const { state } = useFlow();
  const { toast } = state;
  if (!toast) return null;

  const icons = { success: CheckCircle, error: XCircle, info: Info };
  const colors = {
    success: 'border-success/40 bg-success/10 text-success',
    error:   'border-danger/40  bg-danger/10  text-danger',
    info:    'border-brand-500/40 bg-brand-500/10 text-brand-300',
  };

  const Icon = icons[toast.type];

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-card backdrop-blur-sm max-w-xs ${colors[toast.type]}`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm font-medium">{toast.message}</span>
      </div>
    </div>
  );
}
