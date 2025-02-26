import { register, login, updateUser } from './handlers/auth.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    switch (`${event.httpMethod} ${event.resource}`) {
        case 'POST /auth/register':
            return await register(event);
        case 'POST /auth/login':
            return await login(event);
        case 'POST /auth/update-user':
            return await updateUser(event);
        default:
            return createResponse(404, { message: 'Route not found', route: `${event.httpMethod} ${event.resource}` });
    }
};