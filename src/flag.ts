import { context, getOctokit } from '@actions/github'
import { getInput, debug, setFailed } from '@actions/core'

export async function run(): Promise<void> {
  /* eslint camelcase: ["error", {allow: ['^check_run_id$', '^external_id$']}] */
  try {
    const githubToken = getInput('githubToken')
    const ref = getInput('ref')
    const self = getInput('self')
    const flag = getInput('flag')
    const octokit = getOctokit(githubToken)
    const { data: refChecks } = await octokit.rest.checks.listForRef({ ...context.repo, ref })
    debug(`refChecks for ${ref}: ${JSON.stringify(refChecks)}`)
    const selfChecks = refChecks.check_runs.filter((check) => check.name === self)
    if (selfChecks.length === 0) {
      setFailed(`Couldn't find self check: ${self}`)
      return
    }
    await octokit.rest.checks.update({
      ...context.repo,
      check_run_id: selfChecks[0].id,
      external_id: `${selfChecks[0].external_id ?? ''}<!--BUGROUP_CHECKS_FLAG-${flag}-->`
    })
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message)
    }
  }
}

void run().finally((): void => {})
