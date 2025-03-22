import {
    createMatch,
    getMatches,
    getMatch,
    deleteMatch,
    updateMatch,
    getActiveMatches,
    // New match request functions
    requestMatch,
    getMatchRequests,
    respondToMatchRequest,
    cancelMatchRequest,
    getRequestedMatches,
    dismissRejectedRequest
} from './handlers/match.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    const routeKey = `${event.httpMethod} ${event.resource}`;
    console.log('Route key:', routeKey);

    switch (routeKey) {
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
        case 'POST /matches/{id}/request':
            return await requestMatch(event);
        case 'GET /matches/{id}/requests':
            return await getMatchRequests(event);
        case 'POST /matches/{id}/respond':
            return await respondToMatchRequest(event);
        case 'POST /matches/{id}/cancel-request':
            return await cancelMatchRequest(event);
        case 'GET /matches/user/requests':
            return await getRequestedMatches(event);
        case 'POST /matches/{id}/dismiss-rejected':
            return await dismissRejectedRequest(event);

        default:
            console.error('Unknown route:', routeKey);
            return createResponse(404, {
                message: 'Route not found',
                route: routeKey,
                method: event.httpMethod,
                resource: event.resource
            });
    }
};