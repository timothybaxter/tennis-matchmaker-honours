import { getMatchHistory, getMatchById, getActiveMatches, getUserStats } from './handlers/competitiveMatches.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    try {
        // Route based on HTTP method and resource pattern
        const method = event.httpMethod;
        const resource = event.resource;

        console.log(`Processing ${method} ${resource}`);

        // GET /comp-matches/history
        if (method === 'GET' && resource === '/comp-matches/history') {
            return await getMatchHistory(event);
        }
        // GET /comp-matches/{id}
        else if (method === 'GET' && resource === '/comp-matches/{id}') {
            return await getMatchById(event);
        }
        // GET /comp-matches/active
        else if (method === 'GET' && resource === '/comp-matches/active') {
            return await getActiveMatches(event);
        }
        // GET /comp-matches/stats
        else if (method === 'GET' && resource === '/comp-matches/stats') {
            return await getUserStats(event);
        }

        // No route match
        else {
            return createResponse(404, {
                message: 'Route not found',
                method,
                resource
            });
        }
    } catch (error) {
        console.error('Handler error:', error);
        return createResponse(500, {
            message: 'Internal server error',
            error: error.message
        });
    }
};