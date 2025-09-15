export interface DangerouslyDeleteOptions {
  /**
   * The time in seconds for how long the stale content can be served while revalidating the new content in the background.
   * If none is provided, the default is 0 and the content will be deleted immediately.
   */
  revalidationDeadlineSeconds?: number;
}

/**
 * Vercel Cache Purge APIs.
 */
export interface PurgeApi {
  /**
   * Invalidate all content associated with a tag or tags by marking them as stale.
   * On the next access to content associated with any of the tags, the stale content will be served and a background revalidation will be triggered.
   *
   * @param tag The tag or tags to invalidate.
   * @returns A promise that resolves when the invalidate is complete.
   */
  invalidateByTag: (tag: string | string[]) => Promise<void>;

  /**
   * Delete all content associated with a tag or tags after a specified revalidation deadline.
   * If accessed prior to the revalidation deadline, the stale content will be served and a background revalidation will be triggered. After the revalidation deadline is reached, the content will be deleted.
   * The default revalidation deadline is 0 and the content will be deleted immediately.
   *
   * @param tag The tag or tags to delete.
   * @param options The options for the delete that specify the revalidation deadline.
   * @returns A promise that resolves when the delete is complete.
   */
  dangerouslyDeleteByTag: (
    tag: string | string[],
    options?: DangerouslyDeleteOptions
  ) => Promise<void>;
}
