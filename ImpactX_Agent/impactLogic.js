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
    return (json.tree || []).map(i => ({ path: i.path, type: i.type === 'tree' ? 'directory' : 'file' })).slice(0, 300);
}

async function summarizeImpact(groqKey, diff, structure) {
    const prompt = `
You are a Senior Staff Software Architect. Perform a rigorous technical impact analysis on the following code changes.
Your goal is to identify ALL potential ripple effects, logic breaks, and architectural risks.

[PROJECT STRUCTURE]
${JSON.stringify(structure || [], null, 2).substring(0, 4000)}

[GIT DIFF TO ANALYZE]
${diff.substring(0, 8000)}

[ANALYSIS GUIDELINES]
1. Logic & State: How do these changes affect the flow of data or internal state?
2. API & Integration: Are there breaking changes to signatures or payloads?
3. Data Persistence: Does it affect database schemas or performance?
4. UI & Side Effects: Will this break existing UI components?
5. Security: Does it introduce new vulnerabilities?

Return your analysis in the following JSON format ONLY:
{
  "risk": { "score": "CRITICAL/HIGH/MEDIUM/LOW", "reasoning": "..." },
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
        console.log(`Bearer ${groqKey}`);
        throw new Error('No Groq API Key provided for impact analysis');
    }

    const json = await response.json();
    if (!response.ok) throw new Error(`AI API error: ${JSON.stringify(json)} + ${groqKey}`);
    return json.choices[0].message.content.trim();
}

async function generateTestCases(openRouterKey, diff, structure, owner, repo) {
    const prompt = `
Generate 8-10 manual test cases based on these code changes in ${owner}/${repo}.
STRUCTURE: ${JSON.stringify((structure || []).slice(0, 50))}
DIFF: ${diff.substring(0, 5000)}

Format as JSON:
{
  "summary": "...",
  "testCases": [
    { "title": "...", "steps": ["..."], "expectedResult": "...", "priority": "HIGH/MEDIUM/LOW" }
  ]
}
`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'ImpactX-Agent'
        },
        body: JSON.stringify({
            model: 'mistralai/mistral-7b-instruct:free',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: "json_object" }
        })
    });

    const json = await response.json();
    if (!response.ok) throw new Error(`OpenRouter error: ${JSON.stringify(json)}`);
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
