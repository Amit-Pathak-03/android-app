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

/**
 * Fetch JIRA ticket details including title and description
 * @param {string} jiraUrl - JIRA base URL
 * @param {string} jiraEmail - JIRA email for authentication
 * @param {string} jiraToken - JIRA API token
 * @param {string} issueKey - JIRA issue key (e.g., SCRUM-101)
 * @returns {Promise<Object>} JIRA ticket details
 */
async function getJiraTicket(jiraUrl, jiraEmail, jiraToken, issueKey) {
    console.log(`[JIRA] Fetching ticket details for ${issueKey}...`);
    
    const hostMatch = jiraUrl.match(/https?:\/\/([^/]+)/);
    if (!hostMatch) {
        throw new Error('Invalid JIRA URL format');
    }
    
    const host = hostMatch[1];
    const apiUrl = `https://${host}/rest/api/3/issue/${issueKey}`;
    const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');
    
    try {
        const resp = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            }
        });
        
        if (!resp.ok) {
            const errorText = await resp.text();
            console.error(`[JIRA] Failed to fetch ticket ${issueKey}: ${errorText}`);
            return null;
        }
        
        const issue = await resp.json();
        
        // Parse description from ADF (Atlassian Document Format) or plain text
        let description = '';
        if (issue.fields.description) {
            if (typeof issue.fields.description === 'string') {
                description = issue.fields.description;
            } else if (issue.fields.description.content) {
                // ADF format: recursively extract text from content nodes
                const extractText = (node) => {
                    if (typeof node === 'string') return node;
                    if (node.text) return node.text;
                    if (node.content && Array.isArray(node.content)) {
                        return node.content.map(extractText).join('');
                    }
                    return '';
                };
                description = issue.fields.description.content.map(extractText).join('\n');
            }
        }
        
        const ticketInfo = {
            key: issue.key,
            title: issue.fields.summary || '',
            description: description,
            status: issue.fields.status?.name || '',
            priority: issue.fields.priority?.name || '',
            issueType: issue.fields.issuetype?.name || ''
        };
        
        console.log(`[JIRA] ✅ Fetched ticket: ${ticketInfo.key} - ${ticketInfo.title}`);
        return ticketInfo;
    } catch (err) {
        console.error(`[JIRA] Error fetching ticket ${issueKey}:`, err.message);
        return null;
    }
}

