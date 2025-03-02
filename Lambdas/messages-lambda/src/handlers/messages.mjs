import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';

// Get all conversations for a user
export async function getConversations(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        console.log('Getting conversations for user:', userId);

        const db = await connectToDatabase();
        const conversations = db.collection('conversations');

        // Find all conversations where the user is a participant
        const userConversations = await conversations.find({
            participants: userId
        }).toArray();

        console.log(`Found ${userConversations.length} conversations`);

        // Return conversations directly (simplify for now)
        return createResponse(200, { conversations: userConversations });
    } catch (error) {
        console.error('Get conversations error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error retrieving conversations', error: error.message });
    }
}

// Get messages for a specific conversation
export async function getMessages(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;

        // Log all event properties to help debug
        console.log('Full event object:', JSON.stringify(event));
        console.log('Path parameters:', JSON.stringify(event.pathParameters));

        // Get conversation ID from path parameters - use id as the parameter name
        const conversationId = event.pathParameters?.id;

        console.log(`Extracting conversationId from request: ${conversationId}`);

        if (!conversationId) {
            return createResponse(400, { message: 'Conversation ID is required but was not found in the request' });
        }

        // For testing, if we're asking for an empty or test conversation
        if (conversationId === 'test' || conversationId === 'new') {
            console.log('Test/new conversation requested, returning empty message array');
            return createResponse(200, {
                messages: [],
                conversationId: conversationId
            });
        }

        // Return a dummy response for now to see if the route works
        return createResponse(200, {
            messages: [
                {
                    id: '1',
                    senderId: 'system',
                    senderName: 'System',
                    content: 'Welcome to the conversation',
                    timestamp: new Date().toISOString(),
                    read: false
                }
            ],
            conversationId: conversationId
        });
    } catch (error) {
        console.error('Get messages error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error retrieving messages', error: error.message });
    }
}

// Send a message
export async function sendMessage(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const senderId = token.decoded.userId;
        console.log('Received send message request from:', senderId);

        // Log request body
        console.log('Request body:', event.body);

        try {
            const { conversationId, content } = JSON.parse(event.body);

            if (!conversationId || !content) {
                console.error('Missing required field in request body');
                return createResponse(400, { message: 'conversationId and content are required' });
            }

            // For now, just return success to test API
            return createResponse(201, {
                message: 'Message sent successfully',
                messageId: 'temp-' + Date.now(),
                conversationId: conversationId,
                content: content,
                timestamp: new Date().toISOString()
            });
        } catch (parseError) {
            console.error('Error parsing message request body:', parseError);
            return createResponse(400, { message: 'Invalid JSON in request body' });
        }
    } catch (error) {
        console.error('Send message error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error sending message', error: error.message });
    }
}

// Create a new conversation
export async function createConversation(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;

        try {
            const { recipientId } = JSON.parse(event.body);

            if (!recipientId) {
                return createResponse(400, { message: 'Recipient ID is required' });
            }

            // For now, just return success to test API
            return createResponse(201, {
                message: 'Conversation created successfully',
                conversationId: 'temp-' + Date.now(),
                participants: [userId, recipientId]
            });
        } catch (parseError) {
            console.error('Error parsing create conversation request body:', parseError);
            return createResponse(400, { message: 'Invalid JSON in request body' });
        }
    } catch (error) {
        console.error('Create conversation error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error creating conversation', error: error.message });
    }
}

// Helper function to extract and verify JWT token
function extractAndVerifyToken(event) {
    console.log('Headers:', JSON.stringify(event.headers));
    const authHeader = event.headers.Authorization ||
        event.headers.authorization ||
        event.headers['Authorization'] ||
        event.headers['authorization'];

    if (!authHeader) {
        console.error('No authorization header found');
        return {
            isValid: false,
            response: createResponse(401, { message: 'No authorization token provided' })
        };
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        console.error('Invalid authorization format');
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid authorization format' })
        };
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded token:', JSON.stringify(decoded));
        return {
            isValid: true,
            decoded
        };
    } catch (error) {
        console.error('Token verification error:', error.message);
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid token' })
        };
    }
}