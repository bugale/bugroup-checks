import { context, getOctokit } from '@actions/github'
import { getInput, debug, info, setFailed } from '@actions/core'

export async function run(): Promise<void> {
  /* eslint camelcase: ["error", {allow: ['^run_id$', '^job_id$']}] */
  try {
    const githubToken = getInput('githubToken')
    const ref = getInput('ref')
    const octokit = getOctokit(githubToken)
    const { data: refChecks } = await octokit.rest.checks.listForRef({ ...context.repo, ref })
    debug(`refChecks for ${ref}: ${JSON.stringify(refChecks)}`)
    for (const check of refChecks.check_runs) {
      const runId = check.output.text?.match(/^<!--BUGROUP_CHECKS-(\d+)-->$/)?.[1]
      if (runId !== undefined) {
        debug(`runId: ${runId}`)
        const { data: jobs } = await octokit.rest.actions.listJobsForWorkflowRun({ ...context.repo, run_id: parseInt(runId, 10) })
        debug(`jobs for ${runId}: ${JSON.stringify(jobs)}`)
        for (const job of jobs.jobs) {
          if (job.check_run_url === check.url) {
            if (job.status !== 'completed') {
              debug(`job ${job.id} is not completed, not rerunning`)
              return
            }
            info(`Rerunning bugroup-checks job_id: ${job.id}`)
            await octokit.rest.actions.reRunJobForWorkflowRun({ ...context.repo, job_id: job.id })
            return
          }
        }
      }
    }
    debug("Couldn't find bugroup-checks job")
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message)
    }
  }
}

void run().finally((): void => {})
