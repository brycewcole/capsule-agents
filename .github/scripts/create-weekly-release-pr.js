// deno-lint-ignore-file no-process-global
module.exports = async ({ github, core, context }) => {
  const base = process.env.PR_BASE_BRANCH || "main"
  const head = process.env.PR_HEAD_BRANCH || "next"
  const { owner, repo } = context.repo

  const { data: existing } = await github.rest.pulls.list({
    owner,
    repo,
    state: "open",
    head: `${owner}:${head}`,
    base,
    per_page: 1,
  })

  if (existing.length > 0) {
    core.info(`PR #${existing[0].number} already exists, skipping creation`)
    return
  }

  const today = new Date().toISOString().split("T")[0]
  const title = `chore: Weekly release ${today}`
  const body =
    `Automated weekly merge of \`next\` branch into \`main\` for batched release.`

  const { data: pr } = await github.rest.pulls.create({
    owner,
    repo,
    base,
    head,
    title,
    body,
  })

  core.info(`Pull request #${pr.number} created successfully`)
}
