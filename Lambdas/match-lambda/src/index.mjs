// match-lambda/src/index.mjs
import { createMatch, getMatches } from './handlers/match.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    const route = `${event.httpMethod} ${event.resource}`;

    switch (route) {
        case 'POST /matches':
            return await createMatch(event);
        case 'GET /matches':
            return await getMatches(event);
        default:
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Route not found' })
            };
    }
};