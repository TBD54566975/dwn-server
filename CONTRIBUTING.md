# Contribution Guide

First off, thank you for considering contributing to DWN-Server. It's people like you that make DWN-Server such a great tool.
Given that we're still in early stages of development, this contribution guide will certainly change as we near a release. Until then, things will be a bit ragtag but there's still plenty of opportunities for contribution.

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Issues](#issues)
  - [Working on the issue](#working-on-the-issue)
  - [Pull Requests](#pull-requests)
- [Development](#development)
  - [Running tests](#running-tests)
  - [Code Style](#code-style)
  - [Code Guidelines](#code-guidelines)
  - [Available NPM Commands](#available-npm-commands)

## Code of Conduct

We take our open-source community seriously. Please adhere to our [Code of Conduct](https://github.com/TBD54566975/dwn-server/blob/main/CODE_OF_CONDUCT.md).

## Getting Started

### Issues

- Feel free to open issues for any reason as long as you make it clear what the issue pertains to.
- Before opening new issues, please search to check if there is an existing issue.
- Existing issues with labels `bug`, `documentation`, `good first issue`, `help wanted` are excellent candidates for contribution and we'd be thrilled to get all the help we can get. You can take a look at all of the Issues that match the these labels [here](https://github.com/TBD54566975/dwn-server/issues?q=is%3Aopen+label%3A%22help+wanted%22%2C%22good+first+issue%22%2C%22documentation%22%2C%22bug%22+)
- If planning to work on non-trivial issue involving major/significant changes please check with us first on the implementation approach
  - Leave explanation of the approach and tag both @adam4leos and @finn-tbd in the issue
  - Good idea to also post link to the issue in our [dwn discord channel](https://discord.com/channels/937858703112155166/1068273971432280196) to initate discussion with more people

### Working on the issue

- Check to see if anyone is already working on the issue by looking to see if the issue has a `WIP` tag.
- Fork the repository
- Create a branch named the issue number you're taking on (usally branch from `main`)
- Push that branch and create a draft PR
- Paste a link to the draft PR in the issue you're tackling
- We'll add the `WIP` tag for you
- Work away. Feel free to ask any/all questions that crop up along the way

### Pull Requests

- When ready, switch the draft PR to "Ready for review".
- If you've added code that should be tested, add tests.
- Update the README.md with details of changes to the interface, if applicable.

## Development

### Tests

- Running the `npm run test` command from the root of the project will run all tests.
  - This is run via CI whenever a pull request is opened, or a commit is pushed to a branch that has an open PR.
- Make sure to cover added code with tests, if it should be tested

### Code Style

- Our preferred code style has been codified into `eslint` and `prettier`.
  - Feel free to take a look onto [eslint config](https://github.com/TBD54566975/dwn-server/blob/main/.eslintrc.cjs) and [prettier config](https://github.com/TBD54566975/dwn-server/blob/main/.prettierrc.json).
- Running `npm run lint:fix` and `npm run prettier:fix`will auto-format as much they can. Everything they weren't able to will be printed out as errors or warnings.
- We have a pre-commit hook which would run both commands with attempt to autofix problems
  - It runs by [husky](https://github.com/TBD54566975/dwn-server/blob/main/.husky/pre-commit) and executes [lint-staged command](https://github.com/TBD54566975/dwn-server/blob/main/package.json#L89)
- Make sure that no errors/warnings are introduced in your PR

### Code Guidelines

1. A `TODO` in comment must always link to a GitHub issue.

### Available NPM Commands

| Script                 | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `npm run build:esm`    | compiles typescript into ESM JS                                    |
| `npm run build:cjs`    | compiles typescript into CommonJS                                  |
| `npm run build`        | compiles typescript into ESM JS & CommonJS                         |
| `npm run clean`        | deletes compiled JS                                                |
| `npm run lint`         | runs linter                                                        |
| `npm run lint:fix`     | runs linter and fixes auto-fixable problems                        |
| `npm run prettier:fix` | runs prettier and fixes auto-fixable problems                      |
| `npm run test`         | runs tests                                                         |
| `npm run server`       | starts server                                                      |
| `npm run prepare`      | prepares husky for pre-commit hooks (auto-runs with `npm install`) |
