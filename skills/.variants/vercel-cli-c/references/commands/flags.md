<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel flags

Manage feature flags for a Vercel project

```
vercel flags [command]
```

## Subcommands

### `vercel flags archive`

Archive a feature flag

```
vercel flags archive <flag> [options]
```

#### Options

- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-y, --yes` — Skip the confirmation prompt when archiving a flag

#### Examples

Archive a feature flag

```
$ vercel flags archive my-feature-flag
```

Archive without confirmation

```
$ vercel flags archive my-feature-flag --yes
```

### `vercel flags create`

Create a new feature flag

Aliases: `add`

```
vercel flags create <slug> [options]
```

#### Options

- `-d, --description <TEXT>` — Description of the feature flag
- `-k, --kind <KIND>` — The type of the flag value (boolean, string, number, or json)
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-v, --variant <VALUE[=LABEL]>` (repeatable) — Variant definition as VALUE[=LABEL] (can be repeated for string, number, and json flags)

#### Examples

Create a boolean feature flag

```
$ vercel flags create my-feature
```

Create a string feature flag with description

```
$ vercel flags create my-feature --kind string --description "My feature flag"
```

Create a string feature flag with explicit variants

```
$ vercel flags add my-feature --kind string --variant control="Welcome back" --variant treatment="New onboarding"
```

Create a JSON feature flag with explicit variants

```
$ vercel flags add layout-config --kind json --variant '{"theme":"light"}'=Light --variant '{"theme":"dark","sidebar":true}'=Dark
```

### `vercel flags disable`

Shortcut to serve the false variant of a boolean feature flag in an environment

```
vercel flags disable <flag> [options]
```

#### Options

- `-e, --environment <ENV>` — The environment to disable the flag in (production, preview, or development)
- `--message <TEXT>` — Optional revision message for the update
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-v, --variant <VARIANT>` — The variant ID or value to serve while the flag is disabled

#### Examples

Disable a flag in production

```
$ vercel flags disable my-feature --environment production
```

Disable a flag with a specific variant

```
$ vercel flags disable my-feature -e production --variant false
```

Disable a flag with a revision message

```
$ vercel flags disable my-feature -e production --message "Pause rollout in production"
```

### `vercel flags enable`

Shortcut to serve the true variant of a boolean feature flag in an environment

```
vercel flags enable <flag> [options]
```

#### Options

- `-e, --environment <ENV>` — The environment to enable the flag in (production, preview, or development)
- `--message <TEXT>` — Optional revision message for the update
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

#### Examples

Enable a flag in production

```
$ vercel flags enable my-feature --environment production
```

Enable a flag with a revision message

```
$ vercel flags enable my-feature --environment production --message "Resume production rollout"
```

### `vercel flags inspect`

Display information about a feature flag

```
vercel flags inspect <flag> [options]
```

#### Options

- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

#### Examples

Show details of a feature flag

```
$ vercel flags inspect my-feature-flag
```

### `vercel flags list`

List all feature flags for the current project (default subcommand)

Aliases: `ls`

```
vercel flags list [options]
```

#### Options

- `--created-by <ID>` — Filter flags by the id of the user or team that created them
- `--json` — Output in JSON format
- `--limit <NUMBER>` — Return a single page of at most NUMBER flags (1-100) instead of all
- `--maintainer-id <ID>` (repeatable) — Filter flags by maintainer user id (repeatable; any may match)
- `--next <CURSOR>` — Pagination cursor from a previous list response
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-s, --state <STATE>` — Filter flags by state (active or archived)
- `--tag <TAG>` (repeatable) — Filter flags by tag (repeatable; all must match)

#### Examples

List all active flags

```
$ vercel flags ls
```

List archived flags

```
$ vercel flags ls --state archived
```

Filter flags by tag, creator, and maintainer

```
$ vercel flags ls --tag checkout --created-by user_123 --maintainer-id user_456
```

List the first page of 10 flags

```
$ vercel flags ls --limit 10
```

List the next page using the cursor from the previous page

```
$ vercel flags ls --limit 10 --next <cursor>
```

List flags as JSON

```
$ vercel flags ls --json
```

### `vercel flags open`

Open feature flags in the Vercel dashboard

```
vercel flags open [flag] [options]
```

#### Options

- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

#### Examples

Open the project feature flags dashboard

```
$ vercel flags open
```

Open a specific feature flag

```
$ vercel flags open my-feature-flag
```

### `vercel flags override`

Encrypt flag overrides into a secure token for the vercel-flag-overrides cookie

