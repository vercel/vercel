export interface CronJobDefinition {
  host: string;
  path: string;
  schedule: string;
  description?: string;
  source?: 'api';
}

export interface CronDefinitionsResponse {
  definitions: CronJobDefinition[];
}
