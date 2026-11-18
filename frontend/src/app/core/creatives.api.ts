import { Injectable } from "@angular/core";
import { httpResource } from "@angular/common/http";
import { environment } from "../../environments/environment";
import {
  CreativeDetailResponse,
  CreativeListResponse,
  type CreativeRange,
} from "@contracts/creatives.contract";

export interface CreativeListParams {
  range: CreativeRange;
  connectionId: string | null;
}

export interface CreativeDetailParams {
  id: string;
  range: CreativeRange;
}

/**
 * Read-only access to /api/creatives. Every response is validated against the
 * shared zod contract, so a backend/frontend mismatch surfaces as an error
 * state instead of `undefined` deep in a template.
 *
 * Call these from an injection context (a component field initializer).
 */
@Injectable({ providedIn: "root" })
export class CreativesApi {
  private readonly base = `${environment.apiUrl}/creatives`;

  list(params: () => CreativeListParams) {
    return httpResource(
      () => {
        const p = params();
        return {
          url: this.base,
          params: { range: p.range, ...(p.connectionId ? { connectionId: p.connectionId } : {}) },
        };
      },
      { parse: (raw: unknown) => CreativeListResponse.parse(raw) },
    );
  }

  detail(params: () => CreativeDetailParams | undefined) {
    return httpResource(
      () => {
        const p = params();
        return p ? { url: `${this.base}/${encodeURIComponent(p.id)}`, params: { range: p.range } } : undefined;
      },
      { parse: (raw: unknown) => CreativeDetailResponse.parse(raw) },
    );
  }
}
