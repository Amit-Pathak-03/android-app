const fetch = require('node-fetch');
const parseDiff = require('parse-diff');

/**
 * Standalone Impact Logic for AI Agent
 * Handles GitHub, AI (OpenAI/Groq/OpenRouter), and JIRA interactions
 */

async function getGitHubDiff(token, owner, repo, base, head) {
    const url = `https://api.github.com/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
    const resp = await fetch(url, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3.diff',
            'User-Agent': 'ImpactX-Agent'
        }
    });

    if (!resp.ok) {
        throw new Error(`GitHub Diff API error: ${resp.status} ${resp.statusText}`);
    }
    return await resp.text();
}

async function getGitHubTree(token, owner, repo, branch) {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const resp = await fetch(url, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ImpactX-Agent'
        }
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return (json.tree || [])
        .filter(i => !i.path.startsWith('ImpactX_Agent/'))
        .map(i => ({ path: i.path, type: i.type === 'tree' ? 'directory' : 'file' }))
        .slice(0, 300);
}

async function summarizeImpact(groqKey, diff, structure) {
    // PRE-PROCESS: Filter out ImpactX_Agent from the diff to prevent "Circular Analysis"
    const filteredDiff = (diff || '').split('diff --git ')
        .filter(file => file.trim() && !file.includes('a/ImpactX_Agent/') && !file.includes('b/ImpactX_Agent/'))
        .join('diff --git ');

    const prompt = `
You are a Senior Staff Software Architect. Perform a rigorous technical impact analysis on the following code changes.
Your goal is to identify ALL potential ripple effects, logic breaks, and architectural risks in the APPLICATION code.

[PROJECT STRUCTURE]
${JSON.stringify(structure || [], null, 2).substring(0, 4000)}

[GIT DIFF TO ANALYZE]
${filteredDiff.substring(0, 8000)}

[ANALYSIS GUIDELINES]
1. FOCUS: Only analyze the impacts of the code changes shown in the [GIT DIFF].
2. SCOPE: Ignore the analyzer tool itself (ImpactX_Agent). Focus on the Android/Business logic.
3. LOGIC: If a change is only to tests or documentation, the risk score MUST be LOW.
4. DETAIL: Be specific about which activities or classes are affected.

Return your analysis in the following JSON format ONLY:
{
  "risk": { "score": "CRITICAL/HIGH/MEDIUM/LOW", "reasoning": "Specify EXACTLY why this risk was chosen based ONLY on the diff." },
  "keyChanges": ["..."],
  "technicalDetails": {
    "API Impact": "...",
    "Database Impact": "...",
    "Logic Impact": "...",
    "UI Impact": "...",
    "Security Impact": "..."
  }
}
`;

    const body = {
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 1000
    };

    let response;
    if (groqKey) {
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
            body: JSON.stringify({ ...body, model: 'llama-3.3-70b-versatile' })
        });
    } else {
        throw new Error('No Groq API Key provided for impact analysis');
    }

    const json = await response.json();
    if (!response.ok) throw new Error(`AI API error Groq: ${JSON.stringify(json)}`);
    return json.choices[0].message.content.trim();
}

async function generateTestCases(openRouterKey, diff, structure, owner, repo) {
    // PRE-PROCESS: Filter out ImpactX_Agent from the diff
    const filteredDiff = (diff || '').split('diff --git ')
        .filter(file => file.trim() && !file.includes('a/ImpactX_Agent/') && !file.includes('b/ImpactX_Agent/'))
        .join('diff --git ');

    const prompt = `
You are a Lead QA Automation Engineer. Generate 8-10 comprehensive manual test cases based on the provided code changes in ${owner}/${repo}.

[CONTEXT]
The changes affect the following parts of the system. Your test cases should cover both direct changes and potential regression areas.

[STRUCTURE]
${JSON.stringify((structure || []).slice(0, 50))}

[DIFF]
${filteredDiff.substring(0, 5000)}

[REQUIREMENTS]
1. TITLE: Descriptive and concise (e.g., "Verify user login with invalid credentials").
2. STEPS: Provide a detailed, step-by-step guide (array of strings) to execute the test. Be specific about inputs and expected interactions.
3. EXPECTED RESULT: Clearly state what the successful outcome looks like.
4. PRIORITY: Assign HIGH, MEDIUM, or LOW based on the impact of the area changed.

Format your response as a valid JSON object ONLY:
{
  "summary": "Brief overview of the testing strategy for these changes.",
  "testCases": [
    { 
      "title": "...", 
      "steps": ["Step 1...", "Step 2...", "Step 3..."], 
      "expectedResult": "...", 
      "priority": "HIGH/MEDIUM/LOW" 
    }
  ]
}
`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${openRouterKey}`, // We reuse the key passed from agent.js, which we'll map to GROQ_API_KEY
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: "json_object" }
        })
    });

    const json = await response.json();
    if (!response.ok) throw new Error(`Groq Test Gen error: ${JSON.stringify(json)}`);
    return json.choices[0].message.content.trim();
}

async function postJiraComment(jiraUrl, jiraEmail, jiraToken, commentBody) {
    const hostMatch = jiraUrl.match(/https?:\/\/([^/]+)/);
    const keyMatch = jiraUrl.match(/browse\/([^/?]+)/);
    if (!hostMatch || !keyMatch) throw new Error('Invalid JIRA URL');

    const host = hostMatch[1];
    const issueKey = keyMatch[1];
    const apiUrl = `https://${host}/rest/api/3/issue/${issueKey}/comment`;
    const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');

    const body = {
        body: {
            type: "doc",
            version: 1,
            content: [
                { type: "paragraph", content: [{ text: "ImpactX AI Analysis Report", type: "text", marks: [{ type: "strong" }] }] },
                { type: "codeBlock", content: [{ text: commentBody, type: "text" }] }
            ]
        }
    };

    const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`JIRA API error (${resp.status}): ${errorText}`);
    }
    return await resp.json();
}

module.exports = {
    getGitHubDiff,
    getGitHubTree,
    summarizeImpact,
    generateTestCases,
    postJiraComment
};
