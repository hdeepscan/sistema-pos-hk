import { useSesionStore } from "../lib/store";

interface TrialBannerProps {
  onUpgradeClick?: () => void;
}

export function TrialBanner({ onUpgradeClick }: TrialBannerProps = {}) {
  const { empresa } = useSesionStore();

  if (!empresa?.fechaVencimiento || empresa.planSuscripcion !== "TRIAL") {
    return null;
  }

  const ahora = new Date();
  const vencimiento = new Date(empresa.fechaVencimiento);

  if (vencimiento <= ahora) {
    return null; // Usar pantalla de bloqueo en su lugar
  }

  const diferencia = vencimiento.getTime() - ahora.getTime();
  const horas = Math.ceil(diferencia / (1000 * 60 * 60));

  if (horas <= 0) {
    return null;
  }

  const handleUpgradeClick = () => {
    if (onUpgradeClick) {
      onUpgradeClick();
    }
  };

  return (
    <div className="w-full bg-yellow-500 text-yellow-900 px-4 py-3 flex items-center justify-between gap-4 text-sm font-medium z-50 border-b-2 border-yellow-600 shadow-md">
      <div className="flex items-center gap-2">
        <span className="text-lg">⏳</span>
        <span>
          Estás disfrutando de tu prueba gratis. Te quedan <strong className="text-base">{horas} horas</strong>.
        </span>
      </div>
      <button
        onClick={handleUpgradeClick}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-bold text-sm whitespace-nowrap transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      >
        <span>💳</span>
        Elegir Plan
      </button>
    </div>
  );
}
