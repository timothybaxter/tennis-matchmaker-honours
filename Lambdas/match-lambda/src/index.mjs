import { createMatch, getMatches, getMatch, deleteMatch, updateMatch, getActiveMatches } from './handlers/match.mjs';
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
        case 'GET /matches/{id}':
            return await getMatch(event);
        case 'DELETE /matches/{id}':
            return await deleteMatch(event);
        case 'PUT /matches/{id}':
            return await updateMatch(event);
        case 'GET /matches/active':
            return await getActiveMatches(event);
        default:
            return createResponse(404, { message: 'Route not found' });
    }
};