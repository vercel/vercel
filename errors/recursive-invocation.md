# Recursive Invocation of Commands

#### Why This Error Occurred

You have configured one of the following for your Project:

- The [Build Command](/docs/concepts/deployments/build-step#build-command) defined in the Project Settings invokes `vercel build`.
- The [Development Command](/docs/concepts/deployments/build-step#development-command) defined in the Project Settings invokes `vercel dev`.

Because the Build Command is invoked by `vercel build` when deploying, it cannot invoke `vercel build` itself, as that would cause an infinite recursion.

The same applies to the Development Command: When developing locally, `vercel dev` invokes the Development Command, so it cannot invoke `vercel dev` itself.

#### Possible Ways to Fix It

Adjust the Build and Development Commands defined for your Project to not invoke `vercel build` or `vercel dev`.

Instead, they should invoke the Build Command provided by your framework.

If you are unsure about which value to provide, disable the "Override" option in order to default to the preferred settings for the [Framework Preset](/docs/concepts/deployments/build-step#framework-preset) you have selected.