```
vercel flags override [flag=value] [options]
```

#### Options

- `--decrypt <TOKEN>` — Decrypt an encrypted override token and print the JSON
- `--expiration <TIME>` — Expiration time for the encrypted token (default: 1y)

#### Examples

Encrypt a single flag override

```
$ vercel flags override my-flag=true
```

Encrypt multiple flag overrides

```
$ vercel flags override flag-a=true flag-b=hello
```

Set a custom expiration

```
$ vercel flags override my-flag=42 --expiration 30d
```

Decrypt an override token

```
$ vercel flags override --decrypt <token>
```

### `vercel flags prepare`

Prepare flag definition fallbacks for the build

```
vercel flags prepare
```

### `vercel flags remove`

Delete a feature flag

Aliases: `rm`

```
vercel flags remove <flag> [options]
```

#### Options

- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-y, --yes` — Skip the confirmation prompt when deleting a flag

#### Examples

Delete a feature flag

```
$ vercel flags rm my-feature-flag
```

Delete without confirmation

```
$ vercel flags rm my-feature-flag --yes
```

### `vercel flags rollout`

Configure a progressive rollout for a feature flag in an environment

```
vercel flags rollout <flag> [options]
```

#### Options

- `--by <ENTITY.ATTRIBUTE>` — Entity attribute used for bucketing, in the form entity.attribute
- `--default-variant <VARIANT>` — The fallback variant to serve when the rollout attribute is unavailable
- `-e, --environment <ENV>` — The environment to configure (production, preview, or development)
- `--from-variant <VARIANT>` — The variant to roll away from (defaults to false for boolean flags)
- `--message <TEXT>` — Optional revision message for the update
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-s, --stage <PERCENTAGE,DURATION>` (repeatable) — Add a rollout stage as PERCENTAGE,DURATION (e.g. "5,6h"). Can be specified multiple times. 100% is implied at the end.
- `--start <TIME>` — When the rollout should start: "now", a future relative time like "1h", or an ISO 8601 datetime
- `--to-variant <VARIANT>` — The variant to roll towards (defaults to true for boolean flags)

#### Examples

Start a progressive boolean rollout in production

```
$ vercel flags rollout redesigned-checkout --environment production --by user.userId --stage 5,6h --stage 10,6h --stage 25,12h --stage 50,1d
```

Schedule a string-flag rollout for later

```
$ vercel flags rollout welcome-message -e production --by user.userId --from-variant control --to-variant treatment --default-variant control --stage 10,2h --stage 50,12h --start 2026-04-16T09:00:00Z
```

Update only the rollout schedule while keeping current variants

```
$ vercel flags rollout redesigned-checkout -e production --stage 5,30m --stage 25,2h --stage 50,8h
```

### `vercel flags rules`

Manage conditional rules for feature flags

```
vercel flags rules <command>
```

##### `vercel flags rules add`

Add a conditional rule to a feature flag environment

```
vercel flags rules add <flag> [options]
```

###### Options

- `--by <ENTITY.ATTRIBUTE>` — Entity attribute used for split or rollout bucketing, in the form entity.attribute
- `-c, --condition <CONDITION>` (repeatable) — Rule condition as ENTITY.ATTRIBUTE:OPERATOR:VALUE or segment:OPERATOR:SEGMENT. Repeatable; semicolon-separated conditions are also supported. Valid operators: eq, !eq, oneOf, !oneOf, containsAllOf, containsAnyOf, containsNoneOf, startsWith, endsWith, contains, !contains, ex, !ex, gt, gte, lt, lte
- `--default-variant <VARIANT>` — Fallback variant for split or rollout outcomes when the bucketing attribute is unavailable
- `-e, --environment <ENV>` — The environment to add the rule to (production, preview, or development)
- `--from-variant <VARIANT>` — Variant to roll away from for rollout outcomes
- `--message <TEXT>` — Optional revision message for the update
- `-p, --position <N>` — 1-based position for the new rule (defaults to last)
- `-s, --stage <PERCENTAGE,DURATION>` (repeatable) — Add a rollout stage as PERCENTAGE,DURATION. Can be specified multiple times.
- `--start <TIME>` — When the rollout should start: "now", a relative time like "1h", or an ISO 8601 datetime
- `--to-variant <VARIANT>` — Variant to roll towards for rollout outcomes
- `-v, --variant <VARIANT>` — Variant ID or value to serve when the rule matches
- `-w, --weight <VARIANT=WEIGHT>` (repeatable) — Split weight ratio as VARIANT=WEIGHT. Repeat for each variant.

