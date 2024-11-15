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
> This package is published as an ES Module (ESM) only. For applications using
> CommonJS, use `await import("@vercel/sdk")` to import and use this package.
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

| Name          | Type | Scheme      |
| ------------- | ---- | ----------- |
| `bearerToken` | http | HTTP Bearer |

To authenticate with the API the `bearerToken` parameter must be set when initializing the SDK client instance. For example:
```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.accessGroups.readAccessGroup({
    idOrName: "<value>",
  });

  // Handle the result
  console.log(result);
}

run();

```
<!-- End Authentication [security] -->

<!-- Start SDK Example Usage [usage] -->
## SDK Example Usage

### List deployments

List deployments under the authenticated user or team.

```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.deployments.getDeployments({
    app: "docs",
    from: 1612948664566,
    limit: 10,
    projectId: "QmXGTs7mvAMMC7WW5ebrM33qKG32QK3h4vmQMjmY",
    target: "production",
    to: 1612948664566,
    users: "kr1PsOIzqEL5Xg6M4VZcZosf,K4amb7K9dAt5R2vBJWF32bmY",
    since: 1540095775941,
    until: 1540095775951,
    state: "BUILDING,READY",
  });

  // Handle the result
  console.log(result);
}

run();

```

### Update an existing project

Update the fields of a project using either its name or id.

