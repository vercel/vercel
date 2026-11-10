# Integrations

Marketplace integrations can provision a resource and inject its credentials into a project. Check existing installations and resources before provisioning a replacement for a service the user already has.

## Discovery and Provisioning

Use Marketplace category discovery for a category-shaped need such as storage or monitoring. Substring search can miss products described with different terminology; obtain current categories instead of maintaining a local product catalog.

Distinguish the integration installation from a product resource and from its project connection. Accepting legal terms installs an integration without creating a resource. A multi-product integration needs the intended product, and multiple installations need an unambiguous installation identity.

Provisioning can also connect the resource and pull environment variables locally. Review the target environments and local file effects before running it. Default connection coverage can include production, preview, and development; do not assume the current deployment environment is the only target.

A first-install terms flow can wait for browser completion and then resume. A non-provisionable integration instead hands completion to the browser. Read the result to distinguish those cases; do not terminate a waiting process or report an unfinished install as successful.

## Connections, Billing, and Removal

Disconnecting removes project environment variables but does not delete the provider resource. Deleting a resource is permanent and can affect all connected projects. Uninstalling the integration is a separate operation that may require removing its resources first; a request to disconnect one project does not authorize that cleanup.

Use [Storage](storage.md) for provider-neutral connection changes, credential modes, and change-set previews. Pull application credentials only into ignored files.

Installation updates can change billing or which projects have access without creating a resource. Prepayment balances and replenishment thresholds apply only to supported billing plans; absence of balance information is not evidence that a service is free. Confirm the intended spending and project-access scope before changing either.
