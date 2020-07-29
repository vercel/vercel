# Contributing to the Ionic Conference Application

Thank you for taking the time to contribute! :tada::+1:

The following is a set of guidelines for contributing to the conference app. These are just guidelines, not rules, use your best judgment and feel free to propose changes to this document in a pull request.

## Table of Contents

- [How To Contribute](#how-to-contribute)
- [Reporting Issues](#reporting-issues)
  - [Before Submitting an Issue](#before-submitting-an-issue)
  - [Determining the Repository](#determining-the-repository)
  - [Submitting the Issue](#submitting-the-issue)
- [Submitting a Pull Request](#submitting-a-pull-request)
  - [Guidelines for Submitting](#guidelines-for-submitting)
  - [Code Style](#code-style)

## How To Contribute

### Reporting Issues

Before submitting an issue, please go through [the list below](#before-submitting-an-issue) as you might find a solution to your issue.

#### Before Submitting an Issue

- Make sure you get the latest version of the code and run through the [Getting Started](https://github.com/ionic-team/ionic-conference-app#getting-started) steps to see if this resolves your issue.
- Check the [forum](https://forum.ionicframework.com) for similar questions and answers.
- Go through [all issues](https://github.com/ionic-team/ionic-conference-app/issues?utf8=%E2%9C%93&q=is%3Aissue) on this repository to see if the issue has already been created. It could have been closed with a resolution, so check closed issues, too.
- Chat with us in the [#ionic-v2](https://ionic-worldwide.slack.com/messages/ionic-v2/) channel on [Slack](http://ionicworldwide.herokuapp.com/) to see if we can find a solution to the problem!
- [Determine which repository](#determining-the-repository) the problem should be reported in.

#### Determining the Repository

There are several repositories being used for Ionic, which makes it difficult to determine which one to report an issue to. Don't worry if you aren't sure, we can always move it!

- The [Ionic repository](https://github.com/ionic-team/ionic) is a repository for all things related to the Ionic Framework. If you are able to reproduce the issue in any of the Ionic starters (or an existing project), you'll want to submit the issue [here](http://ionicframework.com/submit-issue/).
- The [Ionic CLI repository](https://github.com/ionic-team/ionic-cli) contains all of the code that allows you to run `ionic` commands from a terminal window. It is safe to put any issues [here](https://github.com/ionic-team/ionic-cli/issues) that relate to running an `ionic` command.
- [This repository](https://github.com/ionic-team/ionic-conference-app) is a demo of the Ionic Framework. If you find an issue with this app that does not occur on [a new app](http://ionicframework.com/docs/v2/getting-started/installation/), please submit the issue [here](https://github.com/ionic-team/ionic-conference-app/issues).

#### Submitting the Issue

- **Use a clear and descriptive title** for the issue to identify the problem. This makes it easier for others to find.
- **Describe the exact steps to reproduce the problem** with as many details as needed.
- **Provide your configuration** by running `ionic info` in a terminal from _within_ the project folder and pasting this information in the issue.

### Submitting a Pull Request

#### Guidelines for Submitting

When in doubt, keep your pull requests small. To give a PR the best chance of getting accepted, do not bundle more than one "feature" or bug fix per PR. Doing so makes it very hard to accept it if one of the fixes has issues.

It's always best to create two smaller PRs than one big one.

Talk to us before creating a PR that refactors the code or directory structure of the project. This project is constantly changing to reflect the latest version of Ionic Framework so sometimes it will be in the process of getting fixed.

#### Code Style

Make sure to follow the existing code style as much as possible.

- No underscores prefixing JS functions.
- Use flat Sass.
- **Don't** use [BEM conventions](https://css-tricks.com/bem-101/).
- Avoid nesting selectors. This is done to make it easier for users without Sass experience to understand and read.
