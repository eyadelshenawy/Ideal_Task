import { Check } from "lucide-react";

export interface ToastState { id: number; text: string; done?: boolean; onUndo?: () => void }

/** Bottom-centre note after a status change or delete, with Undo for a few seconds. */
export default function UndoToast({ toast, onUndo }: { toast: ToastState; onUndo: () => void }) {
  return (
    <div key={toast.id} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] toast-in">
      <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] text-white shadow-lg" style={{ background: "#1E2B26" }}>
        {toast.done && (
          <span className="w-6 h-6 rounded-full flex items-center justify-center done-pop" style={{ background: "#82B478" }}>
            <Check size={15} strokeWidth={3} />
          </span>
        )}
        <span>{toast.text}</span>
        {toast.onUndo && (
          <button onClick={onUndo} className="font-bold" style={{ color: "#82B478" }}>Undo</button>
        )}
      </div>
    </div>
  );
}
