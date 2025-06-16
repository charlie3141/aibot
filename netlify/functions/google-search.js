// netlify/functions/google-search.js

// Import necessary modules
const { GoogleGenerativeAI } = require('@google/generative-ai');
// Removed direct import of GoogleSearch as it seems to be causing constructor issues

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
        
        // Define the google_search tool directly in functionDeclarations
        const googleSearchToolDefinition = {
            functionDeclarations: [
                {
                    name: "google_search_search",
                    description: "Searches the web for information.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            queries: {
                                type: "ARRAY",
                                items: { type: "STRING" },
                                description: "A list of search queries."
                            }
                        },
                        required: ["queries"]
                    }
                }
            ]
        };

        // Model configured with the tool definition
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            tools: [googleSearchToolDefinition] // Provide the tool definition
        });

        // Prompt the model to use the search tool naturally
        const requestPayload = {
            contents: [{
                role: "user",
                parts: [{ text: `Search the web for "${query}".` }] 
            }]
        };

        const result = await model.generateContent(requestPayload);
        const response = result.response;

        let detailedSearchResults = null;
        let aiSummary = null; // This will now hold the raw formatted results for debugging

        // Check for toolResults (output of the executed tool)
        if (response.toolResults && response.toolResults.length > 0) {
            const firstToolResult = response.toolResults[0];
            
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
                    console.log("Formatted raw results for AI Summary (debugging mode):", aiSummary);

                } else {
                    aiSummary = "No relevant search results found on the web for the query.";
                    console.log("No detailed search results found from the tool response.");
                }
            } else {
                aiSummary = `The AI used an unexpected tool: ${firstToolResult.functionCall?.name || 'unknown'}.`;
                console.warn("Expected google_search_search tool call but got:", firstToolResult.functionCall?.name, JSON.stringify(response, null, 2));
            }
        } else {
            // This case means the model did NOT decide to use the tool, or it returned a direct text response.
            aiSummary = "The AI did not perform a Google Search tool call (model chose not to use it).";
            if (response.text()) {
                aiSummary += ` Direct AI text response: "${response.text()}"`; // Include direct AI text for more context
            }
            console.warn("No toolResults found. Model might not have used the tool. Full response:", JSON.stringify(response, null, 2));
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
