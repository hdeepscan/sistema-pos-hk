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
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.accessToken,
        },
        body: JSON.stringify(params),
      });

      const result: GraphQLResponse = await response.json();

      // Manejar errores GraphQL
      if (result.errors && result.errors.length > 0) {
        const errorMsg = result.errors.map((e) => e.message).join(", ");
        throw new Error(`GraphQL Error: ${errorMsg}`);
      }

      if (result.userErrors && result.userErrors.length > 0) {
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
                    weight
                    weightUnit
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
}
