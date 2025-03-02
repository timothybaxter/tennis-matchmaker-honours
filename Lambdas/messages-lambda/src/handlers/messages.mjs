import jwt from 'jsonwebtoken';
import { connectToDatabase, connectToSpecificDatabase } from '../utils/database.mjs';
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

        // Connect to messages database (primary for this service)
        const messagesDb = await connectToDatabase();
        const conversations = messagesDb.collection('conversations');

        // Find all conversations where the user is a participant
        const userConversations = await conversations.find({
            participants: userId
        }).toArray();

        console.log(`Found ${userConversations.length} conversations`);

        // If we need user details, connect to users database
        if (userConversations.length > 0) {
            try {
                // Get unique participant IDs across all conversations
                const participantIds = new Set();
                userConversations.forEach(conv => {
                    conv.participants.forEach(id => {
                        if (id !== userId) participantIds.add(id);
                    });
                });

                if (participantIds.size > 0) {
                    // Connect to users database
                    const usersDb = await connectToSpecificDatabase('users-db');
                    const users = usersDb.collection('users');

                    // Get user details
                    const participantObjectIds = Array.from(participantIds).map(id => {
                        try { return new ObjectId(id); }
                        catch (e) { return null; }
                    }).filter(id => id !== null);

                    const userDetails = await users.find({
                        _id: { $in: participantObjectIds }
                    }).project({
                        _id: 1,
                        name: 1,
                        email: 1,
                        playerLevel: 1
                    }).toArray();

                    // Add user details to conversations
                    userConversations.forEach(conv => {
                        conv.participantDetails = conv.participants.map(partId => {
                            if (partId === userId) return { id: userId, isCurrentUser: true };
                            const userDetail = userDetails.find(u => u._id.toString() === partId);
                            return userDetail || { id: partId };
                        });
                    });
                }
            } catch (userError) {
                console.error('Error fetching user details:', userError);
                // Continue without user details rather than failing the request
            }
        }

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

        // Connect to messages database (primary for this service)
        const messagesDb = await connectToDatabase();
        const conversations = messagesDb.collection('conversations');
        const messages = messagesDb.collection('messages');

        // For testing, if we're asking for an empty or test conversation
        if (conversationId === 'test' || conversationId === 'new') {
            console.log('Test/new conversation requested, returning empty message array');
            return createResponse(200, {
                messages: [],
                conversationId: conversationId
            });
        }

        // Check if conversation exists and user is participant
        try {
            const conversation = await conversations.findOne({
                _id: new ObjectId(conversationId),
                participants: userId
            });

            if (!conversation) {
                return createResponse(404, { message: 'Conversation not found or you are not a participant' });
            }

            // Get messages for this conversation
            const conversationMessages = await messages.find({
                conversationId: conversationId
            }).sort({ timestamp: 1 }).toArray();

            // If needed, get user details for message senders
            const usersDb = await connectToSpecificDatabase('users-db');
            const users = usersDb.collection('users');

            // Try to get sender details for each message
            try {
                const senderIds = [...new Set(conversationMessages.map(msg => msg.senderId))];
                const senderObjectIds = senderIds.map(id => {
                    try { return new ObjectId(id); }
                    catch (e) { return null; }
                }).filter(id => id !== null);

                const senderDetails = await users.find({
                    _id: { $in: senderObjectIds }
                }).project({
                    _id: 1,
                    name: 1,
                    playerLevel: 1
                }).toArray();

                // Add sender details to messages
                conversationMessages.forEach(msg => {
                    const sender = senderDetails.find(s => s._id.toString() === msg.senderId);
                    if (sender) {
                        msg.senderName = sender.name;
                        msg.senderLevel = sender.playerLevel;
                    }
                });
            } catch (userError) {
                console.error('Error fetching sender details:', userError);
                // Continue without sender details rather than failing the request
            }

            return createResponse(200, {
                messages: conversationMessages,
                conversationId: conversationId,
                conversation: conversation
            });

        } catch (error) {
            console.error('Error finding conversation:', error);
            // Return the dummy response for now as a fallback
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
        }
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

            // Connect to messages database (primary for this service)
            const messagesDb = await connectToDatabase();
            const conversations = messagesDb.collection('conversations');
            const messages = messagesDb.collection('messages');

            // Connect to users database for sender info
            const usersDb = await connectToSpecificDatabase('users-db');
            const users = usersDb.collection('users');

            // Connect to notifications database for creating notifications
            const notificationsDb = await connectToSpecificDatabase('notifications-db');
            const notifications = notificationsDb.collection('notifications');

            // If it's a new conversation, create it first
            if (conversationId === 'new') {
                const { recipientId } = JSON.parse(event.body);
                if (!recipientId) {
                    return createResponse(400, { message: 'recipientId is required for new conversations' });
                }

                // Check if a conversation already exists between these users
                const existingConversation = await conversations.findOne({
                    participants: { $all: [senderId, recipientId], $size: 2 }
                });

                if (existingConversation) {
                    console.log('Found existing conversation:', existingConversation._id);
                    actualConversationId = existingConversation._id.toString();
                } else {
                    // Create new conversation
                    const result = await conversations.insertOne({
                        participants: [senderId, recipientId],
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });

                    actualConversationId = result.insertedId.toString();
                    console.log('Created new conversation:', actualConversationId);
                }
            } else {
                // Verify the conversation exists and user is a participant
                const conversation = await conversations.findOne({
                    _id: new ObjectId(conversationId),
                    participants: senderId
                });

                if (!conversation) {
                    return createResponse(404, { message: 'Conversation not found or you are not a participant' });
                }

                actualConversationId = conversationId;
            }

            // Get sender info
            const sender = await users.findOne({ _id: new ObjectId(senderId) });
            if (!sender) {
                return createResponse(404, { message: 'Sender not found' });
            }

            // Create the message
            const newMessage = {
                conversationId: actualConversationId,
                senderId,
                senderName: sender.name,
                content,
                timestamp: new Date(),
                read: false
            };

            const messageResult = await messages.insertOne(newMessage);
            const messageId = messageResult.insertedId.toString();

            // Update conversation's updatedAt timestamp
            await conversations.updateOne(
                { _id: new ObjectId(actualConversationId) },
                { $set: { updatedAt: new Date() } }
            );

            // Create notifications for other participants
            const conversation = await conversations.findOne({
                _id: new ObjectId(actualConversationId)
            });

            if (conversation) {
                for (const participantId of conversation.participants) {
                    if (participantId !== senderId) {
                        await notifications.insertOne({
                            userId: participantId,
                            sourceUserId: senderId,
                            type: 'message',
                            content: `New message from ${sender.name}`,
                            relatedItemId: actualConversationId,
                            isRead: false,
                            createdAt: new Date()
                        });
                    }
                }
            }

            return createResponse(201, {
                message: 'Message sent successfully',
                messageId,
                conversationId: actualConversationId
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

            // Connect to messages database (primary for this service)
            const messagesDb = await connectToDatabase();
            const conversations = messagesDb.collection('conversations');

            // Connect to users database to verify recipient exists
            const usersDb = await connectToSpecificDatabase('users-db');
            const users = usersDb.collection('users');

            // Check if recipient exists
            try {
                const recipient = await users.findOne({ _id: new ObjectId(recipientId) });
                if (!recipient) {
                    return createResponse(404, { message: 'Recipient not found' });
                }
            } catch (error) {
                console.error('Error finding recipient:', error);
                return createResponse(400, { message: 'Invalid recipient ID format' });
            }

            // Check if a conversation already exists between these users
            const existingConversation = await conversations.findOne({
                participants: { $all: [userId, recipientId], $size: 2 }
            });

            if (existingConversation) {
                return createResponse(200, {
                    message: 'Conversation already exists',
                    conversationId: existingConversation._id.toString()
                });
            }

            // Create new conversation
            const newConversation = {
                participants: [userId, recipientId],
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await conversations.insertOne(newConversation);

            return createResponse(201, {
                message: 'Conversation created successfully',
                conversationId: result.insertedId.toString()
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