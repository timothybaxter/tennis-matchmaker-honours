import { getTournaments, getTournamentById, createTournament, joinTournament, startTournament, submitMatchResult, resolveDisputedMatch, resetMatchSubmission } from './handlers/tournaments.mjs';
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

        // GET /tournaments
        if (method === 'GET' && resource === '/tournaments') {
            return await getTournaments(event);
        }

        // GET /tournaments/{id}
        else if (method === 'GET' && resource === '/tournaments/{id}') {
            return await getTournamentById(event);
        }

        // POST /tournaments (create tournament)
        else if (method === 'POST' && resource === '/tournaments') {
            return await createTournament(event);
        }

        // POST /tournaments/{id}/join
        else if (method === 'POST' && resource === '/tournaments/{id}/join') {
            return await joinTournament(event);
        }

        // POST /tournaments/{id}/start
        else if (method === 'POST' && resource === '/tournaments/{id}/start') {
            return await startTournament(event);
        }

        // POST /tournaments/{id}/matches/{matchId}/result
        else if (method === 'POST' && resource === '/tournaments/{id}/matches/{matchId}/result') {
            return await submitMatchResult(event);
        }

        // POST /tournaments/{id}/matches/{matchId}/reset
        else if (method === 'POST' && resource === '/tournaments/{id}/matches/{matchId}/reset') {
            return await resetMatchSubmission(event);
        }

        // POST /tournaments/{id}/matches/{matchId}/resolve
        else if (method === 'POST' && resource === '/tournaments/{id}/matches/{matchId}/resolve') {
            return await resolveDisputedMatch(event);
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