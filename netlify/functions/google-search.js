// netlify/functions/google-search.js

// Import necessary modules
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

        const API_KEY = process.env.GEMINI_API_KEY;

        if (!API_KEY) {
            console.error("GEMINI_API_KEY environment variable is not set for google-search function.");
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Server configuration error: API key not found for search.' }),
            };
        };

        const genAI = new GoogleGenerativeAI(API_KEY);
        // Correctly instantiate GoogleSearch for direct use
        const googleSearchToolInstance = new GoogleSearch(); 
        
        // --- DEBUGGING MODE: DIRECTLY CALL THE SEARCH TOOL ---
        // This explicitly executes the Google Search tool, bypassing the model's decision.
        const searchResultsArray = await googleSearchToolInstance.search({ queries: [query] });
        
        // The Google Search tool returns an array of SearchResults, each with a 'results' array
        // For a single query, searchResultsArray[0] will contain the results for that query.
        const detailedSearchResults = searchResultsArray && searchResultsArray.length > 0 ? searchResultsArray[0] : null;

        let aiSummary = null; // This will now hold the raw formatted results for debugging

        if (detailedSearchResults && detailedSearchResults.results && detailedSearchResults.results.length > 0) {
            // Debugging mode: Format the top 10 results directly for display
            const topResults = detailedSearchResults.results.slice(0, 10); 
            
            let formattedResults = `--- Raw Top ${topResults.length} Search Results for "${query}" ---\n\n`;
            topResults.forEach((item, index) => {
                formattedResults += `**${index + 1}. ${item.source_title || 'N/A'}**\n`;
                formattedResults += `Snippet: ${item.snippet || 'N/A'}\n`;
                formattedResults += `URL: ${item.url || 'N/A'}\n\n`;
            });
            aiSummary = formattedResults; // Assign formatted raw results to aiSummary
            console.log("Formatted raw results for AI Summary (debugging mode):", aiSummary);

        } else {
            aiSummary = "No relevant search results found on the web for the query (direct tool call).";
            console.log("No detailed search results found from direct tool call.");
        }

        if (aiSummary) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    aiSummary: aiSummary, 
                    // detailedSearchResults: detailedSearchResults // Not directly used by frontend now, but available for internal logging
                }), 
            };
        } else {
            // This case should be rare with the updated logic, but as a fallback
            return {
                statusCode: 200, 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: 'The search could not be performed or summarized.', 
                    aiSummary: null 
                }),
            };
        }

    } catch (error) {
        console.error('Detailed Error in Netlify Google Search Function (Direct Tool Call):', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                message: `Error performing web search: ${error.message || 'An unknown error occurred.'}`, 
                errorDetails: error.toString() 
            }),
        };
    }
};
