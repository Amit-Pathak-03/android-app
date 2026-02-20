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
    // AIO TCMS Config (AIO is a JIRA plugin, so we use JIRA REST API)
    // Extract base URL from the JIRA project URL
    aioBaseUrl: "https://genaibrainchild.atlassian.net/rest/api/3",
    aioApiKey: "NTcwZjRiNWItZTRjNy0zMTJiLTljN2UtYzIxNmUwOWIxNDJmLjhlY2U3MzBmLWVmYjYtNGE3YS04YzBiLTJmNTQyNTQ1MjUzMA==",
    aioProjectId: "10000",
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
    await handleJiraPosting(config, pull_request, analysis, testCases, action);

    // 5. Generate and create test cases directly in AIO TCMS
    await handleAioTestCaseCreation(config, pull_request, diff, tree, repoOwner, repoName, action);

    // 6. Send Email Notification
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

async function handleJiraPosting(config, pr, analysis, testCases, action) {
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
    // AIO TCMS Config (AIO is a JIRA plugin, so we use JIRA REST API)
    // The URL you provided is a JIRA project page, we need the REST API endpoint
    aioBaseUrl: "https://genaibrainchild.atlassian.net/rest/api/3",
    aioApiKey: "NTcwZjRiNWItZTRjNy0zMTJiLTljN2UtYzIxNmUwOWIxNDJmLjhlY2U3MzBmLWVmYjYtNGE3YS04YzBiLTJmNTQyNTQ1MjUzMA==",
    aioProjectId: "10000",
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
        await handleJiraPosting(config, pull_request, analysis, testCases, action);
    
        // 5. Generate and create test cases directly in AIO TCMS
        await handleAioTestCaseCreation(config, pull_request, diff, tree, repoOwner, repoName, action);
    
        // 6. Send Email Notification
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
    
    async function handleJiraPosting(config, pr, analysis, testCases, action) {
      console.log(`[Agent] 🔍 Checking JIRA configuration...`);
      console.log(`[Agent] JIRA_URL: ${config.jiraUrl ? 'Set' : 'MISSING'}`);
      console.log(`[Agent] JIRA_EMAIL: ${config.jiraEmail ? config.jiraEmail : 'MISSING'}`);
      console.log(`[Agent] JIRA_TOKEN: ${config.jiraToken ? 'Set (***' + config.jiraToken.slice(-4) + ')' : 'MISSING'}`);
      
      if (!config.jiraUrl || !config.jiraToken || !config.jiraEmail) {
        console.log(`[Agent] ⚠️  JIRA not configured. Skipping post.`);
        return;
      }
    
      // Detect JIRA ID
      const jiraRegex = /([A-Z]+-[0-9]+)/i;
      const searchString = `${pr.title} ${pr.head.ref} ${pr.body || ''}`;
      console.log(`[Agent] 🔍 Searching for JIRA key in: "${searchString.substring(0, 150)}..."`);
      const match = searchString.match(jiraRegex);
    
      if (!match) {
        console.log(`[Agent] ⚠️  No JIRA key found in PR title, branch, or body.`);
        console.log(`[Agent] Searched in: Title="${pr.title}", Branch="${pr.head.ref}", Body="${(pr.body || '').substring(0, 50)}..."`);
        return;
      }
    
      const jiraKey = match[1].toUpperCase();
      console.log(`[Agent] 🎫 Found JIRA Key: ${jiraKey}`);
    
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
    
    #### � Technical Details
    - **API:** ${analysis.technicalDetails?.["API Impact"] || 'N/A'}
    - **Logic:** ${analysis.technicalDetails?.["Logic Impact"] || 'N/A'}
    
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
    
    async function handleAioTestCaseCreation(config, pr, diff, tree, repoOwner, repoName, action) {
      console.log(`[Agent] 🔍 Checking AIO TCMS configuration...`);
      console.log(`[Agent] AIO_BASE_URL: ${config.aioBaseUrl ? 'Set' : 'MISSING'}`);
      console.log(`[Agent] AIO_API_KEY: ${config.aioApiKey ? 'Set (***' + config.aioApiKey.slice(-4) + ')' : 'MISSING'}`);
      console.log(`[Agent] AIO_PROJECT_ID: ${config.aioProjectId || 'MISSING'}`);
    
      if (!config.aioBaseUrl || !config.aioApiKey || !config.aioProjectId) {
        console.log(`[Agent] ⚠️  AIO TCMS not configured. Skipping test case creation.`);
        return;
      }
    
      if (!config.groqKey) {
        console.log(`[Agent] ⚠️  GROQ_API_KEY missing. Cannot generate test cases for AIO.`);
        return;
      }
    
      // Detect JIRA key if available (for linking test cases)
      const jiraRegex = /([A-Z]+-[0-9]+)/i;
      const searchString = `${pr.title} ${pr.head.ref} ${pr.body || ''}`;
      const match = searchString.match(jiraRegex);
      const jiraKey = match ? match[1].toUpperCase() : null;
    
      if (jiraKey) {
        console.log(`[Agent] 🎫 Found JIRA Key: ${jiraKey} - will link test cases if supported`);
      }
    
      try {
        console.log(`[Agent] 🧪 Generating and creating test cases directly in AIO TCMS...`);
        const created = await impactLogic.generateAndCreateAioTestCases(
          config.groqKey,
          diff,
          tree,
          repoOwner,
          repoName,
          config.aioBaseUrl,
          config.aioApiKey,
          config.aioProjectId,
          jiraKey
        );
        
        console.log(`[Agent] ✅ Successfully created ${created.length} test cases in AIO TCMS`);
        if (created.length === 0) {
          console.log(`[Agent] ⚠️  No test cases were created. Check logs above for details.`);
        }
      } catch (err) {
        console.error(`[Agent] ❌ AIO Test Case Generation/Creation Failed:`, err.message);
        console.error(`[Agent] Full error:`, err);
      }
    }
    
async function handleJiraPosting(config, pr, analysis, testCases, action) {
  console.log(`[Agent] 🔍 Checking JIRA configuration...`);
  console.log(`[Agent] JIRA_URL: ${config.jiraUrl ? 'Set' : 'MISSING'}`);
  console.log(`[Agent] JIRA_EMAIL: ${config.jiraEmail ? config.jiraEmail : 'MISSING'}`);
  console.log(`[Agent] JIRA_TOKEN: ${config.jiraToken ? 'Set (***' + config.jiraToken.slice(-4) + ')' : 'MISSING'}`);
  
  if (!config.jiraUrl || !config.jiraToken || !config.jiraEmail) {
    console.log(`[Agent] ⚠️  JIRA not configured. Skipping post.`);
    return;
  }

  // Detect JIRA ID
  const jiraRegex = /([A-Z]+-[0-9]+)/i;
  const searchString = `${pr.title} ${pr.head.ref} ${pr.body || ''}`;
  console.log(`[Agent] 🔍 Searching for JIRA key in: "${searchString.substring(0, 150)}..."`);
  const match = searchString.match(jiraRegex);

  if (!match) {
    console.log(`[Agent] ⚠️  No JIRA key found in PR title, branch, or body.`);
    console.log(`[Agent] Searched in: Title="${pr.title}", Branch="${pr.head.ref}", Body="${(pr.body || '').substring(0, 50)}..."`);
    return;
  }

  const jiraKey = match[1].toUpperCase();
  console.log(`[Agent] 🎫 Found JIRA Key: ${jiraKey}`);

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

#### � Technical Details
- **API:** ${analysis.technicalDetails?.["API Impact"] || 'N/A'}
- **Logic:** ${analysis.technicalDetails?.["Logic Impact"] || 'N/A'}

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

async function handleAioTestCaseCreation(config, pr, diff, tree, repoOwner, repoName, action) {
  console.log(`[Agent] 🔍 Checking AIO TCMS configuration...`);
  console.log(`[Agent] AIO_BASE_URL: ${config.aioBaseUrl ? 'Set' : 'MISSING'}`);
  console.log(`[Agent] AIO_API_KEY: ${config.aioApiKey ? 'Set (***' + config.aioApiKey.slice(-4) + ')' : 'MISSING'}`);
  console.log(`[Agent] AIO_PROJECT_ID: ${config.aioProjectId || 'MISSING'}`);

  if (!config.aioBaseUrl || !config.aioApiKey || !config.aioProjectId) {
    console.log(`[Agent] ⚠️  AIO TCMS not configured. Skipping test case creation.`);
    return;
  }

  if (!config.groqKey) {
    console.log(`[Agent] ⚠️  GROQ_API_KEY missing. Cannot generate test cases for AIO.`);
    return;
  }

  // Detect JIRA key if available (for linking test cases)
  const jiraRegex = /([A-Z]+-[0-9]+)/i;
  const searchString = `${pr.title} ${pr.head.ref} ${pr.body || ''}`;
  const match = searchString.match(jiraRegex);
  const jiraKey = match ? match[1].toUpperCase() : null;

  if (jiraKey) {
    console.log(`[Agent] 🎫 Found JIRA Key: ${jiraKey} - will link test cases if supported`);
  }

  try {
    console.log(`[Agent] 🧪 Generating and creating test cases directly in AIO TCMS...`);
    const created = await impactLogic.generateAndCreateAioTestCases(
      config.groqKey,
      diff,
      tree,
      repoOwner,
      repoName,
      config.aioBaseUrl,
      config.aioApiKey,
      config.aioProjectId,
      jiraKey
    );
    
    console.log(`[Agent] ✅ Successfully created ${created.length} test cases in AIO TCMS`);
    if (created.length === 0) {
      console.log(`[Agent] ⚠️  No test cases were created. Check logs above for details.`);
    }
  } catch (err) {
    console.error(`[Agent] ❌ AIO Test Case Generation/Creation Failed:`, err.message);
    console.error(`[Agent] Full error:`, err);
  }
}

module.exports = { processAgentTask };

if (require.main === module) {
  console.log("ImpactX Standalone Agent Loaded.");
}
