# `now dev` as `dev` script

#### Why This Error Occurred

The `package.json` file of the used project invokes `now dev` as `dev` script. This can lead to `now dev` recursively calling itself.

#### Possible Ways to Fix It

Change the `dev` script inside the `package.json` file. Usually framworks have their own way of entering the developing mode, e.g. `next` for Next.js or `gatsby develop` for Gatsby.
