/**
 * The model shapes setup reads. Hosts fetch them (the gateway's model list and
 * the leaderboard) and pass them in on the setup context: the package itself
 * makes no network requests.
 */
export type ModelPricing = {
  input?: string;
  output?: string;
};

export type Model = {
  id: string;
  object: 'model';
  created?: number;
  released?: number;
  deprecated_at?: number;
  owned_by: string;
  name: string;
  description?: string;
  context_window?: number;
  max_tokens?: number;
  type?: string;
  tags?: string[];
  pricing?: ModelPricing;
};

export interface TopModel {
  id: string;
  name: string;
}
