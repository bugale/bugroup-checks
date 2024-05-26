import { context, getOctokit } from '@actions/github'
import { getInput, getMultilineInput, debug, info, warning, setFailed, setOutput } from '@actions/core'

async function setStatus(octokit: ReturnType<typeof getOctokit>, status: string, jobIdentifier: string, selfId?: number | null): Promise<void> {
  /* eslint camelcase: ["error", {allow: ['^check_run_id$']}] */
  info(status)
  if (selfId != null) {
    try {
      await octokit.rest.checks.update({
        ...context.repo,
        check_run_id: selfId,
        output: { summary: '', title: status, text: `<!--${jobIdentifier}-${context.runId}-->` }
      })
    } catch (error) {
      if (error instanceof Error) {
        warning(`Couldn't update self check: ${error.message}`)
      }
    }
  }
}

function isFlagged(text: string, flags: string[]): boolean {
  return flags.some((flag) => text.includes(`<!--BUGROUP_CHECKS_FLAG-${flag}-->`))
}

export async function run(): Promise<void> {
  try {
    const checkRegexes = getMultilineInput('checks').map((check) => RegExp(`^${check}$`))
    const excludedCheckRegexes = getMultilineInput('excludedChecks').map((check) => RegExp(`^${check}$`))
    const self = getInput('self')
    const requiredStatus = getMultilineInput('requiredStatus')
    const githubToken = getInput('githubToken')
    const ref = getInput('ref')
    const delay = parseInt(getInput('delay'), 10)
    const interval = parseInt(getInput('interval'), 10)
    const jobIdentifier = getInput('jobIdentifier')
    const flags = getMultilineInput('flags')
    const requiredChecksMaxCount = parseInt(getInput('requiredChecksMaxCount'), 10)
    let selfId: number | undefined | null
    let noNewJobsCounter = 0

    setOutput('allChecks', '[]')
    setOutput('requiredChecks', '[]')
    setOutput('unsuccessfulChecks', '[]')

    while (true) {
      const octokit = getOctokit(githubToken)
      const { data: refChecks } = await octokit.rest.checks.listForRef({ ...context.repo, ref })
      debug(`refChecks for ${ref}: ${JSON.stringify(refChecks)}`)
      setOutput('allChecks', JSON.stringify(refChecks.check_runs))

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
      setOutput('requiredChecks', JSON.stringify(requiredChecks))

      const incompleteChecks = requiredChecks.filter((check) => check.status !== 'completed' && !isFlagged(check.output.text ?? '', flags))
      debug(`incompleteChecks: ${JSON.stringify(incompleteChecks)}`)
      if (incompleteChecks.length === 0) {
        if (noNewJobsCounter < 1 && (requiredChecksMaxCount !== 0 || requiredChecks.length >= requiredChecksMaxCount)) {
          debug('No incomplete jobs found, waiting for new jobs to start...')
          noNewJobsCounter++
          await new Promise((resolve) => setTimeout(resolve, delay * 1000)) // Wait for new jobs to start
          continue
        }
        const unsuccessfulChecks = requiredChecks.filter(
          (check) => !requiredStatus.includes(check.conclusion ?? 'none') && !isFlagged(check.output.text ?? '', flags)
        )
        debug(`unsuccessfulChecks: ${JSON.stringify(unsuccessfulChecks)}`)
        setOutput('unsuccessfulChecks', JSON.stringify(unsuccessfulChecks))
        if (unsuccessfulChecks.length === 0) {
          await setStatus(octokit, `${requiredChecks.length}/${requiredChecks.length} checks completed successfully`, jobIdentifier, selfId)
          return
        }
        await setStatus(
          octokit,
          `${unsuccessfulChecks.length}/${requiredChecks.length} checks failed: ${unsuccessfulChecks.map((check) => check.name).join(', ')}`,
          jobIdentifier,
          selfId
        )
        setFailed(`${unsuccessfulChecks.length}/${requiredChecks.length} checks failed: ${unsuccessfulChecks.map((check) => check.name).join(', ')}`)
        return
      }
      noNewJobsCounter = 0

      await setStatus(
        octokit,
        `${requiredChecks.length - incompleteChecks.length}/${requiredChecks.length} waiting for: ${incompleteChecks.map((check) => check.name).join(', ')}`,
        jobIdentifier,
        selfId
      )
      await new Promise((resolve) => setTimeout(resolve, interval * 1000)) // Wait between polling
    }
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message)
    }
  }
}

void run().finally((): void => {})
