declare function nsfw(
  dir: string,
  callback: nsfw.EventsCallback,
  options?: nsfw.WatcherOptions,
  errorCallback?: (errors: Error[]) => void,
  modulePath?: string,
): Promise<nsfw.Watcher>;

declare namespace nsfw {
  export class Watcher {
    start(): Promise<void>;
    stop(): Promise<void>;
  }
  export interface BaseEvent {
    action: nsfw.actions;
    directory: string;
  };
  export interface CreatedEvent extends BaseEvent {
    action: nsfw.actions.CREATED;
    file: string;
  }
  export interface DeletedEvent extends BaseEvent {
    action: nsfw.actions.DELETED;
    file: string;
  }
  export interface ModifiedEvent extends BaseEvent {
    action: nsfw.actions.MODIFIED;
    file: string;
  }
  export interface RenamedEvent extends BaseEvent {
    action: nsfw.actions.RENAMED;
    oldFile: string;
    newDirectory: string;
    newFile: string;
  }
  export type Event = CreatedEvent | DeletedEvent | ModifiedEvent | RenamedEvent;
  export type EventsCallback = (events: Event[]) => void;
  export interface WatcherOptions {
    debouceMS?: number;
    errorCallback?(errors: Error[]);
  };
  export enum actions {
    CREATED,
    DELETED,
    MODIFIED,
    RENAMED
  };
}

declare module '@zeit/nsfw' {
  export = nsfw;
}
