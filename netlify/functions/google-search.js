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
        const searchModel = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            tools: [googleSearchTool] 
        });

        // 1. First step: Ask the model to perform a web search using the tool.
        const searchRequestPayload = {
            contents: [{
                role: "user",
                parts: [{ text: `Perform a web search for: "${query}".` }] 
            }]
        };

        const searchResult = await searchModel.generateContent(searchRequestPayload);
        const searchResponse = searchResult.response;

        let detailedSearchResults = null;
        let aiSummary = null;

        // Extract raw search results if the tool was called and returned results
        if (searchResponse.toolResults && searchResponse.toolResults.length > 0) {
            const firstToolResult = searchResponse.toolResults[0];
            if (firstToolResult.functionCall && firstToolResult.functionCall.name === "google_search_search") {
                detailedSearchResults = firstToolResult.functionResponse.json();
                console.log("Raw Google Search results obtained:", JSON.stringify(detailedSearchResults, null, 2));

                if (detailedSearchResults && detailedSearchResults.results && detailedSearchResults.results.length > 0) {
                    // 2. Second step: Pass extracted search results to the AI for summarization.
                    // We'll limit to the top 10 results to give more context to the AI.
                    const topResults = detailedSearchResults.results.slice(0, 10); 
                    
                    let resultsForSummary = "Here are some web search results:\n\n";
                    topResults.forEach((item, index) => {
                        resultsForSummary += `Title: ${item.source_title || 'N/A'}\n`;
                        resultsForSummary += `Snippet: ${item.snippet || 'N/A'}\n`;
                        resultsForSummary += `URL: ${item.url || 'N/A'}\n\n`;
                    });
                    aiSummary = resultsForSummary;
                    
                    // Model for summarization (without tools, purely text generation)
                    const summarizeModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

                    const summarizeRequestPayload = {
                        contents: [{
                            role: "user",
                            parts: [
                                { text: `Based on the following web search results, provide a concise, direct, and factual summary IN ENGLISH. State clearly the current status or answer. If results are in another language, translate and summarize accurately in English. Do not include disclaimers about your knowledge cutoff.\n\n${resultsForSummary}` }
                            ]
                        }]
                    };

                    const summarizeResult = await summarizeModel.generateContent(summarizeRequestPayload);
                    const summarizeResponse = summarizeResult.response;

                    if (summarizeResponse.text()) {
                        aiSummary = summarizeResponse.text();
                        console.log("AI Summary generated from results:", aiSummary);
                    } else {
                        console.warn("Summarization model did not return text.");
                        aiSummary = "The AI found results but could not summarize them concisely.";
                    }
                } else {
                    aiSummary = "No relevant search results found on the web.";
                    console.log("No detailed search results found.");
                }
            }
        } else if (searchResponse.text()) {
             // Fallback: If the initial response directly contains text (e.g., AI decided not to use tool, or directly answered)
             aiSummary = searchResponse.text();
             console.log("Initial AI response without tool invocation:", aiSummary);
        } else {
            console.warn("Neither toolResults nor direct text found in initial search response:", JSON.stringify(searchResponse, null, 2));
            aiSummary = "The AI encountered an issue performing the search or finding relevant information.";
        }

        if (aiSummary) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    aiSummary: aiSummary, 
                    // detailedSearchResults: detailedSearchResults // Optionally include for debugging if needed
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
