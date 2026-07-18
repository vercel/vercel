# Projects & Teams

> Exact syntax: `vercel project --help`, `vercel teams --help`, `vercel whoami --help`

When the user has not specified a team or project, discover scope first (`vercel teams ls`, then `vercel project ls --scope <team-slug>`). Do not conclude that no projects or deployments exist after checking only one relevant scope. If several plausible targets remain, ask the user to choose from the candidates found. Avoid broad enumeration across unrelated teams unless the user asked for account-wide investigation.
