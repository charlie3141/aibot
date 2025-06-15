// netlify/functions/chat-gemini.js

// Import necessary modules
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Main handler for the Netlify Function
exports.handler = async function(event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        // Parse the request body from the frontend
        const { contents } = JSON.parse(event.body);

        // Access the API key securely from Netlify environment variables
        // You MUST set a Netlify environment variable named GEMINI_API_KEY with your actual API key
        const API_KEY = process.env.GEMINI_API_KEY;

        if (!API_KEY) {
            console.error("GEMINI_API_KEY environment variable is not set.");
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Server configuration error: API key not found.' }),
            };
        }

        // Initialize Google Generative AI with your API key
        const genAI = new GoogleGenerativeAI(API_KEY);
        // Use the gemini-pro model for text-only interactions
        // For image input, you would use gemini-pro-vision, but the current chat history format
        // is compatible with both.
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Generate content using the provided chat history
        const result = await model.generateContent({ contents });
        const response = await result.response;
        const text = response.text();

        // Return the AI's response to the frontend
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                geminiResponse: response.candidates[0], // Sending back the whole candidate object
                fullText: text // Also sending just the text for convenience
            }),
        };
    } catch (error) {
        console.error('Error in Netlify Function:', error);
        // Return an error response to the frontend
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error processing request', error: error.message }),
        };
    }
};
