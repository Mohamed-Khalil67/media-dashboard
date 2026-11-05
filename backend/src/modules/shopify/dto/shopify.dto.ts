export interface ShopifyOAuthKickoffDto {
  shop: string;
}

export interface ShopifyOAuthCallbackDto {
  code: string;
  shop: string;
  state: string;
}
