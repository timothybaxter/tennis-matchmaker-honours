// src/handlers/messages.mjs
import jwt from 'jsonwebtoken';
import { connectToDatabase, connectToSpecificDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';
import fetch from 'node-fetch';

export async function getConversations(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        console.log('Getting conversations for user:', userId);

        // Connect to messages database
        const messagesDb = await connectToDatabase();
        const conversations = messagesDb.collection('conversations');
        const messagesCollection = messagesDb.collection('messages');

        // Find all conversations where the user is a participant
        const userConversations = await conversations.find({
            participants: userId
        }).toArray();

        console.log(`Found ${userConversations.length} conversations`);

        // Format for frontend
        const formattedConversations = [];

        // Connect to users database
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Process each conversation
        for (const conv of userConversations) {
            try {
                // 1. Find the other participant (not current user)
                const otherParticipantId = conv.participants.find(id => id !== userId);
                if (!otherParticipantId) continue;

                // 2. Get other user details
                let otherUser = null;
                try {
                    otherUser = await users.findOne({ _id: new ObjectId(otherParticipantId) });
                } catch (err) {
                    console.error(`Error finding user with ID ${otherParticipantId}:`, err);
                }

                // 3. Get last message
                const lastMessage = await messagesCollection.findOne(
                    { conversationId: conv._id.toString() },
                    { sort: { timestamp: -1 } }
                );

                // 4. Format the conversation for frontend
                formattedConversations.push({
                    conversationId: conv._id.toString(),
                    otherUser: otherUser ? {
                        id: otherParticipantId,
                        name: otherUser.name || 'Unknown User',
                        playerLevel: otherUser.playerLevel || 'Beginner'
                    } : {
                        id: otherParticipantId,
                        name: 'Unknown User',
                        playerLevel: 'Beginner'
                    },
                    lastMessageAt: lastMessage?.timestamp || conv.updatedAt || conv.createdAt,
                    unreadCount: await messagesCollection.countDocuments({
                        conversationId: conv._id.toString(),
                        senderId: { $ne: userId },
                        read: false
                    })
                });
            } catch (err) {
                console.error('Error processing conversation:', err);
            }
        }

        console.log('Returning formatted conversations:', JSON.stringify(formattedConversations));
        return createResponse(200, { conversations: formattedConversations });
    } catch (error) {
        console.error('Get conversations error:', error);
        return createResponse(500, { message: 'Error retrieving conversations', error: error.message });
    }
}
// Mark all messages in a conversation as read
export async function markConversationRead(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        console.log(`Marking all messages as read for user ${userId}`);

        try {
            const { conversationId } = JSON.parse(event.body);

            if (!conversationId) {
                return createResponse(400, { message: 'Conversation ID is required' });
            }

            // Connect to messages database
            const messagesDb = await connectToDatabase();
            const messagesCollection = messagesDb.collection('messages');
            const conversations = messagesDb.collection('conversations');

            // Verify user is part of this conversation
            const conversation = await conversations.findOne({
                _id: new ObjectId(conversationId),
                participants: userId
            });

            if (!conversation) {
                return createResponse(404, { message: 'Conversation not found or you are not a participant' });
            }

            // Update all unread messages in this conversation that weren't sent by this user
            const result = await messagesCollection.updateMany(
                {
                    conversationId: conversationId,
                    senderId: { $ne: userId },
                    read: false
                },
                {
                    $set: {
                        read: true,
                        readAt: new Date()
                    }
                }
            );

            return createResponse(200, {
                message: `${result.modifiedCount} messages marked as read`,
                modifiedCount: result.modifiedCount
            });
        } catch (parseError) {
            console.error('Error parsing request body:', parseError);
            return createResponse(400, { message: 'Invalid JSON in request body' });
        }
    } catch (error) {
        console.error('Mark conversation read error:', error);
        return createResponse(500, { message: 'Error marking messages as read', error: error.message });
    }
}
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

