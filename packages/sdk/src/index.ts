/**
 * @repo/sdk - Generated OpenAPI Client
 *
 * This package will contain the auto-generated TypeScript SDK
 * for the SuperBasic Finance API once OpenAPI generation is configured.
 *
 * For now, this is a placeholder that will be replaced by the
 * generated client from the /v1 API specification.
 */

export interface SDKConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export class SuperBasicSDK {
  constructor(private config: SDKConfig) {}

  // Placeholder methods - will be replaced by generated SDK
  async health(): Promise<{ status: string }> {
    throw new Error(
      `SDK not yet generated. Run \`pnpm api:docs && pnpm sdk:generate\`. Config: ${this.config.baseUrl}`
    );
  }
}

export default SuperBasicSDK;
