// netlify/functions/google-search.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleSearch } = require('@google/generative-ai/tools'); // Import the GoogleSearch tool

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        const { query } = JSON.parse(event.body);

        const API_KEY = process.env.GEMINI_API_KEY; // Using the same API key, but for google_search tool

        if (!API_KEY) {
            console.error("GEMINI_API_KEY environment variable is not set for google-search function.");
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Server configuration error: API key not found for search.' }),
            };
        }

        const genAI = new GoogleGenerativeAI(API_KEY);
        // Initialize the GoogleSearch tool
        const googleSearchTool = new GoogleSearch(); 
        
        // Use gemini-2.0-flash which supports tools, and explicitly provide the GoogleSearch tool
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            tools: [googleSearchTool] // Provide the tool directly to the model instance
        });

        // Build the payload to tell the AI to use the google_search tool directly
        // This is a direct invocation of the tool through the model's generateContent
        const requestPayload = {
            contents: [{
                role: "user",
                parts: [{ text: `Perform a web search for: ${query}` }] 
            }]
        };

        const result = await model.generateContent(requestPayload);
        const response = result.response;

        // The response should contain the actual tool output if the model decides to use it and the environment executes it.
        // The GoogleSearch tool (from @google/generative-ai/tools) will directly return search results.
        // We need to check for the output in the `toolResults` property of the response.

        let searchResults = null;
        let aiSummary = null;

        if (response.text()) {
            aiSummary = response.text(); // Capture any AI-generated summary text
        }

        if (response.toolResults && response.toolResults.length > 0) {
            // Assuming the first tool result is from our Google Search
            const firstToolResult = response.toolResults[0];
            if (firstToolResult.functionCall && firstToolResult.functionCall.name === "google_search_search") {
                // The actual search results are in `firstToolResult.functionResponse.json()`
                // The structure for Google Search is typically `perQueryResult` array
                searchResults = firstToolResult.functionResponse.json();
                console.log("Google Search results obtained:", JSON.stringify(searchResults, null, 2));
            }
        }

        if (searchResults && searchResults.results && searchResults.results.length > 0) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ searchResults: searchResults, aiSummary: aiSummary }), // Return searchResults
            };
        } else {
            console.warn("No search results or no specific toolResults found for query:", query, "Response:", JSON.stringify(response, null, 2));
            return {
                statusCode: 200, // Still return 200, but indicate no results
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'No relevant search results found.', searchResults: null, aiSummary: aiSummary }),
            };
        }

    } catch (error) {
        console.error('Error in Netlify Google Search Function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error performing web search', error: error.message }),
        };
    }
};
