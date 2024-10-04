<p align="center">
  <a href="https://vercel.com">
    <img src="https://assets.vercel.com/image/upload/v1588805858/repositories/vercel/logo.png" height="96">
    <h3 align="center">Vercel</h3>
  </a>
  <p align="center">Develop. Preview. Ship.</p>
</p>

[Join the Vercel Community](https://vercel.community/)

# @vercel/sdk

The `@vercel/sdk` is a type-safe Typescript SDK that gives you full control over the entire Vercel platform through the [Vercel REST API](https://vercel.com/docs/rest-api).

<div align="left">
    <a href="https://www.speakeasy.com/?utm_source=@vercel/sdk&utm_campaign=typescript"><img src="https://custom-icon-badges.demolab.com/badge/-Built%20By%20Speakeasy-212015?style=for-the-badge&logoColor=FBE331&logo=speakeasy&labelColor=545454" /></a>
    <a href="https://opensource.org/licenses/MIT">
        <img src="https://img.shields.io/badge/License-MIT-blue.svg" style="width: 100px; height: 28px;" />
    </a>
</div>

<!-- No Summary [summary] -->

<!-- Start Table of Contents [toc] -->
## Table of Contents

* [SDK Installation](#sdk-installation)
* [Requirements](#requirements)
* [SDK Example Usage](#sdk-example-usage)
* [Available Resources and Operations](#available-resources-and-operations)
* [Standalone functions](#standalone-functions)
* [Pagination](#pagination)
* [File uploads](#file-uploads)
* [Retries](#retries)
* [Error Handling](#error-handling)
* [Server Selection](#server-selection)
* [Custom HTTP Client](#custom-http-client)
* [Authentication](#authentication)
* [Debugging](#debugging)
<!-- End Table of Contents [toc] -->

<!-- Start SDK Installation [installation] -->
## SDK Installation

The SDK can be installed with either [npm](https://www.npmjs.com/), [pnpm](https://pnpm.io/), [bun](https://bun.sh/) or [yarn](https://classic.yarnpkg.com/en/) package managers.

### NPM

```bash
npm add @vercel/sdk
```

### PNPM

```bash
pnpm add @vercel/sdk
```

### Bun

```bash
bun add @vercel/sdk
```

### Yarn

```bash
yarn add @vercel/sdk zod

# Note that Yarn does not install peer dependencies automatically. You will need
# to install zod as shown above.
```

> [!NOTE]
> This package is published with CommonJS and ES Modules (ESM) support.
<!-- End SDK Installation [installation] -->

<!-- Start Requirements [requirements] -->
## Requirements

For supported JavaScript runtimes, please consult [RUNTIMES.md](RUNTIMES.md).
<!-- End Requirements [requirements] -->

## Access Tokens

You need to pass a valid access token to be able to use any resource or operation. Refer to [Creating an Access Token](https://vercel.com/docs/rest-api#creating-an-access-token) to learn how to create one. Make sure that you create a token with the correct Vercel [scope](https://vercel.com/docs/dashboard-features#scope-selector). 
If you face permission (403) errors when you are already sending a token, it can be one of the following problems:
- The token you are using has expired. Check the expiry date of the token in the Vercel dashboard.
- The token does not have access to the correct scope, either not the right team or it does not have account level access.
- The resource or operation you are trying to use is not available for that team. For example, AccessGroups is an Enterprise only feature and you are using a token for a team on the pro plan.

<!-- Start Authentication [security] -->
## Authentication

### Per-Client Security Schemes

This SDK supports the following security scheme globally:

| Name          | Type          | Scheme        |
| ------------- | ------------- | ------------- |
| `bearerToken` | http          | HTTP Bearer   |

To authenticate with the API the `bearerToken` parameter must be set when initializing the SDK client instance. For example:
```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.listDeploymentBuilds({
    deploymentId: "<value>",
  });

  // Handle the result
  console.log(result);
}

run();

```
<!-- End Authentication [security] -->

<!-- Start SDK Example Usage [usage] -->
## SDK Example Usage

### Example 1

```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.deployments.get({
    idOrUrl: "dpl_89qyp1cskzkLrVicDaZoDbjyHuDJ",
    withGitRepoInfo: "true",
  });

  // Handle the result
  console.log(result);
}

run();

```

### Example 2

```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.deployments.create({
    requestBody: {
      files: [
        {
          data: "<value>",
          file: "folder/file.js",
        },
      ],
      gitMetadata: {
        remoteUrl: "https://github.com/vercel/next.js",
        commitAuthorName: "kyliau",
        commitMessage:
          "add method to measure Interaction to Next Paint (INP) (#36490)",
        commitRef: "main",
        commitSha: "dc36199b2234c6586ebe05ec94078a895c707e29",
        dirty: true,
      },
      meta: {
        "foo": "bar",
      },
      name: "my-instant-deployment",
      project: "my-deployment-project",
    },
  });

  // Handle the result
  console.log(result);
}

run();

```
<!-- End SDK Example Usage [usage] -->

<!-- Start Available Resources and Operations [operations] -->
## Available Resources and Operations

<details open>
<summary>Available methods</summary>

### [accessGroups](docs/sdks/accessgroups/README.md)

* [read](docs/sdks/accessgroups/README.md#read) - Reads an access group
* [update](docs/sdks/accessgroups/README.md#update) - Update an access group
* [delete](docs/sdks/accessgroups/README.md#delete) - Deletes an access group
* [listMembers](docs/sdks/accessgroups/README.md#listmembers) - List members of an access group
* [list](docs/sdks/accessgroups/README.md#list) - List access groups for a team, project or member
* [create](docs/sdks/accessgroups/README.md#create) - Creates an access group
* [listProjects](docs/sdks/accessgroups/README.md#listprojects) - List projects of an access group

### [aliases](docs/sdks/aliases/README.md)

* [list](docs/sdks/aliases/README.md#list) - List aliases
* [get](docs/sdks/aliases/README.md#get) - Get an Alias
* [delete](docs/sdks/aliases/README.md#delete) - Delete an Alias
* [assign](docs/sdks/aliases/README.md#assign) - Assign an Alias

### [artifacts](docs/sdks/artifacts/README.md)

* [recordEvents](docs/sdks/artifacts/README.md#recordevents) - Record an artifacts cache usage event
* [status](docs/sdks/artifacts/README.md#status) - Get status of Remote Caching for this principal
* [upload](docs/sdks/artifacts/README.md#upload) - Upload a cache artifact
* [download](docs/sdks/artifacts/README.md#download) - Download a cache artifact
* [exists](docs/sdks/artifacts/README.md#exists) - Check if a cache artifact exists
* [query](docs/sdks/artifacts/README.md#query) - Query information about an artifact

### [authentication](docs/sdks/authentication/README.md)

* [login](docs/sdks/authentication/README.md#login) - Login with email
* [verify](docs/sdks/authentication/README.md#verify) - Verify a login request to get an authentication token

### [certs](docs/sdks/certs/README.md)

* [getById](docs/sdks/certs/README.md#getbyid) - Get cert by id
* [remove](docs/sdks/certs/README.md#remove) - Remove cert
* [issue](docs/sdks/certs/README.md#issue) - Issue a new cert
* [upload](docs/sdks/certs/README.md#upload) - Upload a cert

### [checks](docs/sdks/checks/README.md)

* [create](docs/sdks/checks/README.md#create) - Creates a new Check
* [list](docs/sdks/checks/README.md#list) - Retrieve a list of all checks
* [get](docs/sdks/checks/README.md#get) - Get a single check
* [update](docs/sdks/checks/README.md#update) - Update a check
* [rerequest](docs/sdks/checks/README.md#rerequest) - Rerequest a check

### [deployments](docs/sdks/deployments/README.md)

* [getEvents](docs/sdks/deployments/README.md#getevents) - Get deployment events
* [get](docs/sdks/deployments/README.md#get) - Get a deployment by ID or URL
* [create](docs/sdks/deployments/README.md#create) - Create a new deployment
* [cancel](docs/sdks/deployments/README.md#cancel) - Cancel a deployment
* [uploadFile](docs/sdks/deployments/README.md#uploadfile) - Upload Deployment Files
* [listAliases](docs/sdks/deployments/README.md#listaliases) - List Deployment Aliases
* [listFiles](docs/sdks/deployments/README.md#listfiles) - List Deployment Files
* [getFileContents](docs/sdks/deployments/README.md#getfilecontents) - Get Deployment File Contents
* [list](docs/sdks/deployments/README.md#list) - List deployments
* [delete](docs/sdks/deployments/README.md#delete) - Delete a Deployment

### [dns](docs/sdks/dns/README.md)

* [listRecords](docs/sdks/dns/README.md#listrecords) - List existing DNS records
* [createRecord](docs/sdks/dns/README.md#createrecord) - Create a DNS record
* [updateRecord](docs/sdks/dns/README.md#updaterecord) - Update an existing DNS record
* [removeRecord](docs/sdks/dns/README.md#removerecord) - Delete a DNS record

### [domains](docs/sdks/domains/README.md)

* [buy](docs/sdks/domains/README.md#buy) - Purchase a domain
* [checkPrice](docs/sdks/domains/README.md#checkprice) - Check the price for a domain
* [checkStatus](docs/sdks/domains/README.md#checkstatus) - Check a Domain Availability
* [getTransfer](docs/sdks/domains/README.md#gettransfer) - Get domain transfer info.
* [getConfig](docs/sdks/domains/README.md#getconfig) - Get a Domain's configuration
* [get](docs/sdks/domains/README.md#get) - Get Information for a Single Domain
* [list](docs/sdks/domains/README.md#list) - List all the domains
* [createOrTransfer](docs/sdks/domains/README.md#createortransfer) - Register or transfer-in a new Domain
* [update](docs/sdks/domains/README.md#update) - Update or move apex domain
* [delete](docs/sdks/domains/README.md#delete) - Remove a domain by name
* [listByProject](docs/sdks/domains/README.md#listbyproject) - Retrieve project domains by project by id or name
* [create](docs/sdks/domains/README.md#create) - Add a domain to a project
* [verify](docs/sdks/domains/README.md#verify) - Verify project domain

### [edgeConfigs](docs/sdks/edgeconfigs/README.md)

* [list](docs/sdks/edgeconfigs/README.md#list) - Get Edge Configs
* [create](docs/sdks/edgeconfigs/README.md#create) - Create an Edge Config
* [get](docs/sdks/edgeconfigs/README.md#get) - Get an Edge Config
* [update](docs/sdks/edgeconfigs/README.md#update) - Update an Edge Config
* [delete](docs/sdks/edgeconfigs/README.md#delete) - Delete an Edge Config
* [getItems](docs/sdks/edgeconfigs/README.md#getitems) - Get Edge Config items
* [getSchema](docs/sdks/edgeconfigs/README.md#getschema) - Get Edge Config schema
* [updateSchema](docs/sdks/edgeconfigs/README.md#updateschema) - Update Edge Config schema
* [deleteSchema](docs/sdks/edgeconfigs/README.md#deleteschema) - Delete an Edge Config's schema
* [getItem](docs/sdks/edgeconfigs/README.md#getitem) - Get an Edge Config item
* [getTokens](docs/sdks/edgeconfigs/README.md#gettokens) - Get all tokens of an Edge Config
* [deleteTokens](docs/sdks/edgeconfigs/README.md#deletetokens) - Delete one or more Edge Config tokens
* [getToken](docs/sdks/edgeconfigs/README.md#gettoken) - Get Edge Config token meta data
* [createToken](docs/sdks/edgeconfigs/README.md#createtoken) - Create an Edge Config token

### [envs](docs/sdks/envs/README.md)

* [listByProject](docs/sdks/envs/README.md#listbyproject) - Retrieve the environment variables of a project by id or name
* [get](docs/sdks/envs/README.md#get) - Retrieve the decrypted value of an environment variable of a project by id
* [create](docs/sdks/envs/README.md#create) - Create one or more environment variables
* [delete](docs/sdks/envs/README.md#delete) - Remove an environment variable
* [update](docs/sdks/envs/README.md#update) - Edit an environment variable

### [events](docs/sdks/events/README.md)

* [list](docs/sdks/events/README.md#list) - List User Events

### [integrations](docs/sdks/integrations/README.md)

* [getConfigurations](docs/sdks/integrations/README.md#getconfigurations) - Get configurations for the authenticated user or team
* [getConfiguration](docs/sdks/integrations/README.md#getconfiguration) - Retrieve an integration configuration
* [deleteConfiguration](docs/sdks/integrations/README.md#deleteconfiguration) - Delete an integration configuration
* [getGitNamespaces](docs/sdks/integrations/README.md#getgitnamespaces) - List git namespaces by provider
* [searchRepos](docs/sdks/integrations/README.md#searchrepos) - List git repositories linked to namespace by provider

### [logDrains](docs/sdks/logdrains/README.md)

* [list](docs/sdks/logdrains/README.md#list) - Retrieves a list of Integration log drains
* [create](docs/sdks/logdrains/README.md#create) - Creates a new Integration Log Drain
* [deleteIntegration](docs/sdks/logdrains/README.md#deleteintegration) - Deletes the Integration log drain with the provided `id`
* [getConfigurable](docs/sdks/logdrains/README.md#getconfigurable) - Retrieves a Configurable Log Drain
* [deleteConfigurable](docs/sdks/logdrains/README.md#deleteconfigurable) - Deletes a Configurable Log Drain
* [getAll](docs/sdks/logdrains/README.md#getall) - Retrieves a list of all the Log Drains
* [createConfigurable](docs/sdks/logdrains/README.md#createconfigurable) - Creates a Configurable Log Drain

### [projectDomains](docs/sdks/projectdomains/README.md)

* [get](docs/sdks/projectdomains/README.md#get) - Get a project domain
* [update](docs/sdks/projectdomains/README.md#update) - Update a project domain
* [delete](docs/sdks/projectdomains/README.md#delete) - Remove a domain from a project

### [projectMembers](docs/sdks/projectmembers/README.md)

* [get](docs/sdks/projectmembers/README.md#get) - List project members
* [add](docs/sdks/projectmembers/README.md#add) - Adds a new member to a project.
* [remove](docs/sdks/projectmembers/README.md#remove) - Remove a Project Member

### [projects](docs/sdks/projects/README.md)

* [updateDataCache](docs/sdks/projects/README.md#updatedatacache) - Update the data cache feature
* [getAll](docs/sdks/projects/README.md#getall) - Retrieve a list of projects
* [create](docs/sdks/projects/README.md#create) - Create a new project
* [update](docs/sdks/projects/README.md#update) - Update an existing project
* [delete](docs/sdks/projects/README.md#delete) - Delete a Project
* [pause](docs/sdks/projects/README.md#pause) - Pause a project
* [unpause](docs/sdks/projects/README.md#unpause) - Unpause a project

### [promotions](docs/sdks/promotions/README.md)

* [create](docs/sdks/promotions/README.md#create) - Points all production domains for a project to the given deploy
* [listAliases](docs/sdks/promotions/README.md#listaliases) - Gets a list of aliases with status for the current promote

### [protectionBypass](docs/sdks/protectionbypass/README.md)

* [update](docs/sdks/protectionbypass/README.md#update) - Update Protection Bypass for Automation

### [secrets](docs/sdks/secrets/README.md)

* [list](docs/sdks/secrets/README.md#list) - List secrets
* [create](docs/sdks/secrets/README.md#create) - Create a new secret
* [rename](docs/sdks/secrets/README.md#rename) - Change secret name
* [get](docs/sdks/secrets/README.md#get) - Get a single secret
* [delete](docs/sdks/secrets/README.md#delete) - Delete a secret

### [teams](docs/sdks/teams/README.md)

* [getMembers](docs/sdks/teams/README.md#getmembers) - List team members
* [inviteUser](docs/sdks/teams/README.md#inviteuser) - Invite a user
* [requestAccess](docs/sdks/teams/README.md#requestaccess) - Request access to a team
* [getAccessRequest](docs/sdks/teams/README.md#getaccessrequest) - Get access request status
* [join](docs/sdks/teams/README.md#join) - Join a team
* [updateMember](docs/sdks/teams/README.md#updatemember) - Update a Team Member
* [removeMember](docs/sdks/teams/README.md#removemember) - Remove a Team Member
* [get](docs/sdks/teams/README.md#get) - Get a Team
* [update](docs/sdks/teams/README.md#update) - Update a Team
* [list](docs/sdks/teams/README.md#list) - List all teams
* [create](docs/sdks/teams/README.md#create) - Create a Team
* [delete](docs/sdks/teams/README.md#delete) - Delete a Team
* [deleteInviteCode](docs/sdks/teams/README.md#deleteinvitecode) - Delete a Team invite code

### [tokens](docs/sdks/tokens/README.md)

* [list](docs/sdks/tokens/README.md#list) - List Auth Tokens
* [create](docs/sdks/tokens/README.md#create) - Create an Auth Token
* [get](docs/sdks/tokens/README.md#get) - Get Auth Token Metadata
* [delete](docs/sdks/tokens/README.md#delete) - Delete an authentication token

### [user](docs/sdks/user/README.md)

* [getAuthUser](docs/sdks/user/README.md#getauthuser) - Get the User
* [requestDelete](docs/sdks/user/README.md#requestdelete) - Delete User Account

### [Vercel SDK](docs/sdks/vercel/README.md)

* [listDeploymentBuilds](docs/sdks/vercel/README.md#listdeploymentbuilds) - Retrieves the list of builds given their deployment's unique identifier. No longer listed as public API as of May 2023.
* [datacachePurgeall](docs/sdks/vercel/README.md#datacachepurgeall)
* [dataCacheBillingSettings](docs/sdks/vercel/README.md#datacachebillingsettings)

### [webhooks](docs/sdks/webhooks/README.md)

* [create](docs/sdks/webhooks/README.md#create) - Creates a webhook
* [list](docs/sdks/webhooks/README.md#list) - Get a list of webhooks
* [get](docs/sdks/webhooks/README.md#get) - Get a webhook
* [delete](docs/sdks/webhooks/README.md#delete) - Deletes a webhook

</details>
<!-- End Available Resources and Operations [operations] -->

<!-- Start Standalone functions [standalone-funcs] -->
## Standalone functions

All the methods listed above are available as standalone functions. These
functions are ideal for use in applications running in the browser, serverless
runtimes or other environments where application bundle size is a primary
concern. When using a bundler to build your application, all unused
functionality will be either excluded from the final bundle or tree-shaken away.

To read more about standalone functions, check [FUNCTIONS.md](./FUNCTIONS.md).

<details>

<summary>Available standalone functions</summary>

- [accessGroupsCreate](docs/sdks/accessgroups/README.md#create)
- [accessGroupsDelete](docs/sdks/accessgroups/README.md#delete)
- [accessGroupsListMembers](docs/sdks/accessgroups/README.md#listmembers)
- [accessGroupsListProjects](docs/sdks/accessgroups/README.md#listprojects)
- [accessGroupsList](docs/sdks/accessgroups/README.md#list)
- [accessGroupsRead](docs/sdks/accessgroups/README.md#read)
- [accessGroupsUpdate](docs/sdks/accessgroups/README.md#update)
- [aliasesAssign](docs/sdks/aliases/README.md#assign)
- [aliasesDelete](docs/sdks/aliases/README.md#delete)
- [aliasesGet](docs/sdks/aliases/README.md#get)
- [aliasesList](docs/sdks/aliases/README.md#list)
- [artifactsDownload](docs/sdks/artifacts/README.md#download)
- [artifactsExists](docs/sdks/artifacts/README.md#exists)
- [artifactsQuery](docs/sdks/artifacts/README.md#query)
- [artifactsRecordEvents](docs/sdks/artifacts/README.md#recordevents)
- [artifactsStatus](docs/sdks/artifacts/README.md#status)
- [artifactsUpload](docs/sdks/artifacts/README.md#upload)
- [authenticationLogin](docs/sdks/authentication/README.md#login)
- [authenticationVerify](docs/sdks/authentication/README.md#verify)
- [certsGetById](docs/sdks/certs/README.md#getbyid)
- [certsIssue](docs/sdks/certs/README.md#issue)
- [certsRemove](docs/sdks/certs/README.md#remove)
- [certsUpload](docs/sdks/certs/README.md#upload)
- [checksCreate](docs/sdks/checks/README.md#create)
- [checksGet](docs/sdks/checks/README.md#get)
- [checksList](docs/sdks/checks/README.md#list)
- [checksRerequest](docs/sdks/checks/README.md#rerequest)
- [checksUpdate](docs/sdks/checks/README.md#update)
- [dataCacheBillingSettings](docs/sdks/vercel/README.md#datacachebillingsettings)
- [datacachePurgeall](docs/sdks/vercel/README.md#datacachepurgeall)
- [deploymentsCancel](docs/sdks/deployments/README.md#cancel)
- [deploymentsCreate](docs/sdks/deployments/README.md#create)
- [deploymentsDelete](docs/sdks/deployments/README.md#delete)
- [deploymentsGetEvents](docs/sdks/deployments/README.md#getevents)
- [deploymentsGetFileContents](docs/sdks/deployments/README.md#getfilecontents)
- [deploymentsGet](docs/sdks/deployments/README.md#get)
- [deploymentsListAliases](docs/sdks/deployments/README.md#listaliases)
- [deploymentsListFiles](docs/sdks/deployments/README.md#listfiles)
- [deploymentsList](docs/sdks/deployments/README.md#list)
- [deploymentsUploadFile](docs/sdks/deployments/README.md#uploadfile)
- [dnsCreateRecord](docs/sdks/dns/README.md#createrecord)
- [dnsListRecords](docs/sdks/dns/README.md#listrecords)
- [dnsRemoveRecord](docs/sdks/dns/README.md#removerecord)
- [dnsUpdateRecord](docs/sdks/dns/README.md#updaterecord)
- [domainsBuy](docs/sdks/domains/README.md#buy)
- [domainsCheckPrice](docs/sdks/domains/README.md#checkprice)
- [domainsCheckStatus](docs/sdks/domains/README.md#checkstatus)
- [domainsCreateOrTransfer](docs/sdks/domains/README.md#createortransfer)
- [domainsCreate](docs/sdks/domains/README.md#create)
- [domainsDelete](docs/sdks/domains/README.md#delete)
- [domainsGetConfig](docs/sdks/domains/README.md#getconfig)
- [domainsGetTransfer](docs/sdks/domains/README.md#gettransfer)
- [domainsGet](docs/sdks/domains/README.md#get)
- [domainsListByProject](docs/sdks/domains/README.md#listbyproject)
- [domainsList](docs/sdks/domains/README.md#list)
- [domainsUpdate](docs/sdks/domains/README.md#update)
- [domainsVerify](docs/sdks/domains/README.md#verify)
- [edgeConfigsCreateToken](docs/sdks/edgeconfigs/README.md#createtoken)
- [edgeConfigsCreate](docs/sdks/edgeconfigs/README.md#create)
- [edgeConfigsDeleteSchema](docs/sdks/edgeconfigs/README.md#deleteschema)
- [edgeConfigsDeleteTokens](docs/sdks/edgeconfigs/README.md#deletetokens)
- [edgeConfigsDelete](docs/sdks/edgeconfigs/README.md#delete)
- [edgeConfigsGetItem](docs/sdks/edgeconfigs/README.md#getitem)
- [edgeConfigsGetItems](docs/sdks/edgeconfigs/README.md#getitems)
- [edgeConfigsGetSchema](docs/sdks/edgeconfigs/README.md#getschema)
- [edgeConfigsGetToken](docs/sdks/edgeconfigs/README.md#gettoken)
- [edgeConfigsGetTokens](docs/sdks/edgeconfigs/README.md#gettokens)
- [edgeConfigsGet](docs/sdks/edgeconfigs/README.md#get)
- [edgeConfigsList](docs/sdks/edgeconfigs/README.md#list)
- [edgeConfigsUpdateSchema](docs/sdks/edgeconfigs/README.md#updateschema)
- [edgeConfigsUpdate](docs/sdks/edgeconfigs/README.md#update)
- [envsCreate](docs/sdks/envs/README.md#create)
- [envsDelete](docs/sdks/envs/README.md#delete)
- [envsGet](docs/sdks/envs/README.md#get)
- [envsListByProject](docs/sdks/envs/README.md#listbyproject)
- [envsUpdate](docs/sdks/envs/README.md#update)
- [eventsList](docs/sdks/events/README.md#list)
- [integrationsDeleteConfiguration](docs/sdks/integrations/README.md#deleteconfiguration)
- [integrationsGetConfiguration](docs/sdks/integrations/README.md#getconfiguration)
- [integrationsGetConfigurations](docs/sdks/integrations/README.md#getconfigurations)
- [integrationsGetGitNamespaces](docs/sdks/integrations/README.md#getgitnamespaces)
- [integrationsSearchRepos](docs/sdks/integrations/README.md#searchrepos)
- [listDeploymentBuilds](docs/sdks/vercel/README.md#listdeploymentbuilds)
- [logDrainsCreateConfigurable](docs/sdks/logdrains/README.md#createconfigurable)
- [logDrainsCreate](docs/sdks/logdrains/README.md#create)
- [logDrainsDeleteConfigurable](docs/sdks/logdrains/README.md#deleteconfigurable)
- [logDrainsDeleteIntegration](docs/sdks/logdrains/README.md#deleteintegration)
- [logDrainsGetAll](docs/sdks/logdrains/README.md#getall)
- [logDrainsGetConfigurable](docs/sdks/logdrains/README.md#getconfigurable)
- [logDrainsList](docs/sdks/logdrains/README.md#list)
- [projectDomainsDelete](docs/sdks/projectdomains/README.md#delete)
- [projectDomainsGet](docs/sdks/projectdomains/README.md#get)
- [projectDomainsUpdate](docs/sdks/projectdomains/README.md#update)
- [projectMembersAdd](docs/sdks/projectmembers/README.md#add)
- [projectMembersGet](docs/sdks/projectmembers/README.md#get)
- [projectMembersRemove](docs/sdks/projectmembers/README.md#remove)
- [projectsCreate](docs/sdks/projects/README.md#create)
- [projectsDelete](docs/sdks/projects/README.md#delete)
- [projectsGetAll](docs/sdks/projects/README.md#getall)
- [projectsPause](docs/sdks/projects/README.md#pause)
- [projectsUnpause](docs/sdks/projects/README.md#unpause)
- [projectsUpdateDataCache](docs/sdks/projects/README.md#updatedatacache)
- [projectsUpdate](docs/sdks/projects/README.md#update)
- [promotionsCreate](docs/sdks/promotions/README.md#create)
- [promotionsListAliases](docs/sdks/promotions/README.md#listaliases)
- [protectionBypassUpdate](docs/sdks/protectionbypass/README.md#update)
- [secretsCreate](docs/sdks/secrets/README.md#create)
- [secretsDelete](docs/sdks/secrets/README.md#delete)
- [secretsGet](docs/sdks/secrets/README.md#get)
- [secretsList](docs/sdks/secrets/README.md#list)
- [secretsRename](docs/sdks/secrets/README.md#rename)
- [teamsCreate](docs/sdks/teams/README.md#create)
- [teamsDeleteInviteCode](docs/sdks/teams/README.md#deleteinvitecode)
- [teamsDelete](docs/sdks/teams/README.md#delete)
- [teamsGetAccessRequest](docs/sdks/teams/README.md#getaccessrequest)
- [teamsGetMembers](docs/sdks/teams/README.md#getmembers)
- [teamsGet](docs/sdks/teams/README.md#get)
- [teamsInviteUser](docs/sdks/teams/README.md#inviteuser)
- [teamsJoin](docs/sdks/teams/README.md#join)
- [teamsList](docs/sdks/teams/README.md#list)
- [teamsRemoveMember](docs/sdks/teams/README.md#removemember)
- [teamsRequestAccess](docs/sdks/teams/README.md#requestaccess)
- [teamsUpdateMember](docs/sdks/teams/README.md#updatemember)
- [teamsUpdate](docs/sdks/teams/README.md#update)
- [tokensCreate](docs/sdks/tokens/README.md#create)
- [tokensDelete](docs/sdks/tokens/README.md#delete)
- [tokensGet](docs/sdks/tokens/README.md#get)
- [tokensList](docs/sdks/tokens/README.md#list)
- [userGetAuthUser](docs/sdks/user/README.md#getauthuser)
- [userRequestDelete](docs/sdks/user/README.md#requestdelete)
- [webhooksCreate](docs/sdks/webhooks/README.md#create)
- [webhooksDelete](docs/sdks/webhooks/README.md#delete)
- [webhooksGet](docs/sdks/webhooks/README.md#get)
- [webhooksList](docs/sdks/webhooks/README.md#list)


</details>
<!-- End Standalone functions [standalone-funcs] -->

<!-- Start Pagination [pagination] -->
## Pagination

Some of the endpoints in this SDK support pagination. To use pagination, you
make your SDK calls as usual, but the returned response object will also be an
async iterable that can be consumed using the [`for await...of`][for-await-of]
syntax.

[for-await-of]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of

Here's an example of one such pagination call:

```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.projects.getAll({
    gitForkProtection: "1",
    repoUrl: "https://github.com/vercel/next.js",
  });

  for await (const page of result) {
    // Handle the page
    console.log(page);
  }
}

run();

```
<!-- End Pagination [pagination] -->

<!-- Start File uploads [file-upload] -->
## File uploads

Certain SDK methods accept files as part of a multi-part request. It is possible and typically recommended to upload files as a stream rather than reading the entire contents into memory. This avoids excessive memory consumption and potentially crashing with out-of-memory errors when working with very large files. The following example demonstrates how to attach a file stream to a request.

> [!TIP]
>
> Depending on your JavaScript runtime, there are convenient utilities that return a handle to a file without reading the entire contents into memory:
>
> - **Node.js v20+:** Since v20, Node.js comes with a native `openAsBlob` function in [`node:fs`](https://nodejs.org/docs/latest-v20.x/api/fs.html#fsopenasblobpath-options).
> - **Bun:** The native [`Bun.file`](https://bun.sh/docs/api/file-io#reading-files-bun-file) function produces a file handle that can be used for streaming file uploads.
> - **Browsers:** All supported browsers return an instance to a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File) when reading the value from an `<input type="file">` element.
> - **Node.js v18:** A file stream can be created using the `fileFrom` helper from [`fetch-blob/from.js`](https://www.npmjs.com/package/fetch-blob).

```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.artifacts.upload({
    contentLength: 4036.54,
    xArtifactDuration: 400,
    xArtifactClientCi: "VERCEL",
    xArtifactClientInteractive: 0,
    xArtifactTag: "Tc0BmHvJYMIYJ62/zx87YqO0Flxk+5Ovip25NY825CQ=",
    hash: "12HKQaOmR5t5Uy6vdcQsNIiZgHGB",
  });

  // Handle the result
  console.log(result);
}

run();

```
<!-- End File uploads [file-upload] -->

<!-- Start Retries [retries] -->
## Retries

Some of the endpoints in this SDK support retries.  If you use the SDK without any configuration, it will fall back to the default retry strategy provided by the API.  However, the default retry strategy can be overridden on a per-operation basis, or across the entire SDK.

To change the default retry strategy for a single API call, simply provide a retryConfig object to the call:
```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel();

async function run() {
  const result = await vercel.listDeploymentBuilds({
    deploymentId: "<value>",
  }, {
    retries: {
      strategy: "backoff",
      backoff: {
        initialInterval: 1,
        maxInterval: 50,
        exponent: 1.1,
        maxElapsedTime: 100,
      },
      retryConnectionErrors: false,
    },
  });

  // Handle the result
  console.log(result);
}

run();

```

If you'd like to override the default retry strategy for all operations that support retries, you can provide a retryConfig at SDK initialization:
```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  retryConfig: {
    strategy: "backoff",
    backoff: {
      initialInterval: 1,
      maxInterval: 50,
      exponent: 1.1,
      maxElapsedTime: 100,
    },
    retryConnectionErrors: false,
  },
});

async function run() {
  const result = await vercel.listDeploymentBuilds({
    deploymentId: "<value>",
  });

  // Handle the result
  console.log(result);
}

run();

```
<!-- End Retries [retries] -->

<!-- Start Error Handling [errors] -->
## Error Handling

All SDK methods return a response object or throw an error. If Error objects are specified in your OpenAPI Spec, the SDK will throw the appropriate Error type.

| Error Object    | Status Code     | Content Type    |
| --------------- | --------------- | --------------- |
| errors.SDKError | 4xx-5xx         | */*             |

Validation errors can also occur when either method arguments or data returned from the server do not match the expected format. The `SDKValidationError` that is thrown as a result will capture the raw value that failed validation in an attribute called `rawValue`. Additionally, a `pretty()` method is available on this error that can be used to log a nicely formatted string since validation errors can list many issues and the plain error string may be difficult read when debugging. 


```typescript
import { Vercel } from "@vercel/sdk";
import { SDKValidationError } from "@vercel/sdk/models/errors/sdkvalidationerror.js";

const vercel = new Vercel();

async function run() {
  let result;
  try {
    result = await vercel.listDeploymentBuilds({
      deploymentId: "<value>",
    });

    // Handle the result
    console.log(result);
  } catch (err) {
    switch (true) {
      case (err instanceof SDKValidationError): {
        // Validation errors can be pretty-printed
        console.error(err.pretty());
        // Raw value may also be inspected
        console.error(err.rawValue);
        return;
      }
      default: {
        throw err;
      }
    }
  }
}

run();

```
<!-- End Error Handling [errors] -->

<!-- Start Server Selection [server] -->
## Server Selection

### Select Server by Index

You can override the default server globally by passing a server index to the `serverIdx` optional parameter when initializing the SDK client instance. The selected server will then be used as the default on the operations that use it. This table lists the indexes associated with the available servers:

| # | Server | Variables |
| - | ------ | --------- |
| 0 | `https://api.vercel.com` | None |

```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  serverIdx: 0,
});

async function run() {
  const result = await vercel.listDeploymentBuilds({
    deploymentId: "<value>",
  });

  // Handle the result
  console.log(result);
}

run();

```


### Override Server URL Per-Client

The default server can also be overridden globally by passing a URL to the `serverURL` optional parameter when initializing the SDK client instance. For example:

```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  serverURL: "https://api.vercel.com",
});

async function run() {
  const result = await vercel.listDeploymentBuilds({
    deploymentId: "<value>",
  });

  // Handle the result
  console.log(result);
}

run();

```
<!-- End Server Selection [server] -->

<!-- Start Custom HTTP Client [http-client] -->
## Custom HTTP Client

The TypeScript SDK makes API calls using an `HTTPClient` that wraps the native
[Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API). This
client is a thin wrapper around `fetch` and provides the ability to attach hooks
around the request lifecycle that can be used to modify the request or handle
errors and response.

The `HTTPClient` constructor takes an optional `fetcher` argument that can be
used to integrate a third-party HTTP client or when writing tests to mock out
the HTTP client and feed in fixtures.

The following example shows how to use the `"beforeRequest"` hook to to add a
custom header and a timeout to requests and how to use the `"requestError"` hook
to log errors:

```typescript
import { Vercel } from "@vercel/sdk";
import { HTTPClient } from "@vercel/sdk/lib/http";

const httpClient = new HTTPClient({
  // fetcher takes a function that has the same signature as native `fetch`.
  fetcher: (request) => {
    return fetch(request);
  }
});

httpClient.addHook("beforeRequest", (request) => {
  const nextRequest = new Request(request, {
    signal: request.signal || AbortSignal.timeout(5000)
  });

  nextRequest.headers.set("x-custom-header", "custom value");

  return nextRequest;
});

httpClient.addHook("requestError", (error, request) => {
  console.group("Request Error");
  console.log("Reason:", `${error}`);
  console.log("Endpoint:", `${request.method} ${request.url}`);
  console.groupEnd();
});

const sdk = new Vercel({ httpClient });
```
<!-- End Custom HTTP Client [http-client] -->

<!-- Start Debugging [debug] -->
## Debugging

You can setup your SDK to emit debug logs for SDK requests and responses.

You can pass a logger that matches `console`'s interface as an SDK option.

> [!WARNING]
> Beware that debug logging will reveal secrets, like API tokens in headers, in log messages printed to a console or files. It's recommended to use this feature only during local development and not in production.

```typescript
import { Vercel } from "@vercel/sdk";

const sdk = new Vercel({ debugLogger: console });
```
<!-- End Debugging [debug] -->

<!-- Placeholder for Future Speakeasy SDK Sections -->

# Development

## Maturity

This SDK is in beta, and there may be breaking changes between versions without a major version update. Therefore, we recommend pinning usage
to a specific package version. This way, you can install the same version each time without breaking changes unless you are intentionally
looking for the latest version.

## Contributions

While we value open-source contributions to this SDK, this library is generated programmatically. Any manual changes added to internal files will be overwritten on the next generation. 
We look forward to hearing your feedback. Feel free to open a PR or an issue with a proof of concept and we'll do our best to include it in a future release. 

### SDK Created by [Speakeasy](https://www.speakeasy.com/?utm_source=@vercel/sdk&utm_campaign=typescript)
