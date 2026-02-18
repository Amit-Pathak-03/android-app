require('dotenv').config();
const emailService = require('../emailService');

/**
 * Manual Test Script for Email Functionality
 * This script sends a real email using the credentials in your .env file
 */
async function runEmailTest() {
    console.log('🧪 Starting manual email test...');

    // 1. Mock Data for Test
    const pr = {
        number: 999,
        title: 'Test PR: Added Awesome Feature',
        html_url: 'https://github.com/example/repo/pull/999',
        base: {
            ref: 'master',
            repo: { full_name: 'test-org/test-repo' }
        },
        head: { ref: 'feature/awesome-stuff' }
    };

    const analysis = {
        risk: {
            score: 'MEDIUM',
            reasoning: 'This is a test analysis generated to verify the email formatting logic.'
        },
        technicalDetails: {
            'API Impact': 'No breaking changes detected in this test.',
            'Database Impact': 'Tested schema migration logic.',
            'Logic Impact': 'Refined the notification subsystem.',
            'Security Impact': 'Verified authentication headers.'
        }
    };

    const testCases = {
        testCases: [
            { priority: 'HIGH', title: 'Verify UI Rendering', expectedResult: 'Dashboard renders correctly' },
            { priority: 'MEDIUM', title: 'Check API Response', expectedResult: 'Status 200 returned' }
        ]
    };

    // 2. Configuration from .env
    const config = {
        EMAIL_HOST: process.env.EMAIL_HOST,
        EMAIL_PORT: process.env.EMAIL_PORT,
        EMAIL_USER: process.env.EMAIL_USER,
        EMAIL_PASS: process.env.EMAIL_PASS,
        EMAIL_TO: process.env.EMAIL_TO
    };

    // 3. Trigger Email
    try {
        console.log(`📡 Attempting to send test email to: ${config.EMAIL_TO}...`);
        await emailService.sendImpactEmail(config, pr, analysis, testCases);
        console.log('✅ Manual test complete. Check your inbox!');
    } catch (err) {
        console.error('❌ Manual test failed:', err.message);
    }
}

runEmailTest();
