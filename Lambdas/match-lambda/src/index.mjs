import { createMatch, getMatches } from './handlers/match.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    switch (`${event.httpMethod} ${event.resource}`) {
        case 'POST /matches':
            return await createMatch(event);
        case 'GET /matches':
            return await getMatches(event);
        default:
            return createResponse(404, { message: 'Route not found' });
    }
};