###### Examples

Add a variant rule

```
$ vercel flags rules add my-feature --environment production --condition user.plan:eq:pro --variant on
```

Add a segment rule

```
$ vercel flags rules add my-feature -e production --condition segment:eq:seg_beta123 --variant on
```

Add a split rule at the top

```
$ vercel flags rules add my-feature -e production --condition user.plan:eq:pro --by user.userId --weight off=90 --weight on=10 --position 1
```

##### `vercel flags rules list`

List conditional rules for a feature flag environment

Aliases: `ls`

```
vercel flags rules list <flag> [options]
```

###### Options

- `-e, --environment <ENV>` — The environment to list rules for (production, preview, or development)
- `--json` — Output in JSON format

###### Examples

List production rules for a flag

```
$ vercel flags rules ls my-feature --environment production
```

List rules as JSON

```
$ vercel flags rules ls my-feature -e production --json
```

##### `vercel flags rules move`

Move a conditional rule within a feature flag environment

```
vercel flags rules move <flag> <rule> [options]
```

###### Options

- `-e, --environment <ENV>` — The environment containing the rule (production, preview, or development)
- `--message <TEXT>` — Optional revision message for the update
- `-p, --position <N>` — 1-based destination position for the rule

###### Examples

Move a rule to the top

```
$ vercel flags rules move my-feature rule_123 --environment production --position 1
```

##### `vercel flags rules remove`

Remove a conditional rule from a feature flag environment

Aliases: `rm`

```
vercel flags rules remove <flag> <rule> [options]
```

###### Options

- `-e, --environment <ENV>` — The environment containing the rule (production, preview, or development)
- `--message <TEXT>` — Optional revision message for the update

###### Examples

Remove a rule

```
$ vercel flags rules rm my-feature rule_123 --environment production
```

##### `vercel flags rules update`

Update a conditional rule in a feature flag environment

```
vercel flags rules update <flag> <rule> [options]
```

###### Options

- `--by <ENTITY.ATTRIBUTE>` — Entity attribute used for split or rollout bucketing, in the form entity.attribute
- `-c, --condition <CONDITION>` (repeatable) — Replace rule conditions. Rule condition as ENTITY.ATTRIBUTE:OPERATOR:VALUE or segment:OPERATOR:SEGMENT. Repeatable; semicolon-separated conditions are also supported. Valid operators: eq, !eq, oneOf, !oneOf, containsAllOf, containsAnyOf, containsNoneOf, startsWith, endsWith, contains, !contains, ex, !ex, gt, gte, lt, lte
- `--default-variant <VARIANT>` — Fallback variant for split or rollout outcomes when the bucketing attribute is unavailable
- `-e, --environment <ENV>` — The environment containing the rule (production, preview, or development)
- `--from-variant <VARIANT>` — Variant to roll away from for rollout outcomes
- `--message <TEXT>` — Optional revision message for the update
- `-s, --stage <PERCENTAGE,DURATION>` (repeatable) — Add a rollout stage as PERCENTAGE,DURATION. Can be specified multiple times.
- `--start <TIME>` — When the rollout should start: "now", a relative time like "1h", or an ISO 8601 datetime
- `--to-variant <VARIANT>` — Variant to roll towards for rollout outcomes
- `-v, --variant <VARIANT>` — Variant ID or value to serve when the rule matches
- `-w, --weight <VARIANT=WEIGHT>` (repeatable) — Split weight ratio as VARIANT=WEIGHT. Repeat for each variant.

###### Examples

Replace rule conditions

```
$ vercel flags rules update my-feature rule_123 --environment production --condition user.plan:eq:enterprise
```

Update a rule outcome

```
$ vercel flags rules update my-feature rule_123 -e production --variant off
```

### `vercel flags sdk-keys`

Manage SDK keys for feature flags

```
vercel flags sdk-keys <command>
```

##### `vercel flags sdk-keys add`

Create a new SDK key

```
vercel flags sdk-keys add [options]
```

###### Options

- `-e, --environment <ENV>` — The environment for the SDK key
- `-l, --label <LABEL>` — Optional label for the SDK key
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `--type <TYPE>` — The type of SDK key (server, client, or mobile)

###### Examples

Create a server SDK key for production

```
$ vercel flags sdk-keys add --type server --environment production
```

Create a client SDK key with a label

```
$ vercel flags sdk-keys add --type client -e preview --label "Preview App"
```

##### `vercel flags sdk-keys list`

List all SDK keys for the current project

Aliases: `ls`

```
vercel flags sdk-keys list [options]
```

