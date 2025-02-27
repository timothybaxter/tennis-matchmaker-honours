import { getConversations, getMessages, sendMessage } from './handlers/messages.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    switch (`${event.httpMethod} ${event.resource}`) {
        case 'GET /messages/conversations':
            return await getConversations(event);
        case 'GET /messages/{conversationId}':
            return await getMessages(event);
        case 'POST /messages':
            return await sendMessage(event);
        default:
            return createResponse(404, { message: 'Route not found', route: `${event.httpMethod} ${event.resource}` });
    }
};