async function summarizeImpact(groqKey, diff, structure, jiraTicket = null) {
    // PRE-PROCESS: Filter out ImpactX_Agent from the diff to prevent "Circular Analysis"
    const filteredDiff = (diff || '').split('diff --git ')
        .filter(file => file.trim() && !file.includes('a/ImpactX_Agent/') && !file.includes('b/ImpactX_Agent/'))
        .join('diff --git ');

    // Build prompt with JIRA ticket context if available
    let jiraContext = '';
    if (jiraTicket) {
        // Extract acceptance criteria if present in description
        const description = jiraTicket.description || '';
        const acceptanceCriteriaMatch = description.match(/(?:Acceptance Criteria|AC|Requirements?):?\s*([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i);
        const acceptanceCriteria = acceptanceCriteriaMatch ? acceptanceCriteriaMatch[1].trim() : '';
        
        jiraContext = `
[JIRA TICKET REQUIREMENTS]
Ticket: ${jiraTicket.key}
Title: ${jiraTicket.title}
Description: ${description.substring(0, 3000)}
${acceptanceCriteria ? `Acceptance Criteria:\n${acceptanceCriteria.substring(0, 2000)}` : ''}
Status: ${jiraTicket.status}
Priority: ${jiraTicket.priority}
Issue Type: ${jiraTicket.issueType}

IMPORTANT: Compare the JIRA ticket requirements with the actual code changes. Identify:
- What was requested vs what was implemented
- Missing requirements that should have been addressed (especially from Acceptance Criteria)
- Additional changes beyond the ticket scope
- Alignment between ticket description, acceptance criteria, and code changes
- For Android apps: Pay special attention to UI Impact (UI changes, user experience, loading states, error displays)
`;
    }

    const prompt = `
You are a Senior Staff Software Architect. Perform a rigorous technical impact analysis on the following code changes.
Your goal is to identify ALL potential ripple effects, logic breaks, and architectural risks in the APPLICATION code.
${jiraTicket ? 'You have access to the JIRA ticket requirements - use them to provide context-aware analysis.' : ''}

${jiraContext}

[PROJECT STRUCTURE]
${JSON.stringify(structure || [], null, 2).substring(0, 4000)}

[GIT DIFF TO ANALYZE]
${filteredDiff.substring(0, 8000)}

[ANALYSIS GUIDELINES]
1. FOCUS: Analyze the impacts of the code changes shown in the [GIT DIFF].
${jiraTicket ? '2. COMPARISON: Compare the code changes against the JIRA ticket requirements. Identify gaps, over-implementation, or misalignment.' : '2. SCOPE: Ignore the analyzer tool itself (ImpactX_Agent). Focus on the application logic.'}
3. LOGIC: If a change is only to tests or documentation, the risk score MUST be LOW.
4. DETAIL: Be specific about which files, functions, or classes are affected.
${jiraTicket ? '5. REQUIREMENTS: Check if the implementation fully addresses the ticket requirements or if critical aspects are missing.' : ''}

Return your analysis in the following JSON format ONLY:
{
  "risk": { 
    "score": "CRITICAL/HIGH/MEDIUM/LOW", 
    "reasoning": "Specify EXACTLY why this risk was chosen. ${jiraTicket ? 'Include assessment of requirements coverage.' : 'Base on the diff analysis.'}" 
  },
  "keyChanges": ["List of major changes identified"],
  "requirementsAlignment": ${jiraTicket ? `{
    "fullyAddressed": true/false,
    "missingRequirements": ["List any ticket requirements not addressed in code"],
    "additionalChanges": ["List any code changes beyond ticket scope"],
    "alignmentScore": "HIGH/MEDIUM/LOW"
  }` : 'null'},
  "technicalDetails": {
    "API Impact": "Impact on API endpoints, request/response changes",
    "Database Impact": "Database schema, queries, or data changes",
    "Logic Impact": "Business logic, algorithms, or workflow changes",
    "UI Impact": "User interface or frontend changes (if applicable)",
    "Security Impact": "Security vulnerabilities, authentication, authorization changes"
  }
}
`;

    const body = {
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: jiraTicket ? 2500 : 1500  // More tokens when analyzing requirements alignment
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
You are a Lead QA Automation Engineer. Generate comprehensive manual test cases based on the provided code changes in ${owner}/${repo}.
Generate only relevant positive, negative, edge, performance, and security test cases based on this code change. Do not force categories. Provide high-value scenarios in a table with steps and expected results. Minimum 3–4 cases, no duplicates, include regression risks and missing validations.

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
    console.log(`[JIRA] Starting postJiraComment with URL: ${jiraUrl}`);
    
    const hostMatch = jiraUrl.match(/https?:\/\/([^/]+)/);
    const keyMatch = jiraUrl.match(/browse\/([^/?]+)/);
    if (!hostMatch || !keyMatch) {
        console.error(`[JIRA] Invalid JIRA URL format. hostMatch: ${hostMatch}, keyMatch: ${keyMatch}`);
        throw new Error('Invalid JIRA URL');
    }

    const host = hostMatch[1];
    const issueKey = keyMatch[1];
    const apiUrl = `https://${host}/rest/api/3/issue/${issueKey}/comment`;
    
    console.log(`[JIRA] Extracted - Host: ${host}, Issue Key: ${issueKey}`);
    console.log(`[JIRA] API URL: ${apiUrl}`);
    console.log(`[JIRA] Email: ${jiraEmail}, Token: ${jiraToken ? '***' + jiraToken.slice(-4) : 'MISSING'}`);

    // Convert markdown text to JIRA's ADF (Atlassian Document Format)
    // Simple approach: split by double newlines for paragraphs, preserve structure
    const paragraphs = commentBody.split(/\n\n+/).filter(p => p.trim());
    const content = [];
    
    for (const para of paragraphs) {
        const lines = para.split('\n').filter(l => l.trim());
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            // Simple markdown to ADF conversion
            let text = trimmed;
            const parts = [];
            
            // Handle bold (**text**)
            const boldRegex = /\*\*([^*]+)\*\*/g;
            let lastIndex = 0;
            let match;
            
            while ((match = boldRegex.exec(text)) !== null) {
                if (match.index > lastIndex) {
                    parts.push({ type: "text", text: text.substring(lastIndex, match.index) });
                }
                parts.push({ type: "text", text: match[1], marks: [{ type: "strong" }] });
                lastIndex = match.index + match[0].length;
            }
            if (lastIndex < text.length) {
                parts.push({ type: "text", text: text.substring(lastIndex) });
            }
            
            // If no bold found, use plain text
            if (parts.length === 0) {
                parts.push({ type: "text", text: text });
            }
            
            content.push({
                type: "paragraph",
                content: parts
            });
        }
    }
    
    // Fallback if no content
    if (content.length === 0) {
        content.push({
            type: "paragraph",
            content: [{ type: "text", text: commentBody }]
        });
    }

    const body = {
        body: {
            type: "doc",
            version: 1,
            content: content
        }
    };

    console.log(`[JIRA] Request body prepared, content items: ${content.length}`);
    console.log(`[JIRA] Sending POST request to ${apiUrl}...`);

    const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');
    const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    console.log(`[JIRA] Response status: ${resp.status} ${resp.statusText}`);

    if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`[JIRA] API Error Response: ${errorText}`);
        throw new Error(`JIRA API error (${resp.status}): ${errorText}`);
    }
    
    const result = await resp.json();
    console.log(`[JIRA] ✅ Comment posted successfully. Comment ID: ${result.id || 'N/A'}`);
    return result;
}

module.exports = {
    getGitHubDiff,
    getGitHubTree,
    summarizeImpact,
    generateTestCases,
    postJiraComment,
    getJiraTicket
};

