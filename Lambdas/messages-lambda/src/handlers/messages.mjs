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
        const users = db.collection('users');

        // Find all conversations where the user is a participant
        const userConversations = await conversations.find({
            participants: userId
        }).toArray();

        console.log(`Found ${userConversations.length} conversations`);

        // Get details for other participants in each conversation
        const detailedConversations = await Promise.all(userConversations.map(async (conversation) => {
            // Get the IDs of the other participants
            const otherParticipantIds = conversation.participants.filter(id => id !== userId);

            // Get user details for the other participants
            const participantDetails = [];
            for (const participantId of otherParticipantIds) {
                try {
                    const user = await users.findOne({ _id: new ObjectId(participantId) });
                    if (user) {
                        // Exclude sensitive data
                        const { password, ...userInfo } = user;
                        participantDetails.push(userInfo);
                    }
                } catch (error) {
                    console.error(`Error getting user ${participantId}:`, error);
                }
            }

            // Get the most recent message
            const messages = db.collection('messages');
            const latestMessage = await messages.findOne(
                { conversationId: conversation._id.toString() },
                { sort: { timestamp: -1 } }
            );

            return {
                id: conversation._id,
                participants: participantDetails,
                lastMessage: latestMessage,
                unreadCount: conversation.unreadCounts?.[userId] || 0,
                createdAt: conversation.createdAt
            };
        }));

        return createResponse(200, { conversations: detailedConversations });
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
        const conversationId = event.pathParameters.id;

        console.log(`Getting messages for conversation ${conversationId} for user ${userId}`);

        if (!conversationId) {
            return createResponse(400, { message: 'Conversation ID is required' });
        }

        const db = await connectToDatabase();
        const conversations = db.collection('conversations');
        const messages = db.collection('messages');

        // Check if the conversation exists and the user is a participant
        let conversation;
        try {
            // Handle if the ID is "new" which indicates a new conversation
            if (conversationId.toLowerCase() === 'new') {
                const otherUserId = event.queryStringParameters?.userId;
                if (!otherUserId) {
                    return createResponse(400, { message: 'User ID is required for new conversation' });
                }

                // Check if a conversation already exists with these participants
                conversation = await conversations.findOne({
                    participants: { $all: [userId, otherUserId], $size: 2 }
                });

                if (!conversation) {
                    // Return empty messages array for new conversation
                    return createResponse(200, { messages: [], conversationId: 'new', otherUserId });
                }
            } else {
                // For existing conversation
                conversation = await conversations.findOne({
                    _id: new ObjectId(conversationId),
                    participants: userId
                });
            }
        } catch (error) {
            console.error('Error finding conversation:', error);
            return createResponse(400, { message: 'Invalid conversation ID format' });
        }

        if (!conversation) {
            return createResponse(404, { message: 'Conversation not found or not authorized' });
        }

        // Reset unread count for this user
        if (conversation.unreadCounts && conversation.unreadCounts[userId] > 0) {
            const update = { $set: {} };
            update.$set[`unreadCounts.${userId}`] = 0;

            await conversations.updateOne(
                { _id: conversation._id },
                update
            );
        }

        // Get messages for this conversation
        const limit = parseInt(event.queryStringParameters?.limit) || 50;
        const conversationMessages = await messages.find({
            conversationId: conversation._id.toString()
        })
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();

        console.log(`Found ${conversationMessages.length} messages`);

        return createResponse(200, {
            messages: conversationMessages.reverse(),
            conversationId: conversation._id.toString()
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
        const { conversationId, content, recipientId } = JSON.parse(event.body);

        console.log(`Processing send message request for user ${senderId} to conversation ${conversationId || 'new'}`);

        if (!content) {
            return createResponse(400, { message: 'Message content is required' });
        }

        const db = await connectToDatabase();
        const conversations = db.collection('conversations');
        const messages = db.collection('messages');
        const users = db.collection('users');

        // Get sender's name
        const sender = await users.findOne({ _id: new ObjectId(senderId) });
        if (!sender) {
            return createResponse(404, { message: 'Sender not found' });
        }

        let actualConversationId;

        // Check if this is a new conversation or existing one
        if (!conversationId || conversationId === 'new') {
            if (!recipientId) {
                return createResponse(400, { message: 'Recipient ID is required for new conversation' });
            }

            // Check if the recipient exists
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
                participants: { $all: [senderId, recipientId], $size: 2 }
            });

            if (existingConversation) {
                actualConversationId = existingConversation._id.toString();
            } else {
                // Create a new conversation
                const newConversation = {
                    participants: [senderId, recipientId],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    unreadCounts: {
                        [recipientId]: 1
                    }
                };

                const result = await conversations.insertOne(newConversation);
                actualConversationId = result.insertedId.toString();
                console.log(`Created new conversation with ID: ${actualConversationId}`);
            }
        } else {
            try {
                // Verify the conversation exists and the user is a participant
                const conversation = await conversations.findOne({
                    _id: new ObjectId(conversationId),
                    participants: senderId
                });

                if (!conversation) {
                    return createResponse(404, { message: 'Conversation not found or not authorized' });
                }

                actualConversationId = conversationId;

                // Update the unread counts for all other participants
                const update = { $set: { updatedAt: new Date() } };
                for (const participant of conversation.participants) {
                    if (participant !== senderId) {
                        update.$set[`unreadCounts.${participant}`] = (conversation.unreadCounts?.[participant] || 0) + 1;
                    }
                }

                await conversations.updateOne({ _id: conversation._id }, update);
            } catch (error) {
                console.error('Error finding conversation:', error);
                return createResponse(400, { message: 'Invalid conversation ID format' });
            }
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
        console.log(`Created new message with ID: ${messageResult.insertedId.toString()}`);

        // Create a notification for recipient(s)
        const conversation = await conversations.findOne({ _id: new ObjectId(actualConversationId) });
        if (conversation) {
            const notifications = db.collection('notifications');
            for (const participantId of conversation.participants) {
                if (participantId !== senderId) {
                    const notification = {
                        userId: participantId,
                        sourceUserId: senderId,
                        type: 'message',
                        content: `New message from ${sender.name}`,
                        relatedItemId: actualConversationId,
                        isRead: false,
                        createdAt: new Date()
                    };
                    await notifications.insertOne(notification);
                    console.log(`Created notification for ${participantId}`);
                }
            }
        }

        return createResponse(201, {
            message: 'Message sent successfully',
            messageId: messageResult.insertedId.toString(),
            conversationId: actualConversationId
        });
    } catch (error) {
        console.error('Send message error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error sending message', error: error.message });
    }
}

// Create a new conversation (without sending a message)
export async function createConversation(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const { recipientId } = JSON.parse(event.body);

        if (!recipientId) {
            return createResponse(400, { message: 'Recipient ID is required' });
        }

        const db = await connectToDatabase();
        const conversations = db.collection('conversations');
        const users = db.collection('users');

        // Check if the recipient exists
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

        // Create a new conversation
        const newConversation = {
            participants: [userId, recipientId],
            createdAt: new Date(),
            updatedAt: new Date(),
            unreadCounts: {}
        };

        const result = await conversations.insertOne(newConversation);
        return createResponse(201, {
            message: 'Conversation created successfully',
            conversationId: result.insertedId.toString()
        });
    } catch (error) {
        console.error('Create conversation error:', error);
        return createResponse(500, { message: 'Error creating conversation' });
    }
}

// Helper function to extract and verify JWT token
function extractAndVerifyToken(event) {
    const authHeader = event.headers.Authorization ||
        event.headers.authorization ||
        event.headers['Authorization'] ||
        event.headers['authorization'];

    if (!authHeader) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'No authorization token provided' })
        };
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid authorization format' })
        };
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return {
            isValid: true,
            decoded
        };
    } catch (error) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid token' })
        };
    }
}