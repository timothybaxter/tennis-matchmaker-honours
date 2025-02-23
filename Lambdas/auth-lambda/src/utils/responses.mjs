export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: corsHeaders,
        body: JSON.stringify(body)
    };
}

export function createCorsResponse() {
    return {
        statusCode: 200,
        headers: corsHeaders,
        body: ''
    };
}