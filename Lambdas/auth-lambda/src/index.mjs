import { register, login, updateUser, updatePassword } from './handlers/auth.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event received:', event);

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    switch (`${event.httpMethod} ${event.resource}`) {
        case 'POST /auth/register':
            return await register(event);
        case 'POST /auth/login':
            return await login(event);
        case 'PUT /auth/user/{id}':
            return await updateUser(event);
        case 'PUT /auth/password/{id}':
            return await updatePassword(event);
        default:
            return createResponse(404, { message: 'Route not found' });
    }
};