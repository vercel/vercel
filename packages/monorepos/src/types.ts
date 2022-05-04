import { DetectionItem } from '@vercel/build-utils';

export interface Monorepo {
  /**
   * Name of the workspace
   * @example "turbo"
   */
   name: string;
   /**
    * A unique identifier for the workspace
    * @example "turbo"
    */
   slug: string | null;
   /**
    * A URL to a deployed example of the workspace
    * @example "https://nextjs-template.vercel.app"
    */
   demo?: string;
   /**
   * A URL to the official website of the workspace
   * @example "https://nextjs.org"
   */
  website?: string;
   /**
   * Detectors used to find out the framework
   */
  detectors?: {
    /**
     * Collection of detectors that must be matched for the framework
     * to be detected.
     */
    every?: DetectionItem[];
    /**
     * Collection of detectors where one match triggers the framework
     * to be detected.
     */
    some?: DetectionItem[];
  };
}
