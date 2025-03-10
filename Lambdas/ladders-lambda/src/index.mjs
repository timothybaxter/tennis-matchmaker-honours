import { getLadders, getLadderById, createLadder, joinLadder, issueChallenge, respondToChallenge, submitMatchResult, resolveDisputedMatch, leaveLadder, resetMatchSubmission } from './handlers/ladders.mjs';
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

        // GET /ladders
        if (method === 'GET' && resource === '/ladders') {
            return await getLadders(event);
        }

        // GET /ladders/{id}
        else if (method === 'GET' && resource === '/ladders/{id}') {
            return await getLadderById(event);
        }

        // POST /ladders (create ladder)
        else if (method === 'POST' && resource === '/ladders') {
            return await createLadder(event);
        }

        // POST /ladders/{id}/join
        else if (method === 'POST' && resource === '/ladders/{id}/join') {
            return await joinLadder(event);
        }

        // POST /ladders/{id}/challenge
        else if (method === 'POST' && resource === '/ladders/{id}/challenge') {
            return await issueChallenge(event);
        }

        // POST /ladders/{id}/matches/{matchId}/respond
        else if (method === 'POST' && resource === '/ladders/{id}/matches/{matchId}/respond') {
            return await respondToChallenge(event);
        }

        // POST /ladders/{id}/matches/{matchId}/result
        else if (method === 'POST' && resource === '/ladders/{id}/matches/{matchId}/result') {
            return await submitMatchResult(event);
        }

        // POST /ladders/{id}/matches/{matchId}/reset
        else if (method === 'POST' && resource === '/ladders/{id}/matches/{matchId}/reset') {
            return await resetMatchSubmission(event);
        }

        // POST /ladders/{id}/matches/{matchId}/resolve
        else if (method === 'POST' && resource === '/ladders/{id}/matches/{matchId}/resolve') {
            return await resolveDisputedMatch(event);
        }

        // POST /ladders/{id}/leave
        else if (method === 'POST' && resource === '/ladders/{id}/leave') {
            return await leaveLadder(event);
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