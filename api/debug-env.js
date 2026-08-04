module.exports = async (req, res) => {
  const provider = process.env.COPILOT_PROVIDER || 'not set';
  const model = process.env.COPILOT_MODEL || 'not set';
  const apiKey = process.env.GEMINI_API_KEY || process.env.COPILOT_API_KEY || '';

  const apiKeyDetails = apiKey 
    ? `Set (Length: ${apiKey.length}, Prefix: ${apiKey.substring(0, 6)}...)` 
    : 'Not set';

  let testResult = '';
  if (apiKey) {
    try {
      // Test direct call to Gemini ListModels API
      const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const response = await fetch(testUrl);
      const data = await response.json();
      testResult = JSON.stringify(data).substring(0, 1000);
    } catch (err) {
      testResult = `Error fetching: ${err.message}`;
    }
  }

  res.status(200).json({
    COPILOT_PROVIDER: provider,
    COPILOT_MODEL: model,
    API_KEY_STATUS: apiKeyDetails,
    GEMINI_TEST_RESPONSE: testResult
  });
};