###### Options

- `--json` — Output in JSON format
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

###### Examples

List all SDK keys

```
$ vercel flags sdk-keys ls
```

List SDK keys as JSON

```
$ vercel flags sdk-keys ls --json
```

##### `vercel flags sdk-keys remove`

Delete an SDK key

Aliases: `rm`

```
vercel flags sdk-keys remove <key> [options]
```

###### Options

- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-y, --yes` — Skip the confirmation prompt when deleting an SDK key

###### Examples

Delete an SDK key

```
$ vercel flags sdk-keys rm <hash-key>
```

### `vercel flags segments`

Manage feature flag segments

```
vercel flags segments <command>
```

##### `vercel flags segments create`

Create a feature flag segment

Aliases: `add`

```
vercel flags segments create <slug> [options]
```

###### Options

- `-a, --add <TARGET>` (repeatable) — Add include:ENTITY.ATTRIBUTE=VALUE, exclude:ENTITY.ATTRIBUTE=VALUE, or rule:ENTITY.ATTRIBUTE:OPERATOR:VALUE; repeatable. Valid operators: eq, !eq, oneOf, !oneOf, containsAllOf, containsAnyOf, containsNoneOf, startsWith, endsWith, contains, !contains, ex, !ex, gt, gte, lt, lte
- `--data <JSON>` — Full segment data JSON with rules, include, and exclude fields
- `-d, --description <TEXT>` — Description of the segment
- `--hint <TEXT>` — Hint describing who belongs in the segment
- `--json` — Output the created segment as JSON
- `-l, --label <LABEL>` — Human-readable label for the segment
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

###### Examples

Create a segment with included users

```
$ vercel flags segments create beta-users --label "Beta users" --add include:user.id=user_123 --add include:user.id=user_456
```

Create a segment from rules

```
$ vercel flags segments create enterprise-users --label "Enterprise users" --add rule:user.plan:eq:enterprise
```

Create a segment from full JSON data

```
$ vercel flags segments create staff --label Staff --data '{"rules":[],"include":{"user":{"email":[{"value":"me@company.com"}]}},"exclude":{}}'
```

##### `vercel flags segments inspect`

Display information about a feature flag segment

```
vercel flags segments inspect <segment> [options]
```

###### Options

- `--json` — Output in JSON format
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

###### Examples

Show details of a segment

```
$ vercel flags segments inspect beta-users
```

Show segment data as JSON

```
$ vercel flags segments inspect beta-users --json
```

##### `vercel flags segments list`

List all feature flag segments for the current project

Aliases: `ls`

```
vercel flags segments list [options]
```

###### Options

- `--json` — Output in JSON format
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

###### Examples

List all segments

```
$ vercel flags segments ls
```

List segments as JSON

```
$ vercel flags segments ls --json
```

##### `vercel flags segments remove`

Delete a feature flag segment

Aliases: `rm`

```
vercel flags segments remove <segment> [options]
```

###### Options

- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-y, --yes` — Skip the confirmation prompt when deleting a segment

###### Examples

Delete a segment

```
$ vercel flags segments rm beta-users
```

Delete without confirmation

```
$ vercel flags segments rm beta-users --yes
```

##### `vercel flags segments update`

Update a feature flag segment

```
vercel flags segments update <segment> [options]
```

###### Options

- `-a, --add <TARGET>` (repeatable) — Add include:ENTITY.ATTRIBUTE=VALUE, exclude:ENTITY.ATTRIBUTE=VALUE, or rule:ENTITY.ATTRIBUTE:OPERATOR:VALUE; repeatable. Valid operators: eq, !eq, oneOf, !oneOf, containsAllOf, containsAnyOf, containsNoneOf, startsWith, endsWith, contains, !contains, ex, !ex, gt, gte, lt, lte
- `--data <JSON>` — Replace the full segment data JSON with rules, include, and exclude fields
- `-d, --description <TEXT>` — New description for the segment
- `--hint <TEXT>` — New hint for the segment
- `--json` — Output the updated segment as JSON
- `-l, --label <LABEL>` — New human-readable label for the segment
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `--remove <TARGET>` (repeatable) — Remove include:ENTITY.ATTRIBUTE=VALUE, exclude:ENTITY.ATTRIBUTE=VALUE, rule:ENTITY.ATTRIBUTE:OPERATOR:VALUE, or rule:RULE_ID; repeatable. Valid operators: eq, !eq, oneOf, !oneOf, containsAllOf, containsAnyOf, containsNoneOf, startsWith, endsWith, contains, !contains, ex, !ex, gt, gte, lt, lte

