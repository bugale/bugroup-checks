# BuGroup-Checks

This GitHub Action aggregates several other checks to present a single unified status check on pull requests. It does NOT remove or replace the other checks,
it just waits for the other checks to finish, and then succeeds if all of them succeeded.
This can be useful for repositories that have checks that run conditionally (e.g. only on certain paths) and still have a status check to set as "Required"
for merging.
Without this Action, one would have to set all conditional checks as "Required", and make sure they all run (even if it's a dummy run) always to have a
successful check.
This Action allows to avoid this, by having a single "Required" check (generated by the job running this Action) that will be successful if and only if all
sub-checks passed or were not scheduled to run.

Since the required jobs might be rerun, this repository also contains a sub-action `rerun`, which can be used from the required jobs to trigger a rerun of the main
grouped check. This is useful especially for jobs that can fail sporadically and might require a manual rerun.

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
      - uses: bugale/bugroup-checks@v2
        with:
          checks: |-
            my_check_1
            lint.*
          self: Grouped Check
```

The `rerun` action can be used in dependent jobs (especially if they might sporadically fail and require a manual rerun) to automatically rerun the
`Grouped Check` job defined above:

```yaml
name: Lint Code
on:
  pull_request:
    paths:
      - '*.ts'
jobs:
  lint-ts:
    name: Lint Typescript
    runs-on: ubuntu-latest
    steps:
      - uses: bugale/bugroup-checks/rerun@v2
      - uses: actions/checkout@v4
      - run: npx eslint .
```

### Using flagging

An additional advanced and very specific use-case which this action solves is the following:
Assume you have a two tasks you want to run `task1` and `task2`. Both tasks take time to run and have a high cost in resources (e.g. compute), and `task2`
relies on the full output of `task1`, which is extremely large and expensive to upload somewhere. The full output of `task1` is needed only for `task2` and
nothing else. Additionally, you have `task3` which relies on part of the output of `task1`, but only a small part of it, which isn't expensive to
upload.

A real world scenario like this might be where `task1` is an expensive build of some product, `task2` is an incrementality validation of the build which relies
on all intermediate output, and `task3` is the unittests that rely on the compiled binaries alone, but not on intermediate output.

In GitHub Actions, you have two alternatives, both of which have drawbacks:

1. Have one job `job1` that does `task1` and `task2` serailly, and then `job2` that does `task3`, and puts `job1` in its `needs` field. This means that `task3`
   will only run after `task2` finishes, even though they could hypothetically run in parallel.

2. Have one job `job1` that does `task1` and `task2` serailly, and then `job2` that does only `task1`, and `job3` that does only `task2`, and put `job2` in the
   `needs` field of `job3`. This means that `task1` will be done twice, which is a waste of resources.

`bugroup-checks` solves this by allowing you to have a single job `job1` that does both `task1` and `task2`, but flags itself after `task1` is done and its
output is uploaded. Then have `job2` that waits for the flag to be set, and `job3` which does `task3` and has `job2` in its `needs` field.
This way, each task is done only once, and `task2` and `task3` can run in parallel without paying the price of uploading all of `task1`'s output.

An example of such a configuration can be found here:

```yaml
on:
  - pull_request
jobs:
  job1:
    name: Job 1
    runs-on: ubuntu-latest
    steps:
      - uses: bugale/bugroup-checks/rerun@v2
      - run: task1
      - uses: bugale/bugroup-checks/flag@v2
        with:
          self: Job 1
          flag: task1
      - run: task2
  job2:
    name: Job 2
    runs-on: ubuntu-latest
    steps:
      - uses: bugale/bugroup-checks@v2
        with:
          checks: Job 1
          flags: |-
            task1
          self: Job 2
  job3:
    name: Job 3
    runs-on: ubuntu-latest
    needs: [job2]
    steps:
      - run: task3
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

- `delay`: The delay in seconds to wait for the checks to start running. Defaults to 10.

- `interval`: The interval in seconds to wait between checking again. Defaults to 10.

- `jobIdentifier`: The identifier of the check, which is used to identify the job from the rerun action. Defaults to BUGROUP_CHECKS.
  This is useful in case there's more than one bugroup-checks job for the same git ref.

- `flags`: A new-line separated list of flags (set using the `/flag` action) to regard as job succeeded. Empty by default.

- `requiredChecksMaxCount`: The maximum number of required checks. If this number is found, no waiting for newer jobs will be done. Defaults to 0 (no limit).

### Output Parameters

- `allChecks`: A JSON of checks returned by the last call to GitHubs listForRef

- `requiredChecks`: A JSON of checks from `allChecks` that were required to be successful

- `unsuccessfulChecks`: A JSON of checks from `allChecks` that have failed

### Rerun Input Parameters

- `githubToken`: A token with which to interact with GitHub. Can be omitted to use the default token.

- `ref`: The git ref to get the checks for. Defaults to the pull request's head ref.

- `jobIdentifier`: The identifier of the job to rerun. Defaults to BUGROUP_CHECKS.

### Flag Input Parameters

- `githubToken`: A token with which to interact with GitHub. Can be omitted to use the default token.

- `ref`: The git ref to get the checks for. Defaults to the pull request's head ref.

- `self`: _(required)_ The name of the check that includes this action. Used to set the flag.

- `flag`: _(required)_ The name of the flag to set.
