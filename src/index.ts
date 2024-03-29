import { context, getOctokit } from '@actions/github'
import { getInput, getMultilineInput, debug, info, warning, setFailed } from '@actions/core'

async function setStatus(octokit: ReturnType<typeof getOctokit>, status: string, selfId?: number | null, allSummaries?: string): Promise<void> {
  /* eslint camelcase: ["error", {allow: ['^check_run_id$']}] */
  info(status)
  if (selfId != null) {
    try {
      await octokit.rest.checks.update({
        ...context.repo,
        check_run_id: selfId,
        output: { summary: allSummaries ?? '', title: status }
      })
    } catch (error) {
      if (error instanceof Error) {
        warning(`Couldn't update self check: ${error.message}`)
      }
    }
  }
}

export async function run(): Promise<void> {
  try {
    const checkRegexes = getMultilineInput('checks').map((check) => RegExp(`^${check}$`))
    const excludedCheckRegexes = getMultilineInput('excludedChecks').map((check) => RegExp(`^${check}$`))
    const self = getInput('self')
    const requiredStatus = getMultilineInput('requiredStatus')
    const githubToken = getInput('githubToken')
    const ref = getInput('ref')
    let selfId: number | undefined | null

    while (true) {
      const octokit = getOctokit(githubToken)
      const { data: refChecks } = await octokit.rest.checks.listForRef({ ...context.repo, ref })
      debug(`refChecks for ${ref}: ${JSON.stringify(refChecks)}`)

      if (selfId === undefined && self !== '') {
        selfId = null
        try {
          selfId = refChecks.check_runs.filter((check) => check.name === self)[0].id
        } catch (error) {
          if (error instanceof Error) {
            warning(`Couldn't find self check: ${error.message}`)
          }
        }
        debug(`selfId: ${selfId}`)
      }

      const requiredChecks = refChecks.check_runs.filter(
        (check) =>
          checkRegexes.some((regex) => regex.test(check.name)) &&
          !excludedCheckRegexes.some((regex) => regex.test(check.name)) &&
          check.id !== selfId &&
          !refChecks.check_runs.some((otherCheck) => otherCheck.name === check.name && otherCheck.id > check.id)
      )
      debug(`requiredChecks by ${JSON.stringify(checkRegexes)}-${JSON.stringify(excludedCheckRegexes)}: ${JSON.stringify(requiredChecks)}`)

      const allSummaries = requiredChecks.map((check) => check.output.summary ?? '').join('')
      const incompleteChecks = requiredChecks.filter((check) => check.status !== 'completed')
      debug(`incompleteChecks: ${JSON.stringify(incompleteChecks)}`)
      if (incompleteChecks.length === 0) {
        const unsuccessfulChecks = requiredChecks.filter((check) => !requiredStatus.includes(check.conclusion ?? 'none'))
        debug(`unsuccessfulChecks: ${JSON.stringify(unsuccessfulChecks)}`)
        if (unsuccessfulChecks.length === 0) {
          await setStatus(octokit, `${requiredChecks.length}/${requiredChecks.length} checks completed successfully`, selfId, allSummaries)
          return
        }
        await setStatus(
          octokit,
          `${unsuccessfulChecks.length}/${requiredChecks.length} checks failed: ${unsuccessfulChecks.map((check) => check.name).join(', ')}`,
          selfId,
          allSummaries
        )
        setFailed(`${unsuccessfulChecks.length}/${requiredChecks.length} checks failed: ${unsuccessfulChecks.map((check) => check.name).join(', ')}`)
        return
      }

      await setStatus(
        octokit,
        `${requiredChecks.length - incompleteChecks.length}/${requiredChecks.length} waiting for: ${incompleteChecks.map((check) => check.name).join(', ')}`,
        selfId,
        allSummaries
      )
      await new Promise((resolve) => setTimeout(resolve, 10000)) // Wait between polling
    }
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message)
    }
  }
}

void run().finally((): void => {})
