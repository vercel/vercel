workflow "Publish" {
  on = "push"
  resolves = ["3. yarn run publish-from-github"]
}

action "1. yarn install" {
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  runs = "yarn"
  args = "install"
}

action "2. yarn run build" {
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  needs = ["1. yarn install"]
  runs = "yarn"
  args = "run build"
}

action "3. yarn run publish-from-github" {
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  needs = ["2. yarn run build"]
  runs = "yarn"
  args = "run publish-from-github"
  secrets = ["NPM_TOKEN"]
}
