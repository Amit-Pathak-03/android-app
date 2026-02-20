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

/**
 * Generate and create test cases directly in AIO TCMS
 * This function generates test cases using AI and automatically creates them in AIO
 * @param {string} groqKey - Groq API key for AI generation
 * @param {string} diff - Git diff content
 * @param {Array} structure - Project structure/tree
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} aioBaseUrl - Base URL for AIO API
 * @param {string} aioApiKey - API key/token for authentication
 * @param {string} projectId - Project ID in AIO where test cases should be created
 * @param {string} jiraKey - Optional JIRA key to link test cases
 * @returns {Promise<Array>} Array of created test case IDs
 */
async function generateAndCreateAioTestCases(groqKey, diff, structure, owner, repo, aioBaseUrl, aioApiKey, projectId, jiraKey = null) {
    console.log(`[AIO] 🧪 Generating test cases for AIO TCMS...`);
    
    // Generate test cases using AI
    const testCasesJson = await generateTestCases(groqKey, diff, structure, owner, repo);
    const testCasesData = JSON.parse(testCasesJson);
    
    if (!testCasesData.testCases || testCasesData.testCases.length === 0) {
        console.log(`[AIO] ⚠️  No test cases generated by AI`);
        return [];
    }
    
    console.log(`[AIO] ✅ Generated ${testCasesData.testCases.length} test cases. Creating in AIO...`);
    
    // Now create them in AIO
    return await createAioTestCases(aioBaseUrl, aioApiKey, projectId, testCasesData.testCases, jiraKey);
}

/**
 * Create test cases in AIO TCMS
 * @param {string} aioBaseUrl - Base URL for AIO API (e.g., https://aio.example.com/api)
 * @param {string} aioApiKey - API key/token for authentication
 * @param {string} projectId - Project ID in AIO where test cases should be created
 * @param {Array} testCases - Array of test case objects with title, steps, expectedResult, priority
 * @param {string} jiraKey - Optional JIRA key to link test cases
 * @returns {Promise<Array>} Array of created test case IDs
 */
async function createAioTestCases(aioBaseUrl, aioApiKey, projectId, testCases, jiraKey = null) {
    console.log(`[AIO] Starting test case creation. Count: ${testCases.length}, Project: ${projectId}`);
    
    if (!aioBaseUrl || !aioApiKey || !projectId) {
        throw new Error('AIO configuration incomplete. Required: AIO_BASE_URL, AIO_API_KEY, AIO_PROJECT_ID');
    }

    const createdCases = [];
    const baseUrl = aioBaseUrl.endsWith('/') ? aioBaseUrl.slice(0, -1) : aioBaseUrl;
    
    // AIO API endpoint for creating test cases
    // Adjust the endpoint path based on your AIO API documentation
    const createEndpoint = `${baseUrl}/testcases`; // Common endpoint pattern
    
    for (const testCase of testCases) {
        try {
            // Map priority to AIO priority format (adjust based on AIO's priority values)
            const priorityMap = {
                'HIGH': 'High',
                'MEDIUM': 'Medium',
                'LOW': 'Low'
            };
            const aioPriority = priorityMap[testCase.priority] || 'Medium';

            // Format test case body for AIO
            // Adjust the structure based on your AIO API requirements
            const testCaseBody = {
                projectId: projectId,
                title: testCase.title,
                description: testCase.expectedResult || '',
                steps: testCase.steps || [],
                priority: aioPriority,
                // Add additional fields if your AIO API requires them
                // linkedIssue: jiraKey, // If AIO supports linking to JIRA
                // tags: ['auto-generated', 'impactx'],
                // status: 'Draft' // or 'Active' based on your workflow
            };

            console.log(`[AIO] Creating test case: "${testCase.title}"`);

            const resp = await fetch(createEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${aioApiKey}`, // or 'Api-Key ${aioApiKey}' depending on AIO
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(testCaseBody)
            });

            console.log(`[AIO] Response status: ${resp.status} ${resp.statusText}`);

            if (!resp.ok) {
                const errorText = await resp.text();
                console.error(`[AIO] Failed to create test case "${testCase.title}": ${errorText}`);
                throw new Error(`AIO API error (${resp.status}): ${errorText}`);
            }

            const result = await resp.json();
            const testCaseId = result.id || result.testCaseId || result.data?.id;
            createdCases.push({
                id: testCaseId,
                title: testCase.title,
                original: testCase
            });
            
            console.log(`[AIO] ✅ Created test case: ${testCaseId} - "${testCase.title}"`);

        } catch (err) {
            console.error(`[AIO] ❌ Error creating test case "${testCase.title}":`, err.message);
            // Continue with other test cases even if one fails
        }
    }

    console.log(`[AIO] ✅ Successfully created ${createdCases.length}/${testCases.length} test cases`);
    return createdCases;
}

module.exports = {
    getGitHubDiff,
    getGitHubTree,
    summarizeImpact,
    generateTestCases,
    postJiraComment,
    createAioTestCases,
    generateAndCreateAioTestCases
};