export async function sendMessage(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const senderId = token.decoded.userId;
        console.log('🔹 Received send message request from:', senderId);

        // Ensure request body exists
        if (!event.body) {
            console.error('❌ Request body is missing');
            return createResponse(400, { message: 'Request body is required' });
        }

        let parsedBody;
        try {
            parsedBody = JSON.parse(event.body);
            console.log('🔹 Parsed request body:', JSON.stringify(parsedBody, null, 2));
        } catch (error) {
            console.error('❌ Error parsing JSON:', error.message, 'Body:', event.body);
            return createResponse(400, { message: 'Invalid JSON format', details: error.message });
        }

        // Extract fields from the parsed body
        const { conversationId, content, recipientId } = parsedBody;

        // Validate required fields with detailed errors
        if (!conversationId) {
            console.error('❌ Missing conversationId');
            return createResponse(400, { message: 'conversationId is required' });
        }

        if (!content) {
            console.error('❌ Missing content');
            return createResponse(400, { message: 'content is required' });
        }

        if (typeof content !== 'string' || content.trim() === '') {
            console.error('❌ Invalid content format:', content);
            return createResponse(400, { message: 'content must be a non-empty string' });
        }

        let actualConversationId = conversationId;

        // Connect to databases
        const messagesDb = await connectToDatabase();
        const conversations = messagesDb.collection('conversations');
        const messages = messagesDb.collection('messages');
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Handle new conversation case
        if (conversationId === 'new') {
            if (!recipientId) {
                console.error('❌ recipientId is missing for a new conversation');
                return createResponse(400, { message: 'recipientId is required for new conversations' });
            }

            console.log('🔹 Checking if a conversation already exists between', senderId, 'and', recipientId);
            const existingConversation = await conversations.findOne({
                participants: { $all: [senderId, recipientId], $size: 2 }
            });

            if (existingConversation) {
                console.log('✅ Found existing conversation:', existingConversation._id);
                actualConversationId = existingConversation._id.toString();
            } else {
                console.log('🔹 Creating a new conversation...');
                const result = await conversations.insertOne({
                    participants: [senderId, recipientId],
                    createdAt: new Date(),
                    updatedAt: new Date()
                });

                actualConversationId = result.insertedId.toString();
                console.log('✅ Created new conversation:', actualConversationId);
            }
        } else {
            // Validate `conversationId` format for existing conversations
            let conversationObjectId;
            try {
                conversationObjectId = new ObjectId(conversationId);
            } catch (error) {
                console.error('❌ Invalid conversation ID format:', conversationId);
                return createResponse(400, { message: 'Invalid conversation ID format' });
            }

            // Verify that conversation exists and sender is a participant
            console.log('🔹 Checking if conversation exists:', conversationId);
            const conversation = await conversations.findOne({
                _id: conversationObjectId,
                participants: senderId
            });

            if (!conversation) {
                console.error('❌ Conversation not found or sender is not a participant:', conversationId);
                return createResponse(404, { message: 'Conversation not found or you are not a participant' });
            }

            actualConversationId = conversationId;
        }

        // Fetch sender details
        let sender;
        try {
            sender = await users.findOne({ _id: new ObjectId(senderId) });
            if (!sender) {
                console.error('❌ Sender not found in database:', senderId);
                return createResponse(404, { message: 'Sender not found' });
            }
        } catch (error) {
            console.error('❌ Error finding sender:', error);
            return createResponse(500, { message: 'Error finding sender', error: error.message });
        }

        // Create the message object
        const newMessage = {
            conversationId: actualConversationId,
            senderId,
            senderName: sender.name,
            content,
            timestamp: new Date(),
            read: false
        };

        // Insert message into database
        try {
            const messageResult = await messages.insertOne(newMessage);
            console.log('✅ Message saved:', messageResult.insertedId.toString());

            // Update conversation's last activity
            await conversations.updateOne(
                { _id: new ObjectId(actualConversationId) },
                { $set: { updatedAt: new Date() } }
            );
        } catch (error) {
            console.error('❌ Error saving message:', error);
            return createResponse(500, { message: 'Error saving message', error: error.message });
        }

        return createResponse(201, {
            message: 'Message sent successfully',
            conversationId: actualConversationId
        });
    } catch (error) {
        console.error('❌ Send message error:', error);
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

            const messagesDb = await connectToDatabase();
            const conversations = messagesDb.collection('conversations');

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
            decoded,
            original: token  
        };
    } catch (error) {
        console.error('Token verification error:', error.message);
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid token' })
        };
    }
}

// Mark message as read
export async function markMessageRead(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        console.log('Marking message as read for user:', userId);

        try {
            const { messageId } = JSON.parse(event.body);

            if (!messageId) {
                return createResponse(400, { message: 'Message ID is required' });
            }

            // Connect to messages database
            const messagesDb = await connectToDatabase();
            const messagesCollection = messagesDb.collection('messages');

            // Find the message and verify the current user is a recipient
            try {
                const messageObjectId = new ObjectId(messageId);
                const message = await messagesCollection.findOne({ _id: messageObjectId });

                if (!message) {
                    return createResponse(404, { message: 'Message not found' });
                }

                // Only mark as read if the user is not the sender
                if (message.senderId !== userId) {
                    await messagesCollection.updateOne(
                        { _id: messageObjectId },
                        { $set: { read: true, readAt: new Date() } }
                    );
                    return createResponse(200, { message: 'Message marked as read' });
                } else {
                    return createResponse(200, { message: 'No action needed - user is sender' });
                }
            } catch (error) {
                console.error('Error processing message update:', error);
                return createResponse(400, { message: 'Invalid message ID format' });
            }
        } catch (parseError) {
            console.error('Error parsing mark message read request body:', parseError);
            return createResponse(400, { message: 'Invalid JSON in request body' });
        }
    } catch (error) {
        console.error('Mark message read error:', error);
        return createResponse(500, { message: 'Error marking message as read', error: error.message });
    }
}