###### Examples

Rename a segment

```
$ vercel flags segments update beta-users --label "Early access users"
```

Add and remove included users

```
$ vercel flags segments update beta-users --add include:user.id=user_789 --remove include:user.id=user_123
```

Add and remove rules

```
$ vercel flags segments update enterprise-users --add rule:user.email:ends-with:@company.com --remove rule:user.plan:eq:pro
```

### `vercel flags set`

Set the served variant for a feature flag in an environment

```
vercel flags set <flag> [options]
```

#### Options

- `-e, --environment <ENV>` — The environment to set the variant in (production, preview, or development)
- `--message <TEXT>` — Optional revision message for the update
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-v, --variant <VARIANT>` — The variant ID or value to serve

#### Examples

Set a string variant in production

```
$ vercel flags set welcome-message --environment production --variant control
```

Set a number variant in preview

```
$ vercel flags set bucket-size -e preview --variant 20
```

Set a boolean flag to true in development

```
$ vercel flags set my-feature -e development --variant true
```

### `vercel flags split`

Configure a weighted split for a feature flag in an environment

```
vercel flags split <flag> [options]
```

#### Options

- `--by <ENTITY.ATTRIBUTE>` — Entity attribute used for bucketing, in the form entity.attribute
- `--default-variant <VARIANT>` — The fallback variant to serve when the split attribute is unavailable
- `-e, --environment <ENV>` — The environment to configure (production, preview, or development)
- `--message <TEXT>` — Optional revision message for the update
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-w, --weight <VARIANT=WEIGHT>` (repeatable) — Variant weight ratio as VARIANT=WEIGHT. Repeat for each variant; values are normalized and 0 receives no traffic.

#### Examples

Split a boolean flag in production

```
$ vercel flags split redesigned-checkout --environment production --by user.userId --weight off=95 --weight on=5
```

Split a string flag with a fallback variant

```
$ vercel flags split welcome-message -e production --by user.userId --default-variant control --weight control=90 --weight treatment=10
```

Exclude a variant from the split

```
$ vercel flags split checkout-copy -e preview --by user.userId --default-variant control --weight control=50 --weight treatment=50 --weight legacy=0
```

### `vercel flags update`

Update an existing feature flag

```
vercel flags update <flag> [options]
```

#### Options

- `-l, --label <LABEL>` — New variant label
- `--message <TEXT>` — Optional revision message for the update
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `--value <VALUE>` — New variant value
- `-v, --variant <VARIANT>` — Variant ID or value to update

#### Examples

Update a string variant value and label

```
$ vercel flags update my-feature --variant control --value welcome-back --label "Welcome back"
```

Update a variant with a revision message

```
$ vercel flags update my-feature --variant control --label "Control" --message "Rename control variant"
```

Rename a boolean variant label

```
$ vercel flags update my-feature --variant false --label "Disabled"
```

### `vercel flags versions`

List and compare version history for a feature flag

```
vercel flags versions [command]
```

##### `vercel flags versions diff`

Show changes introduced by a feature flag version

```
vercel flags versions diff <flag> [options]
```

###### Options

- `--json` — Output the diff in JSON format
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `--revision <NUMBER>` — Revision number to compare with the previous revision

###### Examples

Show what changed in a revision

```
$ vercel flags versions diff my-feature-flag --revision 4
```

Show the revision diff as JSON

```
$ vercel flags versions diff my-feature-flag --revision 4 --json
```

##### `vercel flags versions list`

List version history for a feature flag (default subcommand)

Aliases: `ls`

```
vercel flags versions list <flag> [options]
```

###### Options

- `--cursor <CURSOR>` — Pagination cursor from a previous versions response
- `-e, --environment <ENV>` — Filter versions by changed environment
- `--json` — Output in JSON format
- `--limit <NUMBER>` — Return at most NUMBER versions (1-100)
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

###### Examples

List version history for a feature flag

```
$ vercel flags versions my-feature-flag
```

List version history using the explicit list subcommand

```
$ vercel flags versions list my-feature-flag
```

List production version history

```
$ vercel flags versions my-feature-flag --environment production
```

List the next page of version history

```
$ vercel flags versions my-feature-flag --limit 10 --cursor <cursor>
```

List version history as JSON

```
$ vercel flags versions my-feature-flag --json
```

#### Examples

List version history for a feature flag

```
$ vercel flags versions my-feature-flag
```

Show what changed in a revision

```
$ vercel flags versions diff my-feature-flag --revision 4
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
