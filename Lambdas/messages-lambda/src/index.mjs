import { getConversations, getMessages, sendMessage, createConversation, markConversationRead } from './handlers/messages.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    try {
        // Match routes using resource and HTTP method
        const method = event.httpMethod;
        const resource = event.resource;

        console.log(`Processing ${method} request to ${resource}`);

        // Add detailed logging for id
        if (event.pathParameters && event.pathParameters.id) {
            console.log(`Path parameter id: ${event.pathParameters.id}`);
        }

        // Route: GET /messages/conversations
        if (method === 'GET' && resource === '/messages/conversations') {
            return await getConversations(event);
        }

        // Route: GET /messages/{id}
        else if (method === 'GET' && resource === '/messages/{id}') {
            console.log('Routing to getMessages handler');
            return await getMessages(event);
        }

        // Route: POST /messages (send message)
        else if (method === 'POST' && resource === '/messages') {
            return await sendMessage(event);
        }

        // Route: POST /messages/conversation (create conversation)
        else if (method === 'POST' && resource === '/messages/conversation') {
            return await createConversation(event);
        }
        else if (method === 'POST' && resource === '/messages/conversation/read') {
            return await markConversationRead(event);
        }

        // No route match
        else {
            console.log(`No route match for ${method} ${resource}`);
            return createResponse(404, {
                message: 'Route not found',
                method: method,
                resource: resource
            });
        }
    } catch (error) {
        console.error('Handler error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, {
            message: 'Internal server error',
            error: error.message,
            stack: error.stack
        });
    }
};