```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.projects.updateProject({
    idOrName: "prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB",
    requestBody: {
      name: "a-project-name",
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

* [readAccessGroup](docs/sdks/accessgroups/README.md#readaccessgroup) - Reads an access group
* [updateAccessGroup](docs/sdks/accessgroups/README.md#updateaccessgroup) - Update an access group
* [deleteAccessGroup](docs/sdks/accessgroups/README.md#deleteaccessgroup) - Deletes an access group
* [listAccessGroupMembers](docs/sdks/accessgroups/README.md#listaccessgroupmembers) - List members of an access group
* [listAccessGroups](docs/sdks/accessgroups/README.md#listaccessgroups) - List access groups for a team, project or member
* [createAccessGroup](docs/sdks/accessgroups/README.md#createaccessgroup) - Creates an access group
* [listAccessGroupProjects](docs/sdks/accessgroups/README.md#listaccessgroupprojects) - List projects of an access group

### [aliases](docs/sdks/aliases/README.md)

* [listAliases](docs/sdks/aliases/README.md#listaliases) - List aliases
* [getAlias](docs/sdks/aliases/README.md#getalias) - Get an Alias
* [deleteAlias](docs/sdks/aliases/README.md#deletealias) - Delete an Alias
* [listDeploymentAliases](docs/sdks/aliases/README.md#listdeploymentaliases) - List Deployment Aliases
* [assignAlias](docs/sdks/aliases/README.md#assignalias) - Assign an Alias

### [artifacts](docs/sdks/artifacts/README.md)

* [recordEvents](docs/sdks/artifacts/README.md#recordevents) - Record an artifacts cache usage event
* [status](docs/sdks/artifacts/README.md#status) - Get status of Remote Caching for this principal
* [uploadArtifact](docs/sdks/artifacts/README.md#uploadartifact) - Upload a cache artifact
* [downloadArtifact](docs/sdks/artifacts/README.md#downloadartifact) - Download a cache artifact
* [artifactExists](docs/sdks/artifacts/README.md#artifactexists) - Check if a cache artifact exists
* [artifactQuery](docs/sdks/artifacts/README.md#artifactquery) - Query information about an artifact

### [authentication](docs/sdks/authentication/README.md)

* [listAuthTokens](docs/sdks/authentication/README.md#listauthtokens) - List Auth Tokens
* [createAuthToken](docs/sdks/authentication/README.md#createauthtoken) - Create an Auth Token
* [getAuthToken](docs/sdks/authentication/README.md#getauthtoken) - Get Auth Token Metadata
* [deleteAuthToken](docs/sdks/authentication/README.md#deleteauthtoken) - Delete an authentication token

### [certs](docs/sdks/certs/README.md)

* [getCertById](docs/sdks/certs/README.md#getcertbyid) - Get cert by id
* [removeCert](docs/sdks/certs/README.md#removecert) - Remove cert
* [issueCert](docs/sdks/certs/README.md#issuecert) - Issue a new cert
* [uploadCert](docs/sdks/certs/README.md#uploadcert) - Upload a cert

### [checks](docs/sdks/checks/README.md)

* [createCheck](docs/sdks/checks/README.md#createcheck) - Creates a new Check
* [getAllChecks](docs/sdks/checks/README.md#getallchecks) - Retrieve a list of all checks
* [getCheck](docs/sdks/checks/README.md#getcheck) - Get a single check
* [updateCheck](docs/sdks/checks/README.md#updatecheck) - Update a check
* [rerequestCheck](docs/sdks/checks/README.md#rerequestcheck) - Rerequest a check

### [deployments](docs/sdks/deployments/README.md)

* [getDeploymentEvents](docs/sdks/deployments/README.md#getdeploymentevents) - Get deployment events
* [getDeployment](docs/sdks/deployments/README.md#getdeployment) - Get a deployment by ID or URL
* [createDeployment](docs/sdks/deployments/README.md#createdeployment) - Create a new deployment
* [cancelDeployment](docs/sdks/deployments/README.md#canceldeployment) - Cancel a deployment
* [uploadFile](docs/sdks/deployments/README.md#uploadfile) - Upload Deployment Files
* [listDeploymentFiles](docs/sdks/deployments/README.md#listdeploymentfiles) - List Deployment Files
* [getDeploymentFileContents](docs/sdks/deployments/README.md#getdeploymentfilecontents) - Get Deployment File Contents
* [getDeployments](docs/sdks/deployments/README.md#getdeployments) - List deployments
* [deleteDeployment](docs/sdks/deployments/README.md#deletedeployment) - Delete a Deployment

### [dns](docs/sdks/dns/README.md)

* [getRecords](docs/sdks/dns/README.md#getrecords) - List existing DNS records
* [createRecord](docs/sdks/dns/README.md#createrecord) - Create a DNS record
* [updateRecord](docs/sdks/dns/README.md#updaterecord) - Update an existing DNS record
* [removeRecord](docs/sdks/dns/README.md#removerecord) - Delete a DNS record

### [domains](docs/sdks/domains/README.md)

* [buyDomain](docs/sdks/domains/README.md#buydomain) - Purchase a domain
* [checkDomainPrice](docs/sdks/domains/README.md#checkdomainprice) - Check the price for a domain
* [checkDomainStatus](docs/sdks/domains/README.md#checkdomainstatus) - Check a Domain Availability
* [getDomainTransfer](docs/sdks/domains/README.md#getdomaintransfer) - Get domain transfer info.
* [getDomainConfig](docs/sdks/domains/README.md#getdomainconfig) - Get a Domain's configuration
* [getDomain](docs/sdks/domains/README.md#getdomain) - Get Information for a Single Domain
* [getDomains](docs/sdks/domains/README.md#getdomains) - List all the domains
* [createOrTransferDomain](docs/sdks/domains/README.md#createortransferdomain) - Register or transfer-in a new Domain
* [patchDomain](docs/sdks/domains/README.md#patchdomain) - Update or move apex domain
* [deleteDomain](docs/sdks/domains/README.md#deletedomain) - Remove a domain by name

### [edgeConfig](docs/sdks/edgeconfig/README.md)

* [getEdgeConfigs](docs/sdks/edgeconfig/README.md#getedgeconfigs) - Get Edge Configs
* [createEdgeConfig](docs/sdks/edgeconfig/README.md#createedgeconfig) - Create an Edge Config
* [getEdgeConfig](docs/sdks/edgeconfig/README.md#getedgeconfig) - Get an Edge Config
* [updateEdgeConfig](docs/sdks/edgeconfig/README.md#updateedgeconfig) - Update an Edge Config
* [deleteEdgeConfig](docs/sdks/edgeconfig/README.md#deleteedgeconfig) - Delete an Edge Config
* [getEdgeConfigItems](docs/sdks/edgeconfig/README.md#getedgeconfigitems) - Get Edge Config items
* [getEdgeConfigSchema](docs/sdks/edgeconfig/README.md#getedgeconfigschema) - Get Edge Config schema
* [patchEdgeConfigSchema](docs/sdks/edgeconfig/README.md#patchedgeconfigschema) - Update Edge Config schema
* [deleteEdgeConfigSchema](docs/sdks/edgeconfig/README.md#deleteedgeconfigschema) - Delete an Edge Config's schema
* [getEdgeConfigItem](docs/sdks/edgeconfig/README.md#getedgeconfigitem) - Get an Edge Config item
* [getEdgeConfigTokens](docs/sdks/edgeconfig/README.md#getedgeconfigtokens) - Get all tokens of an Edge Config
* [deleteEdgeConfigTokens](docs/sdks/edgeconfig/README.md#deleteedgeconfigtokens) - Delete one or more Edge Config tokens
* [getEdgeConfigToken](docs/sdks/edgeconfig/README.md#getedgeconfigtoken) - Get Edge Config token meta data
* [createEdgeConfigToken](docs/sdks/edgeconfig/README.md#createedgeconfigtoken) - Create an Edge Config token
* [getEdgeConfigBackup](docs/sdks/edgeconfig/README.md#getedgeconfigbackup) - Get Edge Config backup
* [getEdgeConfigBackups](docs/sdks/edgeconfig/README.md#getedgeconfigbackups) - Get Edge Config backups

### [integrations](docs/sdks/integrations/README.md)

* [getConfigurations](docs/sdks/integrations/README.md#getconfigurations) - Get configurations for the authenticated user or team
* [getConfiguration](docs/sdks/integrations/README.md#getconfiguration) - Retrieve an integration configuration
* [deleteConfiguration](docs/sdks/integrations/README.md#deleteconfiguration) - Delete an integration configuration
* [gitNamespaces](docs/sdks/integrations/README.md#gitnamespaces) - List git namespaces by provider
* [searchRepo](docs/sdks/integrations/README.md#searchrepo) - List git repositories linked to namespace by provider

### [logDrains](docs/sdks/logdrains/README.md)

* [getIntegrationLogDrains](docs/sdks/logdrains/README.md#getintegrationlogdrains) - Retrieves a list of Integration log drains
* [createLogDrain](docs/sdks/logdrains/README.md#createlogdrain) - Creates a new Integration Log Drain
* [deleteIntegrationLogDrain](docs/sdks/logdrains/README.md#deleteintegrationlogdrain) - Deletes the Integration log drain with the provided `id`
* [getConfigurableLogDrain](docs/sdks/logdrains/README.md#getconfigurablelogdrain) - Retrieves a Configurable Log Drain
* [deleteConfigurableLogDrain](docs/sdks/logdrains/README.md#deleteconfigurablelogdrain) - Deletes a Configurable Log Drain
* [getAllLogDrains](docs/sdks/logdrains/README.md#getalllogdrains) - Retrieves a list of all the Log Drains
* [createConfigurableLogDrain](docs/sdks/logdrains/README.md#createconfigurablelogdrain) - Creates a Configurable Log Drain

### [projectMembers](docs/sdks/projectmembers/README.md)

* [getProjectMembers](docs/sdks/projectmembers/README.md#getprojectmembers) - List project members
* [addProjectMember](docs/sdks/projectmembers/README.md#addprojectmember) - Adds a new member to a project.
* [removeProjectMember](docs/sdks/projectmembers/README.md#removeprojectmember) - Remove a Project Member

### [projects](docs/sdks/projects/README.md)

* [updateProjectDataCache](docs/sdks/projects/README.md#updateprojectdatacache) - Update the data cache feature
* [getProjects](docs/sdks/projects/README.md#getprojects) - Retrieve a list of projects
* [createProject](docs/sdks/projects/README.md#createproject) - Create a new project
* [updateProject](docs/sdks/projects/README.md#updateproject) - Update an existing project
* [deleteProject](docs/sdks/projects/README.md#deleteproject) - Delete a Project
* [getProjectDomain](docs/sdks/projects/README.md#getprojectdomain) - Get a project domain
* [updateProjectDomain](docs/sdks/projects/README.md#updateprojectdomain) - Update a project domain
* [removeProjectDomain](docs/sdks/projects/README.md#removeprojectdomain) - Remove a domain from a project
* [addProjectDomain](docs/sdks/projects/README.md#addprojectdomain) - Add a domain to a project
* [verifyProjectDomain](docs/sdks/projects/README.md#verifyprojectdomain) - Verify project domain
* [filterProjectEnvs](docs/sdks/projects/README.md#filterprojectenvs) - Retrieve the environment variables of a project by id or name
* [getProjectEnv](docs/sdks/projects/README.md#getprojectenv) - Retrieve the decrypted value of an environment variable of a project by id
* [createProjectEnv](docs/sdks/projects/README.md#createprojectenv) - Create one or more environment variables
* [removeProjectEnv](docs/sdks/projects/README.md#removeprojectenv) - Remove an environment variable
* [editProjectEnv](docs/sdks/projects/README.md#editprojectenv) - Edit an environment variable
* [updateProjectProtectionBypass](docs/sdks/projects/README.md#updateprojectprotectionbypass) - Update Protection Bypass for Automation
* [requestPromote](docs/sdks/projects/README.md#requestpromote) - Points all production domains for a project to the given deploy
* [listPromoteAliases](docs/sdks/projects/README.md#listpromotealiases) - Gets a list of aliases with status for the current promote
* [pauseProject](docs/sdks/projects/README.md#pauseproject) - Pause a project
* [unpauseProject](docs/sdks/projects/README.md#unpauseproject) - Unpause a project

### [security](docs/sdks/security/README.md)

* [updateAttackChallengeMode](docs/sdks/security/README.md#updateattackchallengemode) - Update Attack Challenge mode
* [putFirewallConfig](docs/sdks/security/README.md#putfirewallconfig) - Put Firewall Configuration
* [updateFirewallConfig](docs/sdks/security/README.md#updatefirewallconfig) - Update Firewall Configuration
* [getFirewallConfig](docs/sdks/security/README.md#getfirewallconfig) - Read Firewall Configuration

### [teams](docs/sdks/teams/README.md)

* [getTeamMembers](docs/sdks/teams/README.md#getteammembers) - List team members
* [inviteUserToTeam](docs/sdks/teams/README.md#inviteusertoteam) - Invite a user
* [requestAccessToTeam](docs/sdks/teams/README.md#requestaccesstoteam) - Request access to a team
* [getTeamAccessRequest](docs/sdks/teams/README.md#getteamaccessrequest) - Get access request status
* [joinTeam](docs/sdks/teams/README.md#jointeam) - Join a team
* [updateTeamMember](docs/sdks/teams/README.md#updateteammember) - Update a Team Member
* [removeTeamMember](docs/sdks/teams/README.md#removeteammember) - Remove a Team Member
* [getTeam](docs/sdks/teams/README.md#getteam) - Get a Team
* [patchTeam](docs/sdks/teams/README.md#patchteam) - Update a Team
* [getTeams](docs/sdks/teams/README.md#getteams) - List all teams
* [createTeam](docs/sdks/teams/README.md#createteam) - Create a Team
* [deleteTeam](docs/sdks/teams/README.md#deleteteam) - Delete a Team
* [deleteTeamInviteCode](docs/sdks/teams/README.md#deleteteaminvitecode) - Delete a Team invite code

### [user](docs/sdks/user/README.md)

* [listUserEvents](docs/sdks/user/README.md#listuserevents) - List User Events
* [getAuthUser](docs/sdks/user/README.md#getauthuser) - Get the User
* [requestDelete](docs/sdks/user/README.md#requestdelete) - Delete User Account


### [webhooks](docs/sdks/webhooks/README.md)

* [createWebhook](docs/sdks/webhooks/README.md#createwebhook) - Creates a webhook
* [getWebhooks](docs/sdks/webhooks/README.md#getwebhooks) - Get a list of webhooks
* [getWebhook](docs/sdks/webhooks/README.md#getwebhook) - Get a webhook
* [deleteWebhook](docs/sdks/webhooks/README.md#deletewebhook) - Deletes a webhook

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

- [`accessGroupsCreateAccessGroup`](docs/sdks/accessgroups/README.md#createaccessgroup) - Creates an access group
- [`accessGroupsDeleteAccessGroup`](docs/sdks/accessgroups/README.md#deleteaccessgroup) - Deletes an access group
- [`accessGroupsListAccessGroupMembers`](docs/sdks/accessgroups/README.md#listaccessgroupmembers) - List members of an access group
- [`accessGroupsListAccessGroupProjects`](docs/sdks/accessgroups/README.md#listaccessgroupprojects) - List projects of an access group
- [`accessGroupsListAccessGroups`](docs/sdks/accessgroups/README.md#listaccessgroups) - List access groups for a team, project or member
- [`accessGroupsReadAccessGroup`](docs/sdks/accessgroups/README.md#readaccessgroup) - Reads an access group
- [`accessGroupsUpdateAccessGroup`](docs/sdks/accessgroups/README.md#updateaccessgroup) - Update an access group
- [`aliasesAssignAlias`](docs/sdks/aliases/README.md#assignalias) - Assign an Alias
- [`aliasesDeleteAlias`](docs/sdks/aliases/README.md#deletealias) - Delete an Alias
- [`aliasesGetAlias`](docs/sdks/aliases/README.md#getalias) - Get an Alias
- [`aliasesListAliases`](docs/sdks/aliases/README.md#listaliases) - List aliases
- [`aliasesListDeploymentAliases`](docs/sdks/aliases/README.md#listdeploymentaliases) - List Deployment Aliases
- [`artifactsArtifactExists`](docs/sdks/artifacts/README.md#artifactexists) - Check if a cache artifact exists
- [`artifactsArtifactQuery`](docs/sdks/artifacts/README.md#artifactquery) - Query information about an artifact
- [`artifactsDownloadArtifact`](docs/sdks/artifacts/README.md#downloadartifact) - Download a cache artifact
- [`artifactsRecordEvents`](docs/sdks/artifacts/README.md#recordevents) - Record an artifacts cache usage event
- [`artifactsStatus`](docs/sdks/artifacts/README.md#status) - Get status of Remote Caching for this principal
- [`artifactsUploadArtifact`](docs/sdks/artifacts/README.md#uploadartifact) - Upload a cache artifact
- [`authenticationCreateAuthToken`](docs/sdks/authentication/README.md#createauthtoken) - Create an Auth Token
- [`authenticationDeleteAuthToken`](docs/sdks/authentication/README.md#deleteauthtoken) - Delete an authentication token
- [`authenticationGetAuthToken`](docs/sdks/authentication/README.md#getauthtoken) - Get Auth Token Metadata
- [`authenticationListAuthTokens`](docs/sdks/authentication/README.md#listauthtokens) - List Auth Tokens
- [`certsGetCertById`](docs/sdks/certs/README.md#getcertbyid) - Get cert by id
- [`certsIssueCert`](docs/sdks/certs/README.md#issuecert) - Issue a new cert
- [`certsRemoveCert`](docs/sdks/certs/README.md#removecert) - Remove cert
- [`certsUploadCert`](docs/sdks/certs/README.md#uploadcert) - Upload a cert
- [`checksCreateCheck`](docs/sdks/checks/README.md#createcheck) - Creates a new Check
- [`checksGetAllChecks`](docs/sdks/checks/README.md#getallchecks) - Retrieve a list of all checks
- [`checksGetCheck`](docs/sdks/checks/README.md#getcheck) - Get a single check
- [`checksRerequestCheck`](docs/sdks/checks/README.md#rerequestcheck) - Rerequest a check
- [`checksUpdateCheck`](docs/sdks/checks/README.md#updatecheck) - Update a check
- [`deploymentsCancelDeployment`](docs/sdks/deployments/README.md#canceldeployment) - Cancel a deployment
- [`deploymentsCreateDeployment`](docs/sdks/deployments/README.md#createdeployment) - Create a new deployment
- [`deploymentsDeleteDeployment`](docs/sdks/deployments/README.md#deletedeployment) - Delete a Deployment
- [`deploymentsGetDeployment`](docs/sdks/deployments/README.md#getdeployment) - Get a deployment by ID or URL
- [`deploymentsGetDeploymentEvents`](docs/sdks/deployments/README.md#getdeploymentevents) - Get deployment events
- [`deploymentsGetDeploymentFileContents`](docs/sdks/deployments/README.md#getdeploymentfilecontents) - Get Deployment File Contents
- [`deploymentsGetDeployments`](docs/sdks/deployments/README.md#getdeployments) - List deployments
- [`deploymentsListDeploymentFiles`](docs/sdks/deployments/README.md#listdeploymentfiles) - List Deployment Files
- [`deploymentsUploadFile`](docs/sdks/deployments/README.md#uploadfile) - Upload Deployment Files
- [`dnsCreateRecord`](docs/sdks/dns/README.md#createrecord) - Create a DNS record
- [`dnsGetRecords`](docs/sdks/dns/README.md#getrecords) - List existing DNS records
- [`dnsRemoveRecord`](docs/sdks/dns/README.md#removerecord) - Delete a DNS record
- [`dnsUpdateRecord`](docs/sdks/dns/README.md#updaterecord) - Update an existing DNS record
- [`domainsBuyDomain`](docs/sdks/domains/README.md#buydomain) - Purchase a domain
- [`domainsCheckDomainPrice`](docs/sdks/domains/README.md#checkdomainprice) - Check the price for a domain
- [`domainsCheckDomainStatus`](docs/sdks/domains/README.md#checkdomainstatus) - Check a Domain Availability
- [`domainsCreateOrTransferDomain`](docs/sdks/domains/README.md#createortransferdomain) - Register or transfer-in a new Domain
- [`domainsDeleteDomain`](docs/sdks/domains/README.md#deletedomain) - Remove a domain by name
- [`domainsGetDomain`](docs/sdks/domains/README.md#getdomain) - Get Information for a Single Domain
- [`domainsGetDomainConfig`](docs/sdks/domains/README.md#getdomainconfig) - Get a Domain's configuration
- [`domainsGetDomains`](docs/sdks/domains/README.md#getdomains) - List all the domains
- [`domainsGetDomainTransfer`](docs/sdks/domains/README.md#getdomaintransfer) - Get domain transfer info.
- [`domainsPatchDomain`](docs/sdks/domains/README.md#patchdomain) - Update or move apex domain
- [`edgeConfigCreateEdgeConfig`](docs/sdks/edgeconfig/README.md#createedgeconfig) - Create an Edge Config
- [`edgeConfigCreateEdgeConfigToken`](docs/sdks/edgeconfig/README.md#createedgeconfigtoken) - Create an Edge Config token
- [`edgeConfigDeleteEdgeConfig`](docs/sdks/edgeconfig/README.md#deleteedgeconfig) - Delete an Edge Config
- [`edgeConfigDeleteEdgeConfigSchema`](docs/sdks/edgeconfig/README.md#deleteedgeconfigschema) - Delete an Edge Config's schema
- [`edgeConfigDeleteEdgeConfigTokens`](docs/sdks/edgeconfig/README.md#deleteedgeconfigtokens) - Delete one or more Edge Config tokens
- [`edgeConfigGetEdgeConfig`](docs/sdks/edgeconfig/README.md#getedgeconfig) - Get an Edge Config
- [`edgeConfigGetEdgeConfigBackup`](docs/sdks/edgeconfig/README.md#getedgeconfigbackup) - Get Edge Config backup
- [`edgeConfigGetEdgeConfigBackups`](docs/sdks/edgeconfig/README.md#getedgeconfigbackups) - Get Edge Config backups
- [`edgeConfigGetEdgeConfigItem`](docs/sdks/edgeconfig/README.md#getedgeconfigitem) - Get an Edge Config item
- [`edgeConfigGetEdgeConfigItems`](docs/sdks/edgeconfig/README.md#getedgeconfigitems) - Get Edge Config items
- [`edgeConfigGetEdgeConfigs`](docs/sdks/edgeconfig/README.md#getedgeconfigs) - Get Edge Configs
- [`edgeConfigGetEdgeConfigSchema`](docs/sdks/edgeconfig/README.md#getedgeconfigschema) - Get Edge Config schema
- [`edgeConfigGetEdgeConfigToken`](docs/sdks/edgeconfig/README.md#getedgeconfigtoken) - Get Edge Config token meta data
- [`edgeConfigGetEdgeConfigTokens`](docs/sdks/edgeconfig/README.md#getedgeconfigtokens) - Get all tokens of an Edge Config
- [`edgeConfigPatchEdgeConfigSchema`](docs/sdks/edgeconfig/README.md#patchedgeconfigschema) - Update Edge Config schema
- [`edgeConfigUpdateEdgeConfig`](docs/sdks/edgeconfig/README.md#updateedgeconfig) - Update an Edge Config
- [`integrationsDeleteConfiguration`](docs/sdks/integrations/README.md#deleteconfiguration) - Delete an integration configuration
- [`integrationsGetConfiguration`](docs/sdks/integrations/README.md#getconfiguration) - Retrieve an integration configuration
- [`integrationsGetConfigurations`](docs/sdks/integrations/README.md#getconfigurations) - Get configurations for the authenticated user or team
- [`integrationsGitNamespaces`](docs/sdks/integrations/README.md#gitnamespaces) - List git namespaces by provider
- [`integrationsSearchRepo`](docs/sdks/integrations/README.md#searchrepo) - List git repositories linked to namespace by provider
- [`logDrainsCreateConfigurableLogDrain`](docs/sdks/logdrains/README.md#createconfigurablelogdrain) - Creates a Configurable Log Drain
- [`logDrainsCreateLogDrain`](docs/sdks/logdrains/README.md#createlogdrain) - Creates a new Integration Log Drain
- [`logDrainsDeleteConfigurableLogDrain`](docs/sdks/logdrains/README.md#deleteconfigurablelogdrain) - Deletes a Configurable Log Drain
- [`logDrainsDeleteIntegrationLogDrain`](docs/sdks/logdrains/README.md#deleteintegrationlogdrain) - Deletes the Integration log drain with the provided `id`
- [`logDrainsGetAllLogDrains`](docs/sdks/logdrains/README.md#getalllogdrains) - Retrieves a list of all the Log Drains
- [`logDrainsGetConfigurableLogDrain`](docs/sdks/logdrains/README.md#getconfigurablelogdrain) - Retrieves a Configurable Log Drain
- [`logDrainsGetIntegrationLogDrains`](docs/sdks/logdrains/README.md#getintegrationlogdrains) - Retrieves a list of Integration log drains
- [`projectMembersAddProjectMember`](docs/sdks/projectmembers/README.md#addprojectmember) - Adds a new member to a project.
- [`projectMembersGetProjectMembers`](docs/sdks/projectmembers/README.md#getprojectmembers) - List project members
- [`projectMembersRemoveProjectMember`](docs/sdks/projectmembers/README.md#removeprojectmember) - Remove a Project Member
- [`projectsAddProjectDomain`](docs/sdks/projects/README.md#addprojectdomain) - Add a domain to a project
- [`projectsCreateProject`](docs/sdks/projects/README.md#createproject) - Create a new project
- [`projectsCreateProjectEnv`](docs/sdks/projects/README.md#createprojectenv) - Create one or more environment variables
- [`projectsDeleteProject`](docs/sdks/projects/README.md#deleteproject) - Delete a Project
- [`projectsEditProjectEnv`](docs/sdks/projects/README.md#editprojectenv) - Edit an environment variable
- [`projectsFilterProjectEnvs`](docs/sdks/projects/README.md#filterprojectenvs) - Retrieve the environment variables of a project by id or name
- [`projectsGetProjectDomain`](docs/sdks/projects/README.md#getprojectdomain) - Get a project domain
- [`projectsGetProjectEnv`](docs/sdks/projects/README.md#getprojectenv) - Retrieve the decrypted value of an environment variable of a project by id
- [`projectsGetProjects`](docs/sdks/projects/README.md#getprojects) - Retrieve a list of projects
- [`projectsListPromoteAliases`](docs/sdks/projects/README.md#listpromotealiases) - Gets a list of aliases with status for the current promote
- [`projectsPauseProject`](docs/sdks/projects/README.md#pauseproject) - Pause a project
- [`projectsRemoveProjectDomain`](docs/sdks/projects/README.md#removeprojectdomain) - Remove a domain from a project
- [`projectsRemoveProjectEnv`](docs/sdks/projects/README.md#removeprojectenv) - Remove an environment variable
- [`projectsRequestPromote`](docs/sdks/projects/README.md#requestpromote) - Points all production domains for a project to the given deploy
- [`projectsUnpauseProject`](docs/sdks/projects/README.md#unpauseproject) - Unpause a project
- [`projectsUpdateProject`](docs/sdks/projects/README.md#updateproject) - Update an existing project
- [`projectsUpdateProjectDataCache`](docs/sdks/projects/README.md#updateprojectdatacache) - Update the data cache feature
- [`projectsUpdateProjectDomain`](docs/sdks/projects/README.md#updateprojectdomain) - Update a project domain
- [`projectsUpdateProjectProtectionBypass`](docs/sdks/projects/README.md#updateprojectprotectionbypass) - Update Protection Bypass for Automation
- [`projectsVerifyProjectDomain`](docs/sdks/projects/README.md#verifyprojectdomain) - Verify project domain
- [`securityGetFirewallConfig`](docs/sdks/security/README.md#getfirewallconfig) - Read Firewall Configuration
- [`securityPutFirewallConfig`](docs/sdks/security/README.md#putfirewallconfig) - Put Firewall Configuration
- [`securityUpdateAttackChallengeMode`](docs/sdks/security/README.md#updateattackchallengemode) - Update Attack Challenge mode
- [`securityUpdateFirewallConfig`](docs/sdks/security/README.md#updatefirewallconfig) - Update Firewall Configuration
- [`teamsCreateTeam`](docs/sdks/teams/README.md#createteam) - Create a Team
- [`teamsDeleteTeam`](docs/sdks/teams/README.md#deleteteam) - Delete a Team
- [`teamsDeleteTeamInviteCode`](docs/sdks/teams/README.md#deleteteaminvitecode) - Delete a Team invite code
- [`teamsGetTeam`](docs/sdks/teams/README.md#getteam) - Get a Team
- [`teamsGetTeamAccessRequest`](docs/sdks/teams/README.md#getteamaccessrequest) - Get access request status
- [`teamsGetTeamMembers`](docs/sdks/teams/README.md#getteammembers) - List team members
- [`teamsGetTeams`](docs/sdks/teams/README.md#getteams) - List all teams
- [`teamsInviteUserToTeam`](docs/sdks/teams/README.md#inviteusertoteam) - Invite a user
- [`teamsJoinTeam`](docs/sdks/teams/README.md#jointeam) - Join a team
- [`teamsPatchTeam`](docs/sdks/teams/README.md#patchteam) - Update a Team
- [`teamsRemoveTeamMember`](docs/sdks/teams/README.md#removeteammember) - Remove a Team Member
- [`teamsRequestAccessToTeam`](docs/sdks/teams/README.md#requestaccesstoteam) - Request access to a team
- [`teamsUpdateTeamMember`](docs/sdks/teams/README.md#updateteammember) - Update a Team Member
- [`userGetAuthUser`](docs/sdks/user/README.md#getauthuser) - Get the User
- [`userListUserEvents`](docs/sdks/user/README.md#listuserevents) - List User Events
- [`userRequestDelete`](docs/sdks/user/README.md#requestdelete) - Delete User Account
- [`webhooksCreateWebhook`](docs/sdks/webhooks/README.md#createwebhook) - Creates a webhook
- [`webhooksDeleteWebhook`](docs/sdks/webhooks/README.md#deletewebhook) - Deletes a webhook
- [`webhooksGetWebhook`](docs/sdks/webhooks/README.md#getwebhook) - Get a webhook
- [`webhooksGetWebhooks`](docs/sdks/webhooks/README.md#getwebhooks) - Get a list of webhooks

</details>
<!-- End Standalone functions [standalone-funcs] -->

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
  const result = await vercel.artifacts.uploadArtifact({
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

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.accessGroups.readAccessGroup({
    idOrName: "<value>",
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
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.accessGroups.readAccessGroup({
    idOrName: "<value>",
  });

  // Handle the result
  console.log(result);
}

run();

```
<!-- End Retries [retries] -->

