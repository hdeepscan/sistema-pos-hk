/**
 * Cliente GraphQL para Shopify Admin API 2026-07
 * Maneja consultas con paginación y control de Query Cost
 */

interface GraphQLQueryParams {
  query: string;
  variables?: Record<string, any>;
}

interface GraphQLResponse {
  data?: any;
  errors?: Array<{ message: string; extensions?: any }>;
  userErrors?: Array<{ message: string; field?: string }>;
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        currentlyAvailable: number;
        restoreRate: number;
        maxAvailable: number;
      };
    };
  };
}

export class ShopifyGraphQLClient {
  private shopDomain: string;
  private accessToken: string;
  private endpoint: string;
  private queryDelay = 0; // Para respetar rate limits

  constructor(shopDomain: string, accessToken: string) {
    this.shopDomain = shopDomain;
    this.accessToken = accessToken;
    this.endpoint = `https://${shopDomain}/admin/api/2026-07/graphql.json`;
  }

  async query<T = any>(params: GraphQLQueryParams): Promise<T> {
    // Respetar rate limit
    if (this.queryDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.queryDelay));
    }

    try {
      console.log(`[Shopify GraphQL] Iniciando query a: ${this.endpoint}`);
      console.log(`[Shopify GraphQL] Token: ${this.accessToken.substring(0, 20)}...`);

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.accessToken,
        },
        body: JSON.stringify(params),
      });

      console.log(`[Shopify GraphQL] Response Status: ${response.status} ${response.statusText}`);

      const result: GraphQLResponse = await response.json();

      // LOG COMPLETO DE LA RESPUESTA
      console.log(`[Shopify GraphQL] Raw Response (completo):`, JSON.stringify(result, null, 2).substring(0, 2000));

      // Manejar errores GraphQL
      if (Array.isArray(result.errors) && result.errors.length > 0) {
        console.error(`[Shopify GraphQL] Errors encontrados:`, JSON.stringify(result.errors, null, 2));
        const errorMsg = result.errors.map((e) => e.message).join(", ");
        throw new Error(`GraphQL Error: ${errorMsg}`);
      }

      if (Array.isArray(result.userErrors) && result.userErrors.length > 0) {
        console.error(`[Shopify GraphQL] User Errors encontrados:`, JSON.stringify(result.userErrors, null, 2));
        const errorMsg = result.userErrors.map((e) => e.message).join(", ");
        throw new Error(`GraphQL User Error: ${errorMsg}`);
      }

      // Controlar Query Cost para respetar límites de Shopify
      if (result.extensions?.cost?.throttleStatus) {
        const throttle = result.extensions.cost.throttleStatus;
        const { currentlyAvailable, restoreRate } = throttle;

        // Si nos acercamos al límite, esperar
        if (currentlyAvailable < 100) {
          const waitTime = Math.ceil(100 / restoreRate) * 1000;
          this.queryDelay = waitTime;
          console.log(`[Shopify] Approaching rate limit. Waiting ${waitTime}ms before next query.`);
        } else {
          this.queryDelay = 0;
        }

        console.log(`[Shopify] Query Cost: ${result.extensions.cost.actualQueryCost}/${result.extensions.cost.requestedQueryCost}, Available: ${currentlyAvailable}`);
      }

      const dataStr = result.data ? JSON.stringify(result.data).slice(0, 500) : 'null';
      console.log(`[Shopify GraphQL] Query returned data:`, dataStr);
      return result.data as T;
    } catch (error) {
      console.error("[Shopify GraphQL Error]", error);
      throw error;
    }
  }

  // Obtener todos los productos con paginación
  async getProductsInitial(cursor?: string): Promise<any> {
    const query = `
      query GetProducts($first: Int!, $after: String) {
        products(first: $first, after: $after, query: "status:active OR status:draft OR status:archived") {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              description
              handle
              status
              vendor
              productType
              tags
              images(first: 10) {
                edges {
                  node {
                    id
                    url
                    altText
                  }
                }
              }
              collections(first: 10) {
                edges {
                  node {
                    id
                    title
                  }
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    sku
                    barcode
                    price
                    compareAtPrice
                    title
                    selectedOptions {
                      name
                      value
                    }
                    image {
                      id
                      url
                    }
                    inventoryItem {
                      id
                      tracked
                      requiresShipping
                    }
                    inventoryQuantity
                  }
                }
              }
              createdAt
              updatedAt
            }
          }
        }
      }
    `;

    return this.query({
      query,
      variables: {
        first: 50,
        after: cursor || null,
      },
    });
  }

  // Obtener locations
  async getLocations(): Promise<any> {
    const query = `
      query GetLocations {
        locations(first: 100) {
          edges {
            node {
              id
              name
              address {
                address1
                address2
                city
                province
                country
                zip
              }
              isActive
              inventoryLevels(first: 1) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }
        }
      }
    `;

    return this.query({ query });
  }

  // Obtener inventory levels por variante
  async getInventoryLevels(inventoryItemId: string): Promise<any> {
    const query = `
      query GetInventoryLevels($id: ID!) {
        inventoryItem(id: $id) {
          id
          inventoryLevels(first: 50) {
            edges {
              node {
                id
                available
                onHand
                committed
                incoming
                location {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `;

    return this.query({
      query,
      variables: { id: inventoryItemId },
    });
  }

  // FASE 4: Mutations para sincronización bidireccional

  /**
   * Ajustar inventario en Shopify (cambio de stock)
   */
  async adjustInventory(inventoryItemId: string, locationId: string, deltaQuantity: number): Promise<any> {
    const mutation = `
      mutation AdjustInventory($input: InventoryAdjustQuantityInput!) {
        inventoryAdjustQuantity(input: $input) {
          inventoryLevel {
            id
            available
            onHand
            location {
              id
              name
            }
          }
          inventoryAdjustmentGroup {
            reason
            createdAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    return this.query({
      query: mutation,
      variables: {
        input: {
          inventoryItemId,
          availableDelta: deltaQuantity,
        },
      },
    });
  }

  /**
   * Actualizar precio de variante
   */
  async updateVariantPrice(variantId: string, price: string): Promise<any> {
    const mutation = `
      mutation UpdateVariantPrice($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
            id
            price
            compareAtPrice
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    return this.query({
      query: mutation,
      variables: {
        input: {
          id: variantId,
          price,
        },
      },
    });
  }

  /**
   * Actualizar producto (nombre, descripción, estado)
   */
  async updateProduct(productId: string, updates: Record<string, any>): Promise<any> {
    const mutation = `
      mutation UpdateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            bodyHtml
            status
            vendor
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const input: Record<string, any> = { id: productId };
    if (updates.nombre) input.title = updates.nombre;
    if (updates.descripcion) input.bodyHtml = updates.descripcion;
    if (updates.activo !== undefined) input.status = updates.activo ? "ACTIVE" : "ARCHIVED";
    if (updates.marca) input.vendor = updates.marca;

    return this.query({
      query: mutation,
      variables: { input },
    });
  }

  /**
   * Crear orden/transacción (cuando se vende en POS, registrar en Shopify)
   */
  async registrarVentaEnShopify(orderId: string, lineItems: any[]): Promise<any> {
    // Esta es una operación compleja que requeriría crear una "order" en Shopify
    // Por ahora, solo es un placeholder
    console.log(`[Shopify] Registrar venta en Shopify: ${orderId}`);
    return { success: true };
  }
}
