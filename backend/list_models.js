require('dotenv').config();
const axios = require('axios');

async function listModels() {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const response = await axios.get(url);
        console.log('Available Models:');
        response.data.models.forEach(m => console.log(`- ${m.name}`));
    } catch (error) {
        console.error('Failed to list models:', error.response?.data || error.message);
    }
}

listModels();
