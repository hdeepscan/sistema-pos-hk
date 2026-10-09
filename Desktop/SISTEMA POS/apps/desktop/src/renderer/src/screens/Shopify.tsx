import ShopifySetupWizard from '../components/ShopifySetupWizard';
import ConciliacionShopify from '../components/ConciliacionShopify';

/**
 * Pantalla de integración Shopify
 * Renderiza el wizard de 3 pasos para conectar y sincronizar inventario
 */
export default function Shopify() {
  return (
    <>
      <ShopifySetupWizard />
      <ConciliacionShopify />
    </>
  );
}
