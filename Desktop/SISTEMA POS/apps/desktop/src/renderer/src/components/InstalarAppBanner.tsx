import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { esIOS, estaInstalada, useInstalarPWA } from "../lib/pwa";
import isotipo from "../assets/centrala-isotipo.png";

const CLAVE_OCULTO = "pwa-banner-oculto-hasta";
const DIAS_OCULTO = 14;

function ocultoPorAhora(): boolean {
  try {
    const hasta = Number(localStorage.getItem(CLAVE_OCULTO) || 0);
    return Date.now() < hasta;
  } catch {
    return false;
  }
}

/**
 * Aviso para instalar CENTRALA como app en el celular.
 * - Android/Chrome: botón "Instalar" que abre el diálogo nativo.
 * - iPhone/iPad (Safari): instrucciones "Compartir → Agregar a inicio".
 * No aparece si ya está instalada, en Electron, o si el usuario lo cerró hace menos de 14 días.
 */
export function InstalarAppBanner() {
  const { puedeInstalar, instalar } = useInstalarPWA();
  const [cerrado, setCerrado] = useState(ocultoPorAhora);
  const [verPasosIOS, setVerPasosIOS] = useState(false);

  if (typeof window === "undefined" || (window as any).pos) return null;
  if (cerrado || estaInstalada()) return null;

  const ios = esIOS();
  if (!puedeInstalar && !ios) return null;

  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE_OCULTO, String(Date.now() + DIAS_OCULTO * 24 * 60 * 60 * 1000));
    } catch {
      /* sin almacenamiento: solo se oculta en esta sesión */
    }
    setCerrado(true);
  };

  return (
    <div className="pwa-banner" role="dialog" aria-label="Instalar CENTRALA">
      <img src={isotipo} alt="" className="pwa-banner-icono" />
      <div className="pwa-banner-texto">
        <strong>Instala CENTRALA en tu celular</strong>
        {ios && verPasosIOS ? (
          <span>
            Toca <Share size={14} style={{ verticalAlign: "-2px" }} /> <b>Compartir</b> abajo en Safari y luego{" "}
            <b>“Agregar a inicio”</b>.
          </span>
        ) : (
          <span>Ábrela como app, en pantalla completa y con un toque.</span>
        )}
      </div>
      {puedeInstalar ? (
        <button
          type="button"
          className="pwa-banner-accion"
          onClick={async () => {
            if (await instalar()) setCerrado(true);
          }}
        >
          <Download size={16} /> Instalar
        </button>
      ) : (
        !verPasosIOS && (
          <button type="button" className="pwa-banner-accion" onClick={() => setVerPasosIOS(true)}>
            Cómo
          </button>
        )
      )}
      <button type="button" className="pwa-banner-cerrar" onClick={cerrar} aria-label="Cerrar">
        <X size={18} />
      </button>
    </div>
  );
}
