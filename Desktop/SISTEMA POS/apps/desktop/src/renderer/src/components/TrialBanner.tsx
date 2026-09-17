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
    return null;
  }

  const diferencia = vencimiento.getTime() - ahora.getTime();
  const horasRestantes = Math.ceil(diferencia / (1000 * 60 * 60));

  if (horasRestantes <= 0) {
    return null;
  }

  const abrirPaginaSuscripcion = () => {
    if (onUpgradeClick) {
      onUpgradeClick();
    }
  };

  return (
    <div className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5 flex flex-wrap items-center justify-center gap-4 shadow-md relative z-50">
      <span className="text-sm font-medium">
        ⏳ Estás disfrutando de tu prueba gratis. Te quedan <strong className="font-bold">{horasRestantes} horas</strong>.
      </span>
      <button
        onClick={abrirPaginaSuscripcion}
        className="bg-white text-orange-600 hover:bg-orange-50 px-5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-sm"
      >
        Elegir Plan
      </button>
    </div>
  );
}
