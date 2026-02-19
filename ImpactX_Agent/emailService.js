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

  const status = pr.merged ? 'Merged to' : 'Analysis for';
  const subject = `🚀 ImpactX Report: PR #${pr.number} ${status} ${pr.base.ref}`;

  const riskColors = {
    'CRITICAL': { bg: '#ffebee', text: '#c62828', border: '#ef9a9a' },
    'HIGH': { bg: '#fff3e0', text: '#ef6c00', border: '#ffcc80' },
    'MEDIUM': { bg: '#fffde7', text: '#fbc02d', border: '#fff59d' },
    'LOW': { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
    'DEFAULT': { bg: '#f5f5f5', text: '#616161', border: '#e0e0e0' }
  };

  const risk = (analysis.risk?.score || 'DEFAULT').toUpperCase();
  const colors = riskColors[risk] || riskColors.DEFAULT;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f9fc; margin: 0; padding: 20px; }
        .container { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e6e9ef; }
        .header { background: linear-gradient(135deg, #1a237e 0%, #3f51b5 100%); color: #ffffff; padding: 30px 40px; text-align: left; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; }
        .header p { margin: 8px 0 0; opacity: 0.8; font-size: 14px; }
        
        .content { padding: 30px 40px; }
        
        .section-title { font-size: 13px; text-transform: uppercase; color: #718096; font-weight: 700; letter-spacing: 1px; margin-bottom: 16px; border-bottom: 1px solid #edf2f7; padding-bottom: 8px; display: flex; align-items: center; }
        .section-title span { margin-right: 8px; }
        
        .risk-card { background-color: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
        .risk-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; background-color: ${colors.text}; color: #ffffff; font-size: 12px; font-weight: 700; margin-bottom: 10px; }
        .risk-score { font-size: 20px; font-weight: 700; color: ${colors.text}; margin: 0 0 8px; }
        .risk-reasoning { font-size: 14px; color: #4a5568; line-height: 1.5; margin: 0; }
        
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .info-item { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #edf2f7; }
        .info-label { font-size: 11px; color: #718096; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
        .info-value { font-size: 14px; color: #2d3748; font-weight: 500; }
        .info-value code { background: #e2e8f0; padding: 2px 4px; border-radius: 4px; font-size: 12px; }

        .impact-list { list-style: none; padding: 0; margin: 0 0 30px; }
        .impact-item { display: flex; align-items: flex-start; margin-bottom: 16px; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #edf2f7; }
        .impact-icon { font-size: 20px; margin-right: 15px; min-width: 24px; text-align: center; }
        .impact-content h4 { margin: 0 0 4px; font-size: 14px; color: #2d3748; }
        .impact-content p { margin: 0; font-size: 13px; color: #718096; line-height: 1.4; }

        .test-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 20px; border: 1px solid #edf2f7; border-radius: 8px; overflow: hidden; }
        .test-table th { background: #f8fafc; text-align: left; padding: 12px 15px; font-size: 12px; color: #718096; text-transform: uppercase; font-weight: 700; border-bottom: 1px solid #edf2f7; }
        .test-table td { padding: 12px 15px; font-size: 13px; color: #2d3748; border-bottom: 1px solid #edf2f7; background: #ffffff; }
        .test-table tr:last-child td { border-bottom: none; }
        
        .priority-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; }
        .priority-high { background: #ffebee; color: #c62828; }
        .priority-medium { background: #fff3e0; color: #ef6c00; }
        .priority-low { background: #e8f5e9; color: #2e7d32; }

        .btn { display: inline-block; padding: 12px 24px; background-color: #3f51b5; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 20px; box-shadow: 0 2px 4px rgba(63, 81, 181, 0.2); }
        .footer { padding: 20px 40px; background: #f8fafc; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>ImpactX AI Analysis</h1>
          <p>Automated Assessment for PR #${pr.number} &bull; ${pr.base.repo.name}</p>
        </div>
        
        <div class="content">
          <div class="risk-card">
            <span class="risk-badge">${risk} RISK</span>
            <p class="risk-reasoning">${analysis.risk?.reasoning || 'No details provided.'}</p>
          </div>

          <div class="section-title"><span>📋</span> Pull Request Details</div>
          <div style="display: table; width: 100%; margin-bottom: 30px;">
            <div style="display: table-row;">
              <div style="display: table-cell; width: 50%; padding-right: 10px;">
                <div class="info-item">
                  <div class="info-label">Title</div>
                  <div class="info-value">${pr.title}</div>
                </div>
              </div>
              <div style="display: table-cell; width: 50%; padding-left: 10px;">
                <div class="info-item">
                  <div class="info-label">Status</div>
                  <div class="info-value">${pr.merged ? '✅ Merged' : '🕒 Open'}</div>
                </div>
              </div>
            </div>
            <div style="display: table-row;">
              <div style="display: table-cell; width: 100%; padding-top: 15px;" colspan="2">
                <div class="info-item">
                  <div class="info-label">Proposed Change</div>
                  <div class="info-value"><code>${pr.head.ref}</code> &rarr; <code>${pr.base.ref}</code></div>
                </div>
              </div>
            </div>
          </div>

          <div class="section-title"><span>📝</span> Key Changes</div>
          <ul style="padding: 0; margin: 0 0 30px; list-style: none;">
            ${(analysis.keyChanges || []).map(change => `
              <li style="padding: 10px; margin-bottom: 8px; background: #fff; border: 1px solid #edf2f7; border-radius: 6px; font-size: 13px; color: #4a5568;">
                ${change}
              </li>
            `).join('')}
          </ul>

          <div class="section-title"><span>🛠</span> Technical Impacts</div>
          <div class="impact-list">
            <div class="impact-item">
              <div class="impact-icon">🔌</div>
              <div class="impact-content">
                <h4>API & Integration</h4>
                <p>${analysis.technicalDetails?.["API Impact"] || 'No significant impact detected.'}</p>
              </div>
            </div>
            <div class="impact-item">
              <div class="impact-icon">🗄</div>
              <div class="impact-content">
                <h4>Database & Persistence</h4>
                <p>${analysis.technicalDetails?.["Database Impact"] || 'No significant impact detected.'}</p>
              </div>
            </div>
            <div class="impact-item">
              <div class="impact-icon">🧠</div>
              <div class="impact-content">
                <h4>Business Logic</h4>
                <p>${analysis.technicalDetails?.["Logic Impact"] || 'No significant impact detected.'}</p>
              </div>
            </div>
            <div class="impact-item">
              <div class="impact-icon">🛡</div>
              <div class="impact-content">
                <h4>Security & Compliance</h4>
                <p>${analysis.technicalDetails?.["Security Impact"] || 'No significant impact detected.'}</p>
              </div>
            </div>
          </div>

          <div class="section-title"><span>🧪</span> Suggested Test Cases</div>
          <table class="test-table">
            <thead>
              <tr>
                <th style="width: 80px;">Priority</th>
                <th>Test Scenario</th>
                <th>Expected Outcome</th>
              </tr>
            </thead>
            <tbody>
              ${(testCases.testCases || []).map(tc => `
                <tr>
                  <td style="vertical-align: top;">
                    <span class="priority-badge priority-${(tc.priority || 'low').toLowerCase()}">
                      ${tc.priority || 'LOW'}
                    </span>
                  </td>
                  <td style="vertical-align: top;">
                    <div style="font-weight: 700; color: #2d3748; margin-bottom: 8px;">${tc.title}</div>
                    <div style="font-size: 11px; color: #718096; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Steps to execute:</div>
                    <ol style="margin: 0; padding-left: 18px; font-size: 12px; color: #4a5568;">
                      ${(tc.steps || []).map(step => `<li style="margin-bottom: 4px;">${step}</li>`).join('')}
                    </ol>
                  </td>
                  <td style="vertical-align: top; color: #2e7d32; font-weight: 500;">
                    ${tc.expectedResult}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div style="text-align: center;">
            <a href="${pr.html_url}" class="btn">Review Changes on GitHub</a>
          </div>
        </div>
        
        <div class="footer">
          This report was generated by <strong>ImpactX Standalone Agent</strong>.<br>
          DeepMind AI Impact Analysis &bull; ${new Date().toLocaleDateString()}
        </div>
      </div>
    </body>
    </html>
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
