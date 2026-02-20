require('dotenv').config({ path: __dirname + '/.env' });
const impactLogic = require('./impactLogic');
const emailService = require('./emailService');

/**
 * ImpactX Automated Agent (Standalone Version)
 * Monitors GitHub Pull Requests and performs:
 * 1. Deep Impact Analysis
 * 2. Automated Test Case Generation
 * 3. JIRA Synchronization
 * 4. Email Notifications
 */

async function processAgentTask(payload) {
  const { action, pull_request, repository } = payload;

  // Preliminary logging for debugging
  const prNum = pull_request?.number || 'N/A';
  const targetBranch = pull_request?.base?.ref || 'N/A';
  console.log(`[Agent] Received event: action=${action}, PR=#${prNum}, Target=${targetBranch}`);

  // 1. Validate if it's a PR event targeting master/main
  const allowedActions = ['opened', 'synchronize', 'reopened', 'closed'];
  if (!allowedActions.includes(action)) {
    console.log(`[Agent] Skipping: action=${action}`);
    return { status: 'skipped' };
  }

  // If closed, only proceed if merged (the old behavior)
  if (action === 'closed' && !pull_request.merged) {
    console.log(`[Agent] Skipping: PR closed without merge`);
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

  console.log(`[Agent] 🚀 PR Detected: ${compareBranch} -> ${sourceBranch} (Action: ${action}, PR #${prNumber})`);

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
  } else if (!config.groqKey) {
    throw new Error('Missing GROQ_API_KEY in environment variables');
  } else {
    console.log("[Agent] 🔑 Keys fetched successfully");
  }

  try {
    // 1. Detect JIRA key early to fetch ticket details
    const jiraRegex = /([A-Z]+-[0-9]+)/i;
    const searchString = `${pull_request.title} ${pull_request.head.ref} ${pull_request.body || ''}`;
    const match = searchString.match(jiraRegex);
    let jiraKey = null;
    let jiraTicket = null;

    if (match) {
      jiraKey = match[1].toUpperCase();
      console.log(`[Agent] 🎫 Found JIRA Key: ${jiraKey}`);
      
      // Fetch JIRA ticket details if JIRA is configured
      if (config.jiraUrl && config.jiraToken && config.jiraEmail) {
        try {
          console.log(`[Agent] 📋 Fetching JIRA ticket details...`);
          jiraTicket = await impactLogic.getJiraTicket(
            config.jiraUrl,
            config.jiraEmail,
            config.jiraToken,
            jiraKey
          );
          if (jiraTicket) {
            console.log(`[Agent] ✅ Loaded ticket: ${jiraTicket.title}`);
          } else {
            console.log(`[Agent] ⚠️  Could not fetch ticket details, proceeding without ticket context`);
          }
        } catch (err) {
          console.log(`[Agent] ⚠️  Error fetching JIRA ticket: ${err.message}. Proceeding without ticket context.`);
        }
      }
    } else {
      console.log(`[Agent] ℹ️  No JIRA key found in PR. Analysis will proceed without ticket context.`);
    }

    // 2. Perform AI-Powered Impact Analysis (with JIRA ticket context if available)
    console.log(`[Agent] 🔍 Analyzing impacts...`);
    const diff = await impactLogic.getGitHubDiff(config.githubToken, repoOwner, repoName, sourceBranch, compareBranch);
    const tree = await impactLogic.getGitHubTree(config.githubToken, repoOwner, repoName, compareBranch);

    const analysisJson = await impactLogic.summarizeImpact(config.groqKey, diff, tree, jiraTicket);
    const analysis = JSON.parse(analysisJson);

    // 3. Generate Automated Test Cases
    console.log(`[Agent] 🧪 Generating test cases...`);
    const testCasesJson = await impactLogic.generateTestCases(config.groqKey, diff, tree, repoOwner, repoName);
    const testCases = JSON.parse(testCasesJson);

    console.log(`[Agent] ✅ Analysis completed.`);

    // 4. Post to JIRA (pass jiraKey if found)
    await handleJiraPosting(config, pull_request, analysis, testCases, action, jiraKey);

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

async function handleJiraPosting(config, pr, analysis, testCases, action, jiraKey = null) {
  console.log(`[Agent] 🔍 Checking JIRA configuration...`);
  console.log(`[Agent] JIRA_URL: ${config.jiraUrl ? 'Set' : 'MISSING'}`);
  console.log(`[Agent] JIRA_EMAIL: ${config.jiraEmail ? config.jiraEmail : 'MISSING'}`);
  console.log(`[Agent] JIRA_TOKEN: ${config.jiraToken ? 'Set (***' + config.jiraToken.slice(-4) + ')' : 'MISSING'}`);
  
  if (!config.jiraUrl || !config.jiraToken || !config.jiraEmail) {
    console.log(`[Agent] ⚠️  JIRA not configured. Skipping post.`);
    return;
  }

  // Use provided jiraKey or try to detect it
  if (!jiraKey) {
    const jiraRegex = /([A-Z]+-[0-9]+)/i;
    const searchString = `${pr.title} ${pr.head.ref} ${pr.body || ''}`;
    console.log(`[Agent] 🔍 Searching for JIRA key in: "${searchString.substring(0, 150)}..."`);
    const match = searchString.match(jiraRegex);

    if (!match) {
      console.log(`[Agent] ⚠️  No JIRA key found in PR title, branch, or body.`);
      console.log(`[Agent] Searched in: Title="${pr.title}", Branch="${pr.head.ref}", Body="${(pr.body || '').substring(0, 50)}..."`);
      return;
    }

    jiraKey = match[1].toUpperCase();
  }
  
  console.log(`[Agent] 🎫 Using JIRA Key: ${jiraKey}`);

  const jiraDomainMatch = config.jiraUrl.match(/https?:\/\/([^/]+)/);
  if (!jiraDomainMatch) {
    console.error(`[Agent] ❌ Invalid JIRA_URL format: ${config.jiraUrl}`);
    return;
  }
  const jiraDomain = jiraDomainMatch[0];
  const targetUrl = `${jiraDomain}/browse/${jiraKey}`;
  console.log(`[Agent] 🎯 Target JIRA URL: ${targetUrl}`);

  const header = action === 'closed' ? 'Post-Merge Analysis' : 'Impact Analysis';
  const commentBody = `
### 🤖 ImpactX AI: ${header} (PR #${pr.number})
**Risk Level:** ${analysis.risk?.score || 'IDENTIFIED'}

#### 📝 Summary
${analysis.risk?.reasoning || 'No summary provided.'}

${analysis.requirementsAlignment ? `
#### 🎯 Requirements Alignment
- **Fully Addressed:** ${analysis.requirementsAlignment.fullyAddressed ? '✅ Yes' : '❌ No'}
- **Alignment Score:** ${analysis.requirementsAlignment.alignmentScore || 'N/A'}
${analysis.requirementsAlignment.missingRequirements?.length > 0 ? `- **Missing Requirements:** ${analysis.requirementsAlignment.missingRequirements.join(', ')}` : ''}
${analysis.requirementsAlignment.additionalChanges?.length > 0 ? `- **Additional Changes:** ${analysis.requirementsAlignment.additionalChanges.join(', ')}` : ''}
` : ''}

#### 🔧 Technical Details
- **API:** ${analysis.technicalDetails?.["API Impact"] || 'N/A'}
- **Database:** ${analysis.technicalDetails?.["Database Impact"] || 'N/A'}
- **Logic:** ${analysis.technicalDetails?.["Logic Impact"] || 'N/A'}
- **Security:** ${analysis.technicalDetails?.["Security Impact"] || 'N/A'}

#### 🧪 Suggested Test Cases
${(testCases.testCases || []).slice(0, 5).map(tc => {
      const steps = (tc.steps || []).map((s, i) => `   ${i + 1}. ${s}`).join('\n');
      return `- [${tc.priority}] **${tc.title}**\n**Steps:**\n${steps}\n**Expected:** ${tc.expectedResult}`;
    }).join('\n\n')}

---
*Standalone ImpactX Agent*
    `.trim();

  try {
    await impactLogic.postJiraComment(targetUrl, config.jiraEmail, config.jiraToken, commentBody);
    console.log(`[Agent] 🚀 Posted to JIRA ${jiraKey}`);
  } catch (err) {
    console.error(`[Agent] ❌ JIRA Post Failed for ${jiraKey}:`, err.message);
    console.error(`[Agent] Full error:`, err);
  }
}

module.exports = { processAgentTask };

if (require.main === module) {
  console.log("ImpactX Standalone Agent Loaded.");
}
