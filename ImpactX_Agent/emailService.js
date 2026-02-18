const nodemailer = require('nodemailer');

/**
 * Email Service for ImpactX Agent
 * Sends analysis reports and test cases via SMTP
 */
async function sendImpactEmail(config, pr, analysis, testCases) {
    const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_TO } = config;

    if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS || !EMAIL_TO) {
        console.log('[EmailService] Email configuration incomplete. Skipping email.');
        return;
    }

    const transporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: parseInt(EMAIL_PORT || '587'),
        secure: EMAIL_PORT === '465', // true for 465, false for other ports
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS,
        },
    });

    const subject = `🚀 ImpactX Report: PR #${pr.number} Merged to ${pr.base.ref}`;

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
      <h2 style="color: #0052cc; border-bottom: 2px solid #0052cc; padding-bottom: 10px;">ImpactX AI Analysis Report</h2>
      
      <p><strong>Pull Request:</strong> <a href="${pr.html_url}">#${pr.number} - ${pr.title}</a></p>
      <p><strong>Repository:</strong> ${pr.base.repo.full_name}</p>
      <p><strong>Merge:</strong> <code>${pr.head.ref}</code> &rarr; <code>${pr.base.ref}</code></p>
      
      <div style="background: #f4f7fb; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #d04437;">Risk Assessment: ${analysis.risk?.score || 'IDENTIFIED'}</h3>
        <p><strong>Reasoning:</strong> ${analysis.risk?.reasoning || 'No details provided.'}</p>
      </div>
      
      <h3>🛠 Technical Impacts</h3>
      <ul>
        <li><strong>API:</strong> ${analysis.technicalDetails?.["API Impact"] || 'N/A'}</li>
        <li><strong>Database:</strong> ${analysis.technicalDetails?.["Database Impact"] || 'N/A'}</li>
        <li><strong>Logic:</strong> ${analysis.technicalDetails?.["Logic Impact"] || 'N/A'}</li>
        <li><strong>Security:</strong> ${analysis.technicalDetails?.["Security Impact"] || 'N/A'}</li>
      </ul>
      
      <h3>🧪 Suggested Test Cases</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <thead>
          <tr style="background: #f2f2f2;">
            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Priority</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Title</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Expected Result</th>
          </tr>
        </thead>
        <tbody>
          ${(testCases.testCases || []).map(tc => `
            <tr>
              <td style="border: 1px solid #ddd; padding: 10px;">
                <span style="padding: 2px 6px; border-radius: 3px; background: ${tc.priority === 'HIGH' ? '#ffebe6' : '#fff0b3'}; color: ${tc.priority === 'HIGH' ? '#bf2600' : '#856605'}; font-size: 12px; font-weight: bold;">
                  ${tc.priority}
                </span>
              </td>
              <td style="border: 1px solid #ddd; padding: 10px;">${tc.title}</td>
              <td style="border: 1px solid #ddd; padding: 10px;">${tc.expectedResult}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <p style="margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px; font-size: 12px; color: #777;">
        Sent automatically by ImpactX Standalone Agent.
      </p>
    </div>
  `;

    try {
        const info = await transporter.sendMail({
            from: `"ImpactX Agent" <${EMAIL_USER}>`,
            to: EMAIL_TO,
            subject: subject,
            html: htmlContent,
        });
        console.log(`[EmailService] Email sent successfully: ${info.messageId}`);
    } catch (err) {
        console.error(`[EmailService] Failed to send email:`, err.message);
    }
}

module.exports = { sendImpactEmail };
