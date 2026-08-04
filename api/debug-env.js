module.exports = async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.COPILOT_API_KEY || '';
  
  if (!apiKey) {
    return res.status(200).json({ error: "No API key found in env variables." });
  }

  try {
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(testUrl);
    const data = await response.json();
    
    if (data.models) {
      const modelNames = data.models.map(m => m.name);
      return res.status(200).json({
        success: true,
        available_models: modelNames
      });
    } else {
      return res.status(200).json({
        success: false,
        error_details: data
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
