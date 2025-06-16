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
        const googleSearchTool = GoogleSearch; 
        
        // Model for performing the search (with the tool)
        // Ensure GoogleSearch tool is provided to the model.
        const searchModel = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            tools: [googleSearchTool] 
        });

        // 1. Reverted to natural language prompt to let the model decide to use the tool.
        // The model should use the 'google_search_search' tool based on this prompt.
        const searchRequestPayload = {
            contents: [{
                role: "user",
                parts: [{ text: `Search the web for: "${query}".` }] 
            }]
        };

        // This call, with the model configured with tools, should now execute the tool automatically
        // and populate searchResponse.toolResults.
        const searchResult = await searchModel.generateContent(searchRequestPayload);
        const searchResponse = searchResult.response;

        let detailedSearchResults = null;
        let aiSummary = null; // This will now hold the raw formatted results for debugging

        // Strictly check for toolResults, which will contain the output of the executed tool.
        if (searchResponse.toolResults && searchResponse.toolResults.length > 0) {
            const firstToolResult = searchResponse.toolResults[0];
            
            // Verify that the tool executed was indeed google_search_search
            if (firstToolResult.functionCall && firstToolResult.functionCall.name === "google_search_search") {
                detailedSearchResults = firstToolResult.functionResponse.json();
                console.log("Raw Google Search results obtained:", JSON.stringify(detailedSearchResults, null, 2));

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
                    console.log("Formatted raw results for AI Summary:", aiSummary);

                } else {
                    aiSummary = "No relevant search results found on the web for the query.";
                    console.log("No detailed search results found in the tool response.");
                }
            } else {
                // If a tool call occurred but it wasn't the expected google_search_search tool
                aiSummary = `The AI called an unexpected tool: ${firstToolResult.functionCall?.name || 'unknown'}.`;
                console.warn("Expected google_search_search tool call but got:", firstToolResult.functionCall?.name, JSON.stringify(searchResponse, null, 2));
            }
        } else {
            // This case now means the model did NOT decide to use the tool, and might have replied with text directly.
            aiSummary = "The AI did not perform a Google Search tool call (model chose not to use it).";
            if (searchResponse.text()) {
                aiSummary += ` Direct AI text response: "${searchResponse.text()}"`; // Include direct AI text for more context
            }
            console.warn("No toolResults found after natural language prompt. Model might not have used the tool. Full response:", JSON.stringify(searchResponse, null, 2));
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
                    message: 'The AI could not generate a summary for your search.', 
                    aiSummary: null 
                }),
            };
        }

    } catch (error) {
        console.error('Detailed Error in Netlify Google Search Function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                message: `Error performing web search: ${error.message || 'An unknown error occurred.'}`, 
                errorDetails: error.toString() 
            }),
        };
    }
};
