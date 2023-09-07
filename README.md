# BuGroup-Checks

This GitHub Action aggregates several other checks to present a single unified status check on pull requests. It does NOT remove or replace the other checks,
it just waits for the other checks to finish, and then succeeds if all of them succeeded.
This can be useful for repositories that have checks that run conditionally (e.g. only on certain paths) and still have a status check to set as "Required"
for merging.
Without this Action, one would have to set all conditional checks as "Required", and make sure they all run (even if it's a dummy run) always to have a
successful check.
This Action allows to avoid this, by having a single "Required" check (generated by the job running this Action) that will be successful if and only if all
sub-checks passed or were not scheduled to run.

## Usage

### Basic Example

This is a basic example of a GitHub Workflow that uses this action to aggregate both the `my_check_1` and any check starting with `lint`:

```yaml
name: Group
on:
  - pull_request
jobs:
  group:
    name: Grouped Check
    runs-on: ubuntu-latest
    steps:
      - uses: bugale/bugroup-checks@v1
        with:
          checks: |-
            my_check_1
            lint.*
          self: Grouped Check
```

### Input Parameters

- `checks`: _(required)_ A new-line separated list of JS-style RegExs matching all sub-checks this action should wait for. They are expected to match the whole
  check name.

- `excludedChecks`: A new-line separated list of JS-style RegExs matching checks that should be excluded, even if they appear in `checks`.

- `self`: The name of the check that includes this action. Used to avoid waiting for itself to finish, and to set the description on the check.

- `requiredStatus`: A new-line separated list of statuses which are considered successful. The action will fail if any of the checks in `checks` is not has a
  status that is not in this list. Defaults to `success,skipped`.

- `githubToken`: A token with which to interact with GitHub. Can be omitted to use the default token.

- `ref`: The git ref to get the checks for. Defaults to the pull request's head ref.
