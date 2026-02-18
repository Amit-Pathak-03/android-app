require('dotenv').config({ path: __dirname + '/.env' });
const impactLogic = require('./impactLogic');
const emailService = require('./emailService');

/**
 * ImpactX Automated Agent (Standalone Version)
 * Monitors GitHub merges to master and performs:
 * 1. Deep Impact Analysis
 * 2. Automated Test Case Generation
 * 3. JIRA Synchronization
 * 4. Email Notifications
 */

async function processAgentTask(payload) {
  const { action, pull_request, repository } = payload;

  // 1. Validate if it's a merge event to master
  if (action !== 'closed' || !pull_request.merged) {
    console.log(`[Agent] Skipping: action=${action}, merged=${pull_request.merged}`);
    return { status: 'skipped' };
  }

  const baseBranch = pull_request.base.ref;
  if (baseBranch !== 'master' && baseBranch !== 'main') {
    console.log(`[Agent] Skipping: Target branch is ${baseBranch}`);
    return { status: 'skipped' };
  }

  const repoOwner = repository.owner.login;
  const repoName = repository.name;
  const sourceBranch = pull_request.base.ref;
  const compareBranch = pull_request.head.ref;
  const prNumber = pull_request.number;

  console.log(`[Agent] 🚀 Merge Detected: ${compareBranch} -> ${sourceBranch} (PR #${prNumber})`);

  // Configuration from Environment Variables (Standalone mode)
  const config = {
    githubToken: process.env.GITHUB_TOKEN,
    groqKey: process.env.GROQ_API_KEY,
    openRouterKey: process.env.OPENROUTER_API_KEY,
    jiraUrl: process.env.JIRA_URL,
    jiraEmail: process.env.JIRA_EMAIL,
    jiraToken: process.env.JIRA_TOKEN,
    // Email Config
    EMAIL_HOST: process.env.EMAIL_HOST,
    EMAIL_PORT: process.env.EMAIL_PORT,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,
    EMAIL_TO: process.env.EMAIL_TO
  };

  if (!config.githubToken) {
    throw new Error('Missing GITHUB_TOKEN in environment variables');
  } else if (!config.groqKey){
     throw new Error('Missing GROQ_API_KEY in environment variables');
  } else{
    console.log ("Keys fetched sucessfully");
  }

  try {
    // 2. Perform AI-Powered Impact Analysis
    console.log(`[Agent] 🔍 Analyzing impacts...`);
    const diff = await impactLogic.getGitHubDiff(config.githubToken, repoOwner, repoName, sourceBranch, compareBranch);
    const tree = await impactLogic.getGitHubTree(config.githubToken, repoOwner, repoName, compareBranch);

    const analysisJson = await impactLogic.summarizeImpact(config.groqKey, diff, tree);
    const analysis = JSON.parse(analysisJson);

    // 3. Generate Automated Test Cases
    console.log(`[Agent] 🧪 Generating test cases...`);
    const testCasesJson = await impactLogic.generateTestCases(config.groqKey, diff, tree, repoOwner, repoName);
    const testCases = JSON.parse(testCasesJson);

    console.log(`[Agent] ✅ Analysis completed.`);

    // 4. Post to JIRA
    await handleJiraPosting(config, pull_request, analysis, testCases);

    // 5. Send Email Notification
    console.log(`[Agent] 📧 Sending email report...`);
    await emailService.sendImpactEmail(config, pull_request, analysis, testCases);

    return {
      status: 'success',
      risk: analysis.risk?.score,
      testCaseCount: testCases.testCases?.length || 0
    };

  } catch (err) {
    console.error(`[Agent] ❌ Error:`, err.message);
    throw err;
  }
}

async function handleJiraPosting(config, pr, analysis, testCases) {
  if (!config.jiraUrl || !config.jiraToken || !config.jiraEmail) {
    console.log(`[Agent] JIRA not configured. Skipping post.`);
    return;
  }

  // Detect JIRA ID
  const jiraRegex = /([A-Z]+-[0-9]+)/i;
  const searchString = `${pr.title} ${pr.head.ref} ${pr.body}`;
  const match = searchString.match(jiraRegex);

  if (match) {
    const jiraKey = match[1].toUpperCase();
    console.log(`[Agent] 🎫 Found JIRA Key: ${jiraKey}`);

    const jiraDomain = config.jiraUrl.match(/https?:\/\/([^/]+)/)[0];
    const targetUrl = `${jiraDomain}/browse/${jiraKey}`;

    const commentBody = `
### 🤖 ImpactX AI: post-Merge Analysis (PR #${pr.number})
**Risk Level:** ${analysis.risk?.score || 'IDENTIFIED'}

#### 📝 Summary
${analysis.risk?.reasoning || 'No summary provided.'}

#### � Technical Details
- **API:** ${analysis.technicalDetails?.["API Impact"] || 'N/A'}
- **Logic:** ${analysis.technicalDetails?.["Logic Impact"] || 'N/A'}

#### 🧪 Suggested Test Cases
${(testCases.testCases || []).slice(0, 5).map(tc => `- [${tc.priority}] **${tc.title}**: ${tc.expectedResult}`).join('\n')}

---
*Standalone ImpactX Agent*
    `.trim();

    try {
      await impactLogic.postJiraComment(targetUrl, config.jiraEmail, config.jiraToken, commentBody);
      console.log(`[Agent] 🚀 Posted to JIRA ${jiraKey}`);
    } catch (err) {
      console.error(`[Agent] JIRA Post Failed:`, err.message);
    }
  }
}

module.exports = { processAgentTask };

if (require.main === module) {
  console.log("ImpactX Standalone Agent Loaded.");
}