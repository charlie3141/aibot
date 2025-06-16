// netlify/functions/google-search.js

// Import necessary modules
// The GoogleSearch tool is part of the main @google/generative-ai package
const { GoogleGenerativeAI, GoogleSearch } = require('@google/generative-ai');

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
        };

        const genAI = new GoogleGenerativeAI(API_KEY);
        // Corrected: GoogleSearch is directly the tool object, not a constructor to be instantiated with 'new'.
        const googleSearchTool = GoogleSearch; 
        
        // Use gemini-2.0-flash which supports tools, and explicitly provide the GoogleSearch tool
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            tools: [googleSearchTool] // Provide the tool directly to the model instance
        });

        // Build the payload to tell the AI to use the google_search tool directly
        // We explicitly ask the model to perform a search AND summarize the top results.
        const requestPayload = {
            contents: [{
                role: "user",
                parts: [{ text: `Perform a web search for: "${query}". Provide a concise summary of the top results.` }] 
            }]
        };

        const result = await model.generateContent(requestPayload);
        const response = result.response;

        let aiSummary = null;
        let detailedSearchResults = null; // We can keep this if needed for debugging/future display

        // Check for AI-generated text summary first
        if (response.text()) {
            aiSummary = response.text();
            console.log("AI Summary received:", aiSummary);
        }

        // Optionally, if you still want to inspect raw tool results (e.g., for debugging)
        // Note: `toolResults` are typically present if the model explicitly suggests a tool call
        // and it's then executed and the results are passed back to `generateContent` in a subsequent turn.
        // When using `tools: [GoogleSearchTool]` on `getGenerativeModel`, the library often handles
        // the tool execution and result integration transparently, leading directly to `response.text()`.
        if (response.toolResults && response.toolResults.length > 0) {
            console.log("Raw toolResults (for debugging):", JSON.stringify(response.toolResults, null, 2));
            const firstToolResult = response.toolResults[0];
            if (firstToolResult.functionCall && firstToolResult.functionCall.name === "google_search_search") {
                 detailedSearchResults = firstToolResult.functionResponse.json();
            }
        }


        if (aiSummary) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    aiSummary: aiSummary, 
                    searchResults: detailedSearchResults // Include detailed results if available, for frontend to process
                }), 
            };
        } else {
            console.warn("No AI summary received for search query:", query, "Full Gemini API Response:", JSON.stringify(response, null, 2));
            return {
                statusCode: 200, // Still return 200, but indicate no successful AI summary
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: 'The AI did not generate a summary for your search. This might mean no relevant results were found, or there was an issue processing them.', 
                    searchResults: detailedSearchResults, // Still pass along raw results if any
                    aiSummary: null 
                }),
            };
        }

    } catch (error) {
        console.error('Detailed Error in Netlify Google Search Function:', error); // Log the full error object
        // Return a more descriptive error message to the frontend
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                message: `Error performing web search: ${error.message || 'An unknown error occurred.'}`, 
                errorDetails: error.toString() 
            }),
        };
    }
};