<!-- Start Error Handling [errors] -->
## Error Handling

All SDK methods return a response object or throw an error. By default, an API error will throw a `errors.SDKError`.

If a HTTP request fails, an operation my also throw an error from the `models/errors/httpclienterrors.ts` module:

| HTTP Client Error                                    | Description                                          |
| ---------------------------------------------------- | ---------------------------------------------------- |
| RequestAbortedError                                  | HTTP request was aborted by the client               |
| RequestTimeoutError                                  | HTTP request timed out due to an AbortSignal signal  |
| ConnectionError                                      | HTTP client was unable to make a request to a server |
| InvalidRequestError                                  | Any input used to create a request is invalid        |
| UnexpectedClientError                                | Unrecognised or unexpected error                     |

In addition, when custom error responses are specified for an operation, the SDK may throw their associated Error type. You can refer to respective *Errors* tables in SDK docs for more details on possible error types for each operation. For example, the `readAccessGroup` method may throw the following errors:

| Error Type      | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4XX, 5XX    | \*/\*        |

```typescript
import { Vercel } from "@vercel/sdk";
import { SDKValidationError } from "@vercel/sdk/models/errors/sdkvalidationerror.js";

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  let result;
  try {
    result = await vercel.accessGroups.readAccessGroup({
      idOrName: "<value>",
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

Validation errors can also occur when either method arguments or data returned from the server do not match the expected format. The `SDKValidationError` that is thrown as a result will capture the raw value that failed validation in an attribute called `rawValue`. Additionally, a `pretty()` method is available on this error that can be used to log a nicely formatted string since validation errors can list many issues and the plain error string may be difficult read when debugging.
<!-- End Error Handling [errors] -->

<!-- Start Server Selection [server] -->
## Server Selection

### Override Server URL Per-Client

The default server can also be overridden globally by passing a URL to the `serverURL: string` optional parameter when initializing the SDK client instance. For example:
```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  serverURL: "https://api.vercel.com",
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.accessGroups.readAccessGroup({
    idOrName: "<value>",
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
