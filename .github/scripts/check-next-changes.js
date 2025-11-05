// deno-lint-ignore-file no-process-global
module.exports = async ({ github, core, context }) => {
  const base = process.env.PR_BASE_BRANCH || "main"
  const head = process.env.PR_HEAD_BRANCH || "next"
  const { owner, repo } = context.repo

  const compare = await github.rest.repos.compareCommits({
    owner,
    repo,
    base,
    head,
  })

  const hasChanges = compare.total_commits > 0 ||
    (Array.isArray(compare.files) && compare.files.length > 0)

  if (hasChanges) {
    core.info("Changes found in next branch (not yet on main):")
    compare.commits.forEach((commit) => {
      const summary = commit.commit?.message?.split("\n")[0] ?? ""
      core.info(`- ${commit.sha.substring(0, 7)} ${summary}`)
    })
  } else {
    core.info("No new changes in next branch to merge")
  }

  core.setOutput("has_changes", hasChanges ? "true" : "false")
}
