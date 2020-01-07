export interface Repo {
  repo: string;
  owner: {
    username: string;
  };
  username: string;
  branch: string;
  path: string;
}
