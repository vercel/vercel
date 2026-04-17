export interface ConnexClient {
  id: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  uid: string;
  type: string;
  name: string;
  clientUrl?: string | null;
  data: object;
  typeName: string;
  typeIcon?: string;
  website?: string;
  devsite?: string;
  docsite?: string;
  icon?: string;
  supportedSubjectTypes: Array<'user' | 'app'>;
  supportsInstallation: boolean;
}
