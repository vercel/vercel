[**@vercel/functions**](../../README.md)

***

# Function: getEnv()

> **getEnv**(`env?`): `object`

Defined in: [packages/functions/src/get-env.ts:6](https://github.com/vercel/vercel/blob/main/packages/functions/src/get-env.ts#L6)

Get System Environment Variables exposed by Vercel.

## Parameters

### env?

## Returns

### CI

> **CI**: `string` \| `undefined`

An indicator that the code is running in a Continuous Integration environment.

#### Example

```ts
"1"
```

### VERCEL

> **VERCEL**: `string` \| `undefined`

An indicator to show that System Environment Variables have been exposed to your project's Deployments.

#### Example

```ts
"1"
```

### VERCEL\_AUTOMATION\_BYPASS\_SECRET

> **VERCEL\_AUTOMATION\_BYPASS\_SECRET**: `string` \| `undefined`

The Protection Bypass for Automation value, if the secret has been generated in the project's Deployment Protection settings.

### VERCEL\_BRANCH\_URL

> **VERCEL\_BRANCH\_URL**: `string` \| `undefined`

The domain name of the generated Git branch URL. The value does not include the protocol scheme https://.

#### Example

```ts
"*-git-*.vercel.app"
```

### VERCEL\_DEPLOYMENT\_ID

> **VERCEL\_DEPLOYMENT\_ID**: `string` \| `undefined`

The unique identifier for the deployment, which can be used to implement Skew Protection.

#### Example

```ts
"dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3"
```

### VERCEL\_ENV

> **VERCEL\_ENV**: `string` \| `undefined`

The Environment that the app is deployed and running on.

#### Example

```ts
"production"
```

### VERCEL\_GIT\_COMMIT\_AUTHOR\_LOGIN

> **VERCEL\_GIT\_COMMIT\_AUTHOR\_LOGIN**: `string` \| `undefined`

The username attached to the author of the commit that the project was deployed by.

#### Example

```ts
"johndoe"
```

### VERCEL\_GIT\_COMMIT\_AUTHOR\_NAME

> **VERCEL\_GIT\_COMMIT\_AUTHOR\_NAME**: `string` \| `undefined`

The name attached to the author of the commit that the project was deployed by.

#### Example

```ts
"John Doe"
```

### VERCEL\_GIT\_COMMIT\_MESSAGE

> **VERCEL\_GIT\_COMMIT\_MESSAGE**: `string` \| `undefined`

The message attached to the commit the deployment was triggered by.

#### Example

```ts
"Update about page"
```

### VERCEL\_GIT\_COMMIT\_REF

> **VERCEL\_GIT\_COMMIT\_REF**: `string` \| `undefined`

The git branch of the commit the deployment was triggered by.

#### Example

```ts
"improve-about-page"
```

### VERCEL\_GIT\_COMMIT\_SHA

> **VERCEL\_GIT\_COMMIT\_SHA**: `string` \| `undefined`

The git SHA of the commit the deployment was triggered by.

#### Example

```ts
"fa1eade47b73733d6312d5abfad33ce9e4068081"
```

### VERCEL\_GIT\_PREVIOUS\_SHA

> **VERCEL\_GIT\_PREVIOUS\_SHA**: `string` \| `undefined`

The git SHA of the last successful deployment for the project and branch.
NOTE: This Variable is only exposed when an Ignored Build Step is provided.

#### Example

```ts
"fa1eade47b73733d6312d5abfad33ce9e4068080"
```

### VERCEL\_GIT\_PROVIDER

> **VERCEL\_GIT\_PROVIDER**: `string` \| `undefined`

The Git Provider the deployment is triggered from.

#### Example

```ts
"github"
```

### VERCEL\_GIT\_PULL\_REQUEST\_ID

> **VERCEL\_GIT\_PULL\_REQUEST\_ID**: `string` \| `undefined`

The pull request id the deployment was triggered by. If a deployment is created on a branch before a pull request is made, this value will be an empty string.

#### Example

```ts
"23"
```

### VERCEL\_GIT\_REPO\_ID

> **VERCEL\_GIT\_REPO\_ID**: `string` \| `undefined`

The ID of the repository the deployment is triggered from.

#### Example

```ts
"117716146"
```

### VERCEL\_GIT\_REPO\_OWNER

> **VERCEL\_GIT\_REPO\_OWNER**: `string` \| `undefined`

The account that owns the repository the deployment is triggered from.

#### Example

```ts
"acme"
```

### VERCEL\_GIT\_REPO\_SLUG

> **VERCEL\_GIT\_REPO\_SLUG**: `string` \| `undefined`

The origin repository the deployment is triggered from.

#### Example

```ts
"my-site"
```

### VERCEL\_PROJECT\_PRODUCTION\_URL

> **VERCEL\_PROJECT\_PRODUCTION\_URL**: `string` \| `undefined`

A production domain name of the project. This is useful to reliably generate links that point to production such as OG-image URLs.
The value does not include the protocol scheme https://.

#### Example

```ts
"myproject.vercel.app"
```

### VERCEL\_REGION

> **VERCEL\_REGION**: `string` \| `undefined`

The ID of the Region where the app is running.

Possible values:
- arn1 (Stockholm, Sweden)
- bom1 (Mumbai, India)
- cdg1 (Paris, France)
- cle1 (Cleveland, USA)
- cpt1 (Cape Town, South Africa)
- dub1 (Dublin, Ireland)
- fra1 (Frankfurt, Germany)
- gru1 (São Paulo, Brazil)
- hkg1 (Hong Kong)
- hnd1 (Tokyo, Japan)
- iad1 (Washington, D.C., USA)
- icn1 (Seoul, South Korea)
- kix1 (Osaka, Japan)
- lhr1 (London, United Kingdom)
- pdx1 (Portland, USA)
- sfo1 (San Francisco, USA)
- sin1 (Singapore)
- syd1 (Sydney, Australia)
- dev1 (Development Region)

#### Example

```ts
"iad1"
```

### VERCEL\_SKEW\_PROTECTION\_ENABLED

> **VERCEL\_SKEW\_PROTECTION\_ENABLED**: `string` \| `undefined`

When Skew Protection is enabled in Project Settings, this value is set to 1.

#### Example

```ts
"1"
```

### VERCEL\_URL

> **VERCEL\_URL**: `string` \| `undefined`

The domain name of the generated deployment URL. The value does not include the protocol scheme https://.
NOTE: This Variable cannot be used in conjunction with Standard Deployment Protection.

#### Example

```ts
"*.vercel.app"
```

## See

https://vercel.com/docs/projects/environment-variables/system-environment-variables#system-environment-variables
