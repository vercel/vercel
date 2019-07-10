workflow "Canary publish" {
  on = "push"
  resolves = ["3. Canary yarn run publish"]
}

action "0. Canary filter" {
  uses = "actions/bin/filter@3c0b4f0e63ea54ea5df2914b4fabf383368cd0da"
  args = "branch canary"
}

action "0. Canary PR not deleted" {
  uses = "actions/bin/filter@3c0b4f0e63ea54ea5df2914b4fabf383368cd0da"
  needs = ["0. Canary filter"]
  args = "not deleted"
}

action "1. Canary yarn install" {
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  needs = ["0. Canary PR not deleted"]
  runs = "yarn"
  args = "--pure-lockfile install"
}

action "2. Canary yarn run build" {
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  needs = ["1. Canary yarn install"]
  runs = "yarn"
  args = "--pure-lockfile run build"
}

action "3. Canary yarn run publish" {
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  needs = ["2. Canary yarn run build"]
  runs = "yarn"
  args = "--pure-lockfile run publish-from-github"
  secrets = ["NPM_TOKEN"]
}


workflow "Master publish" {
  on = "push"
  resolves = ["3. Master yarn run publish"]
}

action "0. Master filter" {
  uses = "actions/bin/filter@3c0b4f0e63ea54ea5df2914b4fabf383368cd0da"
  args = "branch master"
}

action "0. Master PR not deleted" {
  uses = "actions/bin/filter@3c0b4f0e63ea54ea5df2914b4fabf383368cd0da"
  needs = ["0. Master filter"]
  args = "not deleted"
}

action "1. Master yarn install" {
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  needs = ["0. Master PR not deleted"]
  runs = "yarn"
  args = "--pure-lockfile install"
}

action "2. Master yarn run build" {
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  needs = ["1. Master yarn install"]
  runs = "yarn"
  args = "--pure-lockfile run build"
}

action "3. Master yarn run publish" {
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  needs = ["2. Master yarn run build"]
  runs = "yarn"
  args = "--pure-lockfile run publish-from-github"
  secrets = ["NPM_TOKEN"